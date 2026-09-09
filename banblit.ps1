#requires -Version 5.1
<#
.SYNOPSIS
banblit.sh 를 Git Bash 로 실행합니다. PowerShell 에서 `banblit up` 을 그대로 쓰기 위한 껍데기입니다.

.DESCRIPTION
띄우고 내리는 내용은 전부 banblit.sh 에 있습니다. 윈도우와 리눅스 서버가 같은 파일을
쓰도록 하나로 합쳤고, 이 파일은 그것을 부르기만 합니다. 고칠 것이 있으면 banblit.sh 를
고치십시오.

PowerShell 식 switch(-Auto, -Build, -NoBrowser, -Volumes, -Follow)를 그대로 받아
banblit.sh 의 것(--auto 등)으로 바꿔 넘깁니다. 쓰던 대로 치면 됩니다.

.EXAMPLE
banblit
banblit up -Auto
banblit logs api -Follow
banblit down
#>

$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'banblit.sh'
if (-not (Test-Path $script)) {
    Write-Host "!! banblit.sh 를 찾지 못했습니다: $script" -ForegroundColor Red
    exit 1
}

# Git Bash 를 찾는다. Git for Windows 를 설치하면 함께 깔린다.
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

# PowerShell 식 switch 를 banblit.sh 의 것으로 바꾼다. 나머지는 그대로 넘긴다.
$map = @{
    '-auto' = '--auto'; '-build' = '--build'; '-nobrowser' = '--no-browser'
    '-volumes' = '--volumes'; '-follow' = '--follow'
    '-dev' = '--dev'; '-deploy' = '--deploy'
}
# @(...) 로 감싸야 한다. 인자가 하나뿐이면 결과가 배열이 아니라 글자열 하나가 되는데,
# 그것을 @forwarded 로 펼치면 PowerShell 이 글자 단위로 쪼개 넘긴다("help" → h e l p).
$forwarded = @(foreach ($arg in $args) {
    $key = ([string]$arg).ToLowerInvariant()
    if ($map.ContainsKey($key)) { $map[$key] } else { [string]$arg }
})

& $bash $script @forwarded
exit $LASTEXITCODE
