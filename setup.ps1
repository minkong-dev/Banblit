#requires -Version 5.1
<#
.SYNOPSIS
banblit 명령을 어느 경로에서나 쓸 수 있도록 등록합니다. 한 번만 실행합니다.

.DESCRIPTION
PowerShell profile 에 banblit function 을 넣습니다. alias 대신 function 을 쓰는 것은,
alias 가 이름만 바꿔 줄 뿐 뒤따르는 인자를 다루지 못하는 경우가 있기 때문입니다.
function 은 받은 인자를 그대로 banblit.ps1 에 넘깁니다.

표시 두 줄 사이에만 넣으므로 다시 실행해도 내용이 쌓이지 않습니다.

.EXAMPLE
.\setup.ps1
.\setup.ps1 -Remove
#>

[CmdletBinding()]
param(
    # 등록한 function 을 profile 에서 지웁니다.
    [switch] $Remove
)

$ErrorActionPreference = 'Stop'

$MARK_BEGIN = '# >>> banblit >>>'
$MARK_END = '# <<< banblit <<<'

$target = Join-Path $PSScriptRoot 'banblit.ps1'
if (-not (Test-Path $target)) {
    Write-Host "banblit.ps1 을 찾지 못했습니다: $target" -ForegroundColor Red
    exit 1
}

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
    exit 0
}

$block = @"
$MARK_BEGIN
function banblit { & "$target" @args }
$MARK_END
"@

$updated = $cleaned.TrimEnd() + "`r`n`r`n" + $block + "`r`n"
Set-Content -Path $profilePath -Value $updated -Encoding UTF8

# 지금 열려 있는 창에도 반영한다. profile 은 새로 여는 창에서만 읽힌다.
Set-Item -Path Function:banblit -Value ([scriptblock]::Create("& `"$target`" @args"))

Write-Host "등록했습니다 — $profilePath"
Write-Host "사용법은 banblit help 로 확인합니다."
