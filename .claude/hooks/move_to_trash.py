"""파일 삭제 명령을 차단하고 trash/ 로 이동하도록 안내합니다.
입력은 표준입력의 JSON 1개이고, tool_input.command 에 실행하려던 명령이 있습니다.
차단할 때만 종료 코드 2 를 반환합니다. 그 외에는 0 입니다."""

import json
import re
import sys

# 삭제 명령만 검사합니다. 명령 첫머리이거나 파이프, 세미콜론 뒤에 오는 경우만 해당합니다.
DELETE = re.compile(r"(^|[;&|]\s*)\s*(rm|del|erase|rmdir|unlink|Remove-Item|ri\b|rd\b)\s")

MESSAGE = """파일을 삭제하지 않습니다. 저장소 루트의 trash/ 로 이동하십시오.

    mv <파일> trash/<날짜>-<대상>/

기존 파일을 이동해야 할 경우 이동 전에 개발자님께 먼저 확인합니다.
이번 작업에서 직접 생성한 파일은 확인 없이 이동합니다."""


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return 0
    command = payload.get("tool_input", {}).get("command") or ""
    if not DELETE.search(command):
        return 0
    sys.stderr.reconfigure(encoding="utf-8")
    print(MESSAGE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
