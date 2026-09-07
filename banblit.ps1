#requires -Version 5.1
<#
.SYNOPSIS
Banblit 개발 환경을 한 번에 띄우고 내립니다.

.DESCRIPTION
COMMAND.md 의 4-2(migration), 10-1(frontend), 13-1(자동 배정), 3-3(종료)을 한 순서로 묶은 것입니다.
개별 docker 명령의 뜻과 주의점은 COMMAND.md 가 정본입니다. 이 파일은 순서와 대기만 담습니다.

.EXAMPLE
banblit
banblit up -Auto
banblit logs api -Follow
banblit down
#>

[CmdletBinding()]
param(
    # ValidateSet 을 쓰지 않는다 — 잘못 친 이름에도 PowerShell 의 오류 대신 도움말을 보이려는 것이다.
    [Parameter(Position = 0)]
    [string] $Command = 'up',

    # logs·restart 의 대상 service. 비우면 전부.
    [Parameter(Position = 1)]
    [ValidateSet('', 'api', 'web', 'db', 'auto-assign')]
    [string] $Service = '',

    # 자동 배정 service 까지 띄운다. 개발용 override 가 기본을 꺼짐으로 두므로 이 switch 로만 켠다.
    [switch] $Auto,

    # down 에서 volume 까지 지운다. DB·첨부파일·테스트용 DB 가 전부 사라진다.
    [switch] $Volumes,

    # up 에서 browser 를 열지 않는다.
    [switch] $NoBrowser,

    # logs 를 붙잡고 계속 본다.
    [switch] $Follow,

    # 개발용 image 를 무조건 다시 만든다. 평소에는 Test-ImageStale 이 판단한다.
    [switch] $Build
)

$ErrorActionPreference = 'Stop'

$DEV_IMAGE = 'banblit-backend:dev'
$WEB_URL = 'http://localhost:5173/'
$API_HEALTH_URL = 'http://localhost:8000/health'

# 첫 기동은 container 안에서 npm install 이 돌아 몇 분 걸린다.
$WEB_TIMEOUT_SECONDS = 420
$API_TIMEOUT_SECONDS = 120

function Write-Step([string] $text) {
    Write-Host ""
    Write-Host "== $text" -ForegroundColor Cyan
}

function Write-Note([string] $text) {
    Write-Host "   $text" -ForegroundColor DarkGray
}

function Write-Fail([string] $text) {
    Write-Host "!! $text" -ForegroundColor Red
}

function Invoke-Native([scriptblock] $Action) {
    # 네이티브 명령이 stderr 로 출력하면 PowerShell 5.1 은 그것을 오류 레코드로 감싼다.
    # $ErrorActionPreference 가 Stop 인 채로 두면 그 자리에서 멈추므로 잠시 내린다.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Action
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Invoke-Compose([string[]] $ComposeArgs) {
    # docker compose 는 실패해도 예외를 던지지 않으므로 종료 코드를 직접 확인한다.
    & docker compose @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($ComposeArgs -join ' ') 가 종료 코드 $LASTEXITCODE 로 실패했습니다."
    }
}

function Get-EnvValue([string] $Key) {
    # docker compose 가 읽는 것과 같은 .env 에서 값을 꺼낸다. 이름을 코드에 박지 않기 위해서다.
    $envFile = Join-Path $PSScriptRoot '.env'
    if (-not (Test-Path $envFile)) { return '' }
    foreach ($line in Get-Content $envFile -Encoding UTF8) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*?)\s*$") {
            return $Matches[1].Trim('"').Trim("'")
        }
    }
    return ''
}

function Test-ImageStale {
    # dependency 를 추가하고 image 를 다시 만들지 않으면 uvicorn 이 import 단계에서 죽는다.
    # python-multipart 가 빠져 실제로 죽은 적이 있다(COMMAND.md 1-1-1).
    # lock 파일이 image 보다 새로우면 낡은 것으로 판단한다.
    $created = Invoke-Native {
        (& docker image inspect $DEV_IMAGE --format '{{.Created}}' 2>$null | Out-String).Trim()
    }
    if ([string]::IsNullOrWhiteSpace($created)) { return $true }

    $builtAt = [datetime]::Parse($created).ToUniversalTime()
    foreach ($name in @('pyproject.toml', 'uv.lock', 'Dockerfile')) {
        $file = Get-Item (Join-Path $PSScriptRoot "backend/$name") -ErrorAction SilentlyContinue
        if ($null -ne $file -and $file.LastWriteTimeUtc -gt $builtAt) { return $true }
    }
    return $false
}

function Assert-Ready {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "docker 를 찾지 못했습니다. Docker Desktop 이 켜져 있는지 확인하십시오."
    }
    $version = Invoke-Native {
        (& docker info --format '{{.ServerVersion}}' 2>$null | Out-String).Trim()
    }
    if ([string]::IsNullOrWhiteSpace($version)) {
        throw "Docker 엔진이 응답하지 않습니다. Docker Desktop 을 켜십시오."
    }
    if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) {
        throw ".env 가 없습니다. .env.example 을 복사해 값을 채우십시오."
    }
}

function Wait-Url([string] $Url, [int] $TimeoutSeconds, [string] $Label) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Note "$Label 준비됨"
                return $true
            }
        } catch {
            # 아직 기동 중이다. 다시 확인한다.
        }
        Start-Sleep -Seconds 2
    }
    Write-Fail "$Label 이(가) $TimeoutSeconds 초 안에 응답하지 않았습니다."
    return $false
}

function Show-AccountHint {
    # 가입한 계정이 하나도 없으면 첫 가입자가 열한 개 권한을 전부 받는다
    # (backend/src/backend/api/auth_service.py 의 _is_first_account).
    # members 에는 명단만 올라 있고 가입한 적 없는 행도 있으므로 password_hash 로 가른다.
    $user = Get-EnvValue 'POSTGRES_USER'
    $database = Get-EnvValue 'POSTGRES_DB'
    if ($user -eq '' -or $database -eq '') { return }

    $sql = 'select count(*) from members where password_hash is not null;'
    $count = Invoke-Native {
        (& docker compose exec -T db psql -U $user -d $database -tAc $sql 2>$null | Out-String).Trim()
    }
    if ($count -eq '') { return }

    if ($count -eq '0') {
        Write-Note "가입된 계정이 없습니다. /signup 에서 만드는 첫 계정이 권한 열한 개를 전부 받습니다."
    } else {
        Write-Note "가입된 계정 $count 개"
    }
}

function Invoke-Help {
    Write-Host ""
    Write-Host "banblit — 개발 환경을 한 번에 띄우고 내립니다" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  banblit [명령] [service] [switch]"
    Write-Host ""
    Write-Host "명령" -ForegroundColor Cyan
    Write-Host "  up        image 확인, migration, api·web 기동, 응답 대기, browser 실행 (기본값)"
    Write-Host "  down      service 를 내립니다. 데이터는 volume 에 남습니다"
    Write-Host "  restart   다시 띄웁니다. service 를 적지 않으면 api 와 web"
    Write-Host "  logs      최근 1분 로그를 봅니다"
    Write-Host "  status    무엇이 동작 중인지 보고, 8000·5173 에 실제로 요청해 확인합니다"
    Write-Host "  migrate   migration 만 실행하고 현재 revision 을 출력합니다"
    Write-Host "  check     pytest 와 mypy 를 돌립니다. 화면에는 판정과 실패 항목만,"
    Write-Host "            전체 출력은 .logs/ 에 남습니다"
    Write-Host "  help      이 도움말"
    Write-Host ""
    Write-Host "service" -ForegroundColor Cyan
    Write-Host "  api  web  db  auto-assign        logs·restart 에서만 씁니다. 적지 않으면 전부"
    Write-Host ""
    Write-Host "switch" -ForegroundColor Cyan
    Write-Host "  -Auto        up 에서 자동 배정 service 를 켜서 함께 띄웁니다"
    Write-Host "  -Build       up 에서 개발용 image 를 무조건 다시 만듭니다"
    Write-Host "  -NoBrowser   up 에서 browser 를 열지 않습니다"
    Write-Host "  -Volumes     down 에서 volume 까지 지웁니다. yes 를 직접 입력해야 실행됩니다"
    Write-Host "  -Follow      logs 를 붙잡고 계속 봅니다"
    Write-Host ""
    Write-Host "개별 docker 명령의 뜻과 주의점은 COMMAND.md 가 정본입니다." -ForegroundColor DarkGray
    Write-Host ""
}

function Invoke-Up {
    Assert-Ready

    if ($Build -or (Test-ImageStale)) {
        Write-Step "개발용 image 를 다시 만듭니다"
        Write-Note "dependency 나 Dockerfile 이 image 보다 새롭습니다. 바뀐 것이 없으면 layer cache 가 대신합니다."
        Invoke-Compose @('build', 'dev')
    }

    Write-Step "migration 을 최신으로 맞춥니다"
    Write-Note "db 가 healthy 가 될 때까지 기다린 뒤 alembic 이 실행됩니다."
    Invoke-Compose @('run', '--rm', 'dev', 'alembic', 'upgrade', 'head')

    $services = @('api', 'web')
    if ($Auto) {
        # 개발용 override 가 기본을 false 로 두므로 여기서 켠다 (COMMAND.md 13-1).
        $env:AUTO_ASSIGN_ENABLED = 'true'
        $services += 'auto-assign'
        Write-Note "자동 배정 service 를 함께 띄웁니다."
    }

    Write-Step "service 를 띄웁니다 — $($services -join ', ')"
    Invoke-Compose (@('up', '-d') + $services)

    Write-Step "응답을 기다립니다"
    if (-not (Wait-Url $API_HEALTH_URL $API_TIMEOUT_SECONDS 'API (8000)')) {
        Write-Note "로그를 확인하십시오: banblit logs api"
        Write-Note "import 단계에서 죽었다면 image 가 낡은 것입니다: banblit up -Build"
        exit 1
    }

    Write-Note "web 은 첫 기동에서 container 안 npm install 이 돌아 몇 분 걸립니다."
    if (-not (Wait-Url $WEB_URL $WEB_TIMEOUT_SECONDS 'web (5173)')) {
        Write-Note "로그를 확인하십시오: banblit logs web"
        exit 1
    }

    Show-AccountHint

    Write-Host ""
    Write-Host "   화면 $WEB_URL" -ForegroundColor Green
    Write-Host "   API  http://localhost:8000/docs" -ForegroundColor Green

    if (-not $NoBrowser) {
        Start-Process $WEB_URL
    }
}

function Invoke-Down {
    Assert-Ready
    if ($Volumes) {
        Write-Step "service 를 내리고 volume 까지 지웁니다"
        Write-Fail "DB·첨부파일·테스트용 DB 가 전부 사라집니다."
        $answer = Read-Host "정말 지웁니까? (yes 를 그대로 입력)"
        if ($answer -ne 'yes') {
            Write-Note "아무것도 하지 않았습니다."
            return
        }
        Invoke-Compose @('down', '-v')
    } else {
        Write-Step "service 를 내립니다. 데이터는 volume 에 남습니다"
        Invoke-Compose @('down')
    }
}

function Invoke-Restart {
    Assert-Ready
    $targets = if ($Service -eq '') { @('api', 'web') } else { @($Service) }
    Write-Step "다시 띄웁니다 — $($targets -join ', ')"
    Invoke-Compose (@('restart') + $targets)
}

function Invoke-Logs {
    Assert-Ready
    # --since 1m 이 없으면 이전 기동의 로그까지 섞여 나온다 (COMMAND.md 10-1).
    $composeArgs = @('logs', '--since', '1m')
    if ($Follow) { $composeArgs += '-f' }
    if ($Service -ne '') { $composeArgs += $Service }
    & docker compose @composeArgs
}

function Invoke-Status {
    Assert-Ready
    Write-Step "동작 중인 container"
    & docker compose ps
    Write-Step "응답"
    try {
        $health = Invoke-WebRequest -Uri $API_HEALTH_URL -UseBasicParsing -TimeoutSec 5
        Write-Note "API  $($health.Content)"
    } catch {
        Write-Note "API  응답 없음"
    }
    try {
        $web = Invoke-WebRequest -Uri $WEB_URL -UseBasicParsing -TimeoutSec 5
        Write-Note "web  $($web.StatusCode)"
    } catch {
        Write-Note "web  응답 없음"
    }
}

function Invoke-Migrate {
    Assert-Ready
    Write-Step "migration 을 최신으로 맞춥니다"
    Invoke-Compose @('run', '--rm', 'dev', 'alembic', 'upgrade', 'head')
    Invoke-Compose @('run', '--rm', 'dev', 'alembic', 'current')
}

function Invoke-CheckStep([string] $Label, [string[]] $ComposeArgs, [string] $LogPath, [string] $FailPattern) {
    # 전체 출력을 파일로 받고 화면에는 판정과 실패 항목만 낸다.
    # pytest 한 번이 수백 줄을 내는데 필요한 것은 통과 여부와 실패한 이름뿐이다.
    Write-Step $Label
    $output = Invoke-Native { (& docker compose @ComposeArgs 2>&1 | Out-String) }
    $code = $LASTEXITCODE
    Set-Content -Path $LogPath -Value $output -Encoding UTF8

    $lines = $output -split "`r?`n"
    foreach ($line in $lines) {
        if ($line -match $FailPattern) { Write-Note $line.Trim() }
    }
    # 요약 줄은 pytest 도 mypy 도 마지막 비어 있지 않은 줄에 낸다.
    $summary = ($lines | Where-Object { $_.Trim() -ne '' } | Select-Object -Last 1)
    if ($null -ne $summary) { Write-Note $summary.Trim() }

    if ($code -eq 0) {
        Write-Note "통과"
        return $true
    }
    Write-Fail "실패 — 전체 출력은 $LogPath"
    return $false
}

function Invoke-Check {
    Assert-Ready

    $logDir = Join-Path $PSScriptRoot '.logs'
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

    $testOk = Invoke-CheckStep '테스트' `
        @('run', '--rm', 'dev', 'pytest', '-q') `
        (Join-Path $logDir "pytest-$stamp.log") `
        '^(FAILED|ERROR)'

    $typeOk = Invoke-CheckStep '타입 검사' `
        @('run', '--rm', '--no-deps', 'dev', 'mypy') `
        (Join-Path $logDir "mypy-$stamp.log") `
        ': error:'

    Write-Host ""
    if ($testOk -and $typeOk) {
        Write-Host "   전부 통과" -ForegroundColor Green
        return
    }
    throw "check 가 실패했습니다. 위 항목을 보십시오."
}

Push-Location $PSScriptRoot
try {
    switch ($Command) {
        'up'      { Invoke-Up }
        'down'    { Invoke-Down }
        'restart' { Invoke-Restart }
        'logs'    { Invoke-Logs }
        'status'  { Invoke-Status }
        'migrate' { Invoke-Migrate }
        'check'   { Invoke-Check }
        'help'    { Invoke-Help }
        default {
            Write-Fail "모르는 명령입니다 — $Command"
            Invoke-Help
            exit 1
        }
    }
} catch {
    Write-Fail $_.Exception.Message
    exit 1
} finally {
    Pop-Location
}
