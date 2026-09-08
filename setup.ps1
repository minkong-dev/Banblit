#requires -Version 5.1
<#
.SYNOPSIS
클론한 직후 한 번 실행합니다. 이 PC 가 banblit 을 띄울 수 있는 상태인지 확인하고,
빠진 것을 채운 뒤 banblit 명령을 등록합니다.

.DESCRIPTION
쌩 PC 에 저장소를 클론하면 다음 넷이 비어 있습니다.

  1. .env          — git 에 올리지 않으므로 클론에는 없다. docker compose 가 이것을 읽는다.
  2. git hook       — 커밋 메시지 형식을 강제하는 hook 이 .githooks 에 있는데 꺼져 있다.
  3. Docker         — 설치·기동 여부는 이 스크립트가 확인만 하고, 없으면 받는 곳을 알려준다.
  4. banblit 명령   — PowerShell profile 에 function 으로 넣는다.

alias 대신 function 을 쓰는 것은 alias 가 뒤따르는 인자를 다루지 못하는 경우가 있어서다.
표시 두 줄 사이에만 넣으므로 다시 실행해도 내용이 쌓이지 않는다.

.EXAMPLE
.\setup.ps1
.\setup.ps1 -Up
.\setup.ps1 -Remove
#>

[CmdletBinding()]
param(
    # 준비가 끝나면 곧바로 banblit up 까지 실행합니다.
    [switch] $Up,

    # 등록한 function 을 profile 에서 지웁니다.
    [switch] $Remove
)

$ErrorActionPreference = 'Stop'

$MARK_BEGIN = '# >>> banblit >>>'
$MARK_END = '# <<< banblit <<<'
$DOCKER_WAIT_SECONDS = 120

function Write-Step([string] $text) {
    Write-Host ""
    Write-Host "== $text" -ForegroundColor Cyan
}

function Write-Note([string] $text) {
    Write-Host "   $text" -ForegroundColor DarkGray
}

function Write-Done([string] $text) {
    Write-Host "   $text" -ForegroundColor Green
}

function Write-Fail([string] $text) {
    Write-Host "!! $text" -ForegroundColor Red
}

# ── 0. 저장소 안에서 실행됐는지 ───────────────────────────────────────────────
# 잘못된 자리에서 돌면 profile 에 없는 경로를 넣게 되고, 그 뒤로 banblit 이 매번 실패한다.

$target = Join-Path $PSScriptRoot 'banblit.ps1'
foreach ($needed in @('banblit.ps1', 'docker-compose.yml', '.env.example')) {
    if (-not (Test-Path (Join-Path $PSScriptRoot $needed))) {
        Write-Fail "$needed 을(를) 찾지 못했습니다: $PSScriptRoot"
        Write-Note "저장소 루트에서 .\setup.ps1 로 실행하십시오."
        exit 1
    }
}

# ── profile 경로 ─────────────────────────────────────────────────────────────
# CurrentUserAllHosts — 같은 PowerShell edition 이면 terminal 이든 ISE 든 읽는 profile 이다.

$profilePath = $PROFILE.CurrentUserAllHosts
$profileDir = Split-Path $profilePath -Parent
if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

$existing = ''
if (Test-Path $profilePath) {
    $existing = Get-Content $profilePath -Raw -Encoding UTF8
    if ($null -eq $existing) { $existing = '' }
}

# 앞서 넣은 블록을 표시째로 걷어낸다. 여러 번 실행해도 하나만 남는다.
$pattern = "(?ms)\r?\n?" + [regex]::Escape($MARK_BEGIN) + ".*?" + [regex]::Escape($MARK_END) + "\r?\n?"
$cleaned = [regex]::Replace($existing, $pattern, "`r`n")

if ($Remove) {
    Set-Content -Path $profilePath -Value $cleaned -Encoding UTF8
    Remove-Item Function:banblit -ErrorAction SilentlyContinue
    Write-Host "지웠습니다 — $profilePath"
    Write-Note ".env 와 git hook 설정은 그대로 둡니다. 저장소를 지우면 함께 사라집니다."
    exit 0
}

Write-Host ""
Write-Host "banblit 준비 — $PSScriptRoot" -ForegroundColor Cyan

# ── 1. .env ──────────────────────────────────────────────────────────────────
# docker compose 가 POSTGRES_USER 같은 값을 여기서 읽는다. 없으면 빈 값으로 붙어
# 데이터베이스가 뜨지 않는다. 견본의 기본값은 개발용이라 그대로 써도 된다.

Write-Step ".env"
$envPath = Join-Path $PSScriptRoot '.env'
if (Test-Path $envPath) {
    Write-Done "이미 있습니다. 건드리지 않습니다."
} else {
    Copy-Item (Join-Path $PSScriptRoot '.env.example') $envPath
    Write-Done "만들었습니다 — .env.example 을 복사했습니다."
    Write-Note "개발용 기본값이라 그대로 띄울 수 있습니다. 메일을 실제로 보내려면 SMTP 줄을 채웁니다."
}

# ── 2. git hook ──────────────────────────────────────────────────────────────
# 커밋 메시지 형식을 .githooks/commit-msg 가 강제한다. 클론 직후에는 꺼져 있다.

Write-Step "git hook"
if (Get-Command git -ErrorAction SilentlyContinue) {
    Push-Location $PSScriptRoot
    try {
        & git config core.hooksPath .githooks
        if ($LASTEXITCODE -eq 0) {
            Write-Done "켰습니다 — 커밋 메시지 형식을 .githooks/commit-msg 가 검사합니다."
        } else {
            Write-Fail "git config 가 실패했습니다. 저장소가 맞는지 확인하십시오."
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Fail "git 을 찾지 못했습니다. hook 은 건너뜁니다."
    Write-Note "git 을 설치한 뒤 저장소에서 한 번 실행하십시오: git config core.hooksPath .githooks"
}

# ── 3. Docker ────────────────────────────────────────────────────────────────
# 이 프로젝트의 모든 실행은 컨테이너 안이다. 호스트에는 파이썬도 node 도 없어도 된다.

Write-Step "Docker"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Fail "docker 를 찾지 못했습니다."
    Write-Note "Docker Desktop 을 설치한 뒤 이 스크립트를 다시 실행하십시오."
    Write-Note "https://www.docker.com/products/docker-desktop/"
    exit 1
}

$engine = (& docker info --format '{{.ServerVersion}}' 2>$null | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($engine)) {
    Write-Note "엔진이 응답하지 않습니다. Docker Desktop 을 켭니다."
    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path $desktop) {
        Start-Process $desktop
    } else {
        Write-Fail "Docker Desktop 실행 파일을 찾지 못했습니다: $desktop"
        Write-Note "직접 켠 뒤 이 스크립트를 다시 실행하십시오."
        exit 1
    }

    # 기동에 시간이 걸린다. 엔진이 답할 때까지 기다린다.
    $deadline = (Get-Date).AddSeconds($DOCKER_WAIT_SECONDS)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        $engine = (& docker info --format '{{.ServerVersion}}' 2>$null | Out-String).Trim()
        if (-not [string]::IsNullOrWhiteSpace($engine)) { break }
    }

    if ([string]::IsNullOrWhiteSpace($engine)) {
        Write-Fail "$DOCKER_WAIT_SECONDS 초 안에 엔진이 응답하지 않았습니다."
        Write-Note "Docker Desktop 이 다 뜬 뒤 이 스크립트를 다시 실행하십시오."
        exit 1
    }
}
Write-Done "엔진 $engine"

# ── 4. banblit 명령 ──────────────────────────────────────────────────────────

Write-Step "banblit 명령"
$block = @"
$MARK_BEGIN
function banblit { & "$target" @args }
$MARK_END
"@

$updated = $cleaned.TrimEnd() + "`r`n`r`n" + $block + "`r`n"
Set-Content -Path $profilePath -Value $updated -Encoding UTF8

# 지금 열려 있는 창에도 반영한다. profile 은 새로 여는 창에서만 읽힌다.
Set-Item -Path Function:banblit -Value ([scriptblock]::Create("& `"$target`" @args"))
Write-Done "등록했습니다 — $profilePath"

# ── 5. 다음 단계 ─────────────────────────────────────────────────────────────

if ($Up) {
    & $target 'up'
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "준비가 끝났습니다." -ForegroundColor Green
Write-Host ""
Write-Host "  banblit up          띄웁니다. 첫 기동은 image 를 만들고 npm install 이 돌아 몇 분 걸립니다"
Write-Host "  banblit help        나머지 명령"
Write-Host ""
Write-Note "이 창에서는 바로 쓸 수 있고, 새 창은 profile 을 읽어 자동으로 알게 됩니다."
Write-Host ""
