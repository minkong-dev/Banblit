# 파일 삭제 명령을 차단하고 trash/ 로 이동하도록 안내합니다.
# 입력은 표준입력의 JSON 1개이고, tool_input.command 에 실행하려던 명령이 있습니다.
# 차단할 때만 종료 코드 2 를 반환합니다. 그 외에는 0 입니다.
$ErrorActionPreference = 'Stop'

# 안내 문구가 한글이므로 UTF-8 로 출력합니다. 변경할 수 없는 환경이면 그대로 진행합니다.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { exit 0 }
    $payload = $raw | ConvertFrom-Json
} catch {
    # 입력을 읽지 못하면 차단하지 않습니다.
    exit 0
}

$command = $payload.tool_input.command
if (-not $command) { exit 0 }

# 삭제 명령만 검사합니다. 명령 첫머리이거나 파이프·세미콜론 뒤에 오는 경우만 해당합니다.
$delete = '(^|[;&|]\s*)\s*(rm|del|erase|rmdir|unlink|Remove-Item|ri\b|rd\b)\s'
if ($command -notmatch $delete) { exit 0 }

$message = @'
파일을 삭제하지 않습니다. 저장소 루트의 trash/ 로 이동하십시오.

    mv <파일> trash/<날짜>-<대상>/

삭제는 되돌릴 수 없고, 이동은 되돌릴 수 있습니다.
기존 파일을 이동해야 할 경우 이동 전에 개발자님께 먼저 확인합니다.
이번 작업에서 직접 생성한 파일은 확인 없이 이동합니다.
'@

[Console]::Error.WriteLine($message)
exit 2
