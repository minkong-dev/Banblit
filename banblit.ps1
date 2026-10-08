#requires -Version 5.1
<#
.SYNOPSIS
banblit.sh 를 Git Bash 로 실행합니다. PowerShell 에서 `banblit up` 을 쓰기 위한 wrapper 입니다.

.DESCRIPTION
실행 내용은 전부 banblit.sh 에 있습니다. 수정할 것이 있으면 banblit.sh 를 수정하십시오.
PowerShell 식 switch(-Auto, -Build, -NoBrowser, -Volumes, -Follow)를 banblit.sh 의 switch(--auto 등)로 변환해 전달합니다.

`setup` 은 이 파일만 처리합니다. PowerShell profile 에 banblit function 을 등록해 어느 폴더에서나 `banblit up` 을 쓰게 합니다.
`setup -Remove` 는 등록을 삭제합니다. .env 생성, git hook 활성화, Docker 확인은 `banblit up` 이 실행할 때마다 진행합니다.

.EXAMPLE
.\banblit.ps1 setup
banblit
banblit up -Auto
banblit logs api -Follow
banblit down
#>

$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'banblit.sh'
if (-not (Test-Path $script)) {
    Write-Host "!! banblit.sh 가 존재하지 않습니다: $script" -ForegroundColor Red
    exit 1
}

# ── setup — PowerShell profile 등록 ─────────────────────────────────────────

function Register-Banblit([bool] $remove) {
    $markBegin = '# >>> banblit >>>'
    $markEnd = '# <<< banblit <<<'
    $target = Join-Path $PSScriptRoot 'banblit.ps1'

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
    $pattern = "(?ms)\r?\n?" + [regex]::Escape($markBegin) + ".*?" + [regex]::Escape($markEnd) + "\r?\n?"
    $cleaned = [regex]::Replace($existing, $pattern, "`r`n")

    if ($remove) {
        Set-Content -Path $profilePath -Value $cleaned -Encoding UTF8
        Remove-Item Function:banblit -ErrorAction SilentlyContinue
        Write-Host "삭제했습니다 — $profilePath"
        return
    }

    $block = @"
$markBegin
function banblit { & "$target" @args }
$markEnd
"@
    $updated = $cleaned.TrimEnd() + "`r`n`r`n" + $block + "`r`n"
    Set-Content -Path $profilePath -Value $updated -Encoding UTF8

    # 현재 창에도 등록합니다. profile 은 새 창에서만 읽힙니다.
    Set-Item -Path Function:banblit -Value ([scriptblock]::Create("& `"$target`" @args"))

    Write-Host ""
    Write-Host "등록했습니다 — $profilePath" -ForegroundColor Green
    Write-Host ""
    Write-Host "  banblit up          실행합니다. 첫 기동은 Docker image 생성과 npm install 로 몇 분 걸립니다"
    Write-Host "  banblit help        나머지 명령"
    Write-Host ""
    Write-Host "   이 창에서 바로 쓸 수 있습니다. 새 창은 profile 을 읽어 자동으로 등록됩니다." -ForegroundColor DarkGray
    Write-Host ""
}

if ($args.Count -ge 1 -and ([string]$args[0]).ToLowerInvariant() -eq 'setup') {
    $remove = ($args | ForEach-Object { ([string]$_).ToLowerInvariant() }) -contains '-remove'
    Register-Banblit $remove
    exit 0
}

# ── 그 밖의 명령 — banblit.sh 로 전달 ───────────────────────────────────────

# Git Bash 를 찾습니다. Git for Windows 와 함께 설치됩니다.
$bash = $null
foreach ($candidate in @(
    (Join-Path $env:ProgramFiles 'Git\bin\bash.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Git\bin\bash.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe')
)) {
    if ($candidate -and (Test-Path $candidate)) { $bash = $candidate; break }
}
if (-not $bash) {
    $found = Get-Command bash.exe -ErrorAction SilentlyContinue
    if ($found) { $bash = $found.Source }
}
if (-not $bash) {
    Write-Host "!! Git Bash 를 찾지 못했습니다." -ForegroundColor Red
    Write-Host "   Git for Windows 를 설치하십시오: https://git-scm.com/download/win" -ForegroundColor DarkGray
    exit 1
}

# PowerShell 식 switch 를 banblit.sh 의 switch 로 변환합니다. 나머지 인자는 그대로 전달합니다.
$map = @{
    '-auto' = '--auto'; '-build' = '--build'; '-nobrowser' = '--no-browser'
    '-volumes' = '--volumes'; '-follow' = '--follow'
    '-dev' = '--dev'; '-deploy' = '--deploy'
}
# @(...) 로 감싸야 합니다. 인자가 1개이면 배열이 아니라 문자열이 되어 글자 단위로 전달됩니다.
$forwarded = @(foreach ($arg in $args) {
    $key = ([string]$arg).ToLowerInvariant()
    if ($map.ContainsKey($key)) { $map[$key] } else { [string]$arg }
})

& $bash $script @forwarded
exit $LASTEXITCODE
