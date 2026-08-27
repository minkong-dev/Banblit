# 파일을 지우려는 명령을 막고 trash/ 로 옮기라고 돌려보낸다.
#
# 입력은 표준입력으로 오는 JSON 하나다. tool_input.command 에 실행하려던 명령이 들어 있다.
# 막을 때만 종료 코드 2 를 낸다. 그 외에는 0 으로 끝내 아무것도 방해하지 않는다.
$ErrorActionPreference = 'Stop'

# 안내 문구가 한글이라 UTF-8 로 내보내야 안 깨진다. 못 바꾸는 환경이면 그냥 넘어간다.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { exit 0 }
    $payload = $raw | ConvertFrom-Json
} catch {
    # 입력을 못 읽으면 막지 않는다. 훅이 작업을 멈추게 하면 안 된다.
    exit 0
}

$command = $payload.tool_input.command
if (-not $command) { exit 0 }

# 지우는 명령만 잡는다. 명령 첫머리이거나 파이프·세미콜론 뒤에 오는 것만 본다.
# 파일명에 우연히 rm 이 들어간 경우를 걸지 않기 위해서다.
$delete = '(^|[;&|]\s*)\s*(rm|del|erase|rmdir|unlink|Remove-Item|ri\b|rd\b)\s'
if ($command -notmatch $delete) { exit 0 }

$message = @'
파일을 지우지 않습니다. 저장소 루트의 trash/ 로 옮기십시오.

    mv <파일> trash/<날짜>-<무엇을-치우는지>/

지운 것은 되돌릴 수 없고, 옮긴 것은 되돌릴 수 있습니다.
기존 파일을 치워야 한다고 판단되면 옮기기 전에 사용자님께 먼저 여쭙니다.
이번 작업에서 직접 만든 파일이면 묻지 않고 옮깁니다.
'@

[Console]::Error.WriteLine($message)
exit 2
