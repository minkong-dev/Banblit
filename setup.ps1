#requires -Version 5.1
<#
.SYNOPSIS
clone 직후 1회 실행합니다. 실행 환경을 확인하고, 없는 것을 생성한 뒤 banblit 명령을 등록합니다.

.DESCRIPTION
clone 직후에는 다음 4가지가 준비되어 있지 않습니다.

  1. .env          — git 에 포함되지 않습니다. .env.example 을 복사해 생성합니다.
  2. git hook      — 커밋 메시지 형식을 검사하는 .githooks 를 활성화합니다.
  3. Docker        — 설치·실행 여부를 확인합니다. 설치되어 있지 않으면 설치 주소를 안내합니다.
  4. banblit 명령  — PowerShell profile 에 function 으로 등록합니다.

.EXAMPLE
.\setup.ps1
.\setup.ps1 -Up
.\setup.ps1 -Remove
#>

[CmdletBinding()]
param(
    # 준비가 끝나면 banblit up 까지 실행합니다.
    [switch] $Up,

    # 등록한 function 을 profile 에서 삭제합니다.
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

# ── 0. 저장소 루트에서 실행되었는지 확인 ─────────────────────────────────────

$target = Join-Path $PSScriptRoot 'banblit.ps1'
foreach ($needed in @('banblit.ps1', 'docker-compose.yml', '.env.example')) {
    if (-not (Test-Path (Join-Path $PSScriptRoot $needed))) {
        Write-Fail "$needed 이(가) 존재하지 않습니다: $PSScriptRoot"
        Write-Note "저장소 루트에서 .\setup.ps1 로 실행하십시오."
        exit 1
    }
}

# ── profile 경로 ─────────────────────────────────────────────────────────────
# CurrentUserAllHosts — 같은 PowerShell edition 의 모든 host 가 읽는 profile 입니다.

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

# 이미 등록된 블록은 표시 줄까지 삭제합니다. 여러 번 실행해도 1개만 남습니다.
$pattern = "(?ms)\r?\n?" + [regex]::Escape($MARK_BEGIN) + ".*?" + [regex]::Escape($MARK_END) + "\r?\n?"
$cleaned = [regex]::Replace($existing, $pattern, "`r`n")

if ($Remove) {
    Set-Content -Path $profilePath -Value $cleaned -Encoding UTF8
    Remove-Item Function:banblit -ErrorAction SilentlyContinue
    Write-Host "삭제했습니다 — $profilePath"
    Write-Note ".env 와 git hook 설정은 그대로 둡니다."
    exit 0
}

Write-Host ""
Write-Host "banblit 준비 — $PSScriptRoot" -ForegroundColor Cyan

# ── 1. .env ──────────────────────────────────────────────────────────────────

Write-Step ".env"
$envPath = Join-Path $PSScriptRoot '.env'
if (Test-Path $envPath) {
    Write-Done "이미 존재합니다. 변경하지 않습니다."
} else {
    Copy-Item (Join-Path $PSScriptRoot '.env.example') $envPath
    Write-Done ".env.example 복사를 통해 .env 를 생성하는 데 성공했습니다."
    Write-Note "개발용 기본값이라 그대로 실행할 수 있습니다. 메일을 발송하려면 SMTP 값을 작성하십시오."
}

# ── 2. git hook ──────────────────────────────────────────────────────────────

Write-Step "git hook"
if (Get-Command git -ErrorAction SilentlyContinue) {
    Push-Location $PSScriptRoot
    try {
        & git config core.hooksPath .githooks
        if ($LASTEXITCODE -eq 0) {
            Write-Done "활성화했습니다 — 커밋 메시지 형식을 .githooks/commit-msg 가 검사합니다."
        } else {
            Write-Fail "git config 가 실패했습니다. 저장소 경로를 확인하십시오."
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Fail "git 을 찾지 못했습니다. hook 등록을 건너뜁니다."
    Write-Note "git 을 설치한 후 저장소에서 실행하십시오: git config core.hooksPath .githooks"
}

# ── 3. Docker ────────────────────────────────────────────────────────────────

Write-Step "Docker"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Fail "Docker 를 찾지 못했습니다."
    Write-Note "Docker Desktop 을 설치한 후 다시 실행하십시오."
    Write-Note "https://www.docker.com/products/docker-desktop/"
    exit 1
}

$engine = (& docker info --format '{{.ServerVersion}}' 2>$null | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($engine)) {
    Write-Note "Docker 엔진이 응답하지 않습니다. Docker Desktop 을 실행합니다."
    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path $desktop) {
        Start-Process $desktop
    } else {
        Write-Fail "Docker Desktop 실행 파일이 존재하지 않습니다: $desktop"
        Write-Note "Docker Desktop 을 직접 실행한 후 다시 실행하십시오."
        exit 1
    }

    # 엔진이 응답할 때까지 기다립니다.
    $deadline = (Get-Date).AddSeconds($DOCKER_WAIT_SECONDS)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        $engine = (& docker info --format '{{.ServerVersion}}' 2>$null | Out-String).Trim()
        if (-not [string]::IsNullOrWhiteSpace($engine)) { break }
    }

    if ([string]::IsNullOrWhiteSpace($engine)) {
        Write-Fail "Docker 엔진의 응답 시간이 초과되었습니다. $DOCKER_WAIT_SECONDS 초 이내에 응답하여야 합니다."
        Write-Note "Docker Desktop 실행이 끝난 후 다시 실행하십시오."
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

# 현재 창에도 등록합니다. profile 은 새 창에서만 읽힙니다.
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
Write-Host "  banblit up          실행합니다. 첫 기동은 image 생성과 npm install 로 몇 분 걸립니다"
Write-Host "  banblit help        나머지 명령"
Write-Host ""
Write-Note "이 창에서 바로 쓸 수 있습니다. 새 창은 profile 을 읽어 자동으로 등록됩니다."
Write-Host ""
