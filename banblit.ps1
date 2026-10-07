#requires -Version 5.1
<#
.SYNOPSIS
banblit.sh 를 Git Bash 로 실행합니다. PowerShell 에서 `banblit up` 을 쓰기 위한 wrapper 입니다.

.DESCRIPTION
실행 내용은 전부 banblit.sh 에 있습니다. 수정할 것이 있으면 banblit.sh 를 수정하십시오.
PowerShell 식 switch(-Auto, -Build, -NoBrowser, -Volumes, -Follow)를 banblit.sh 의 switch(--auto 등)로 변환해 전달합니다.

.EXAMPLE
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
# @(...) 로 감싸야 합니다. 인자가 1개이면 배열이 아니라 문자열이 되어 @forwarded 가 글자 단위로 전달됩니다("help" → h e l p).
$forwarded = @(foreach ($arg in $args) {
    $key = ([string]$arg).ToLowerInvariant()
    if ($map.ContainsKey($key)) { $map[$key] } else { [string]$arg }
})

& $bash $script @forwarded
exit $LASTEXITCODE
