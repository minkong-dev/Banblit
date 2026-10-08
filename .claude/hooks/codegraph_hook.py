"""Write, Edit 뒤 소스 파일(.py, .ts, .tsx)이 바뀌었으면 scripts/codegraph.py 를 실행해 .cluedoc/graph/ 를 갱신합니다.
입력은 표준입력의 JSON 1개이고, tool_input.file_path 에 수정한 파일 경로가 있습니다. 항상 종료 코드 0 입니다.
호스트 Python 으로 실행하고, 실패하면 경고만 출력합니다."""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return 0
    path = payload.get("tool_input", {}).get("file_path") or ""
    if not path.endswith((".py", ".ts", ".tsx")) or "trash" in Path(path).parts or "codegraph.py" in path:
        return 0
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    # -I 는 환경변수를 무시하므로 출력 인코딩은 -X utf8 로 지정합니다.
    result = subprocess.run([sys.executable, "-I", "-X", "utf8", str(ROOT / "scripts" / "codegraph.py")],
                            capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    sys.stderr.reconfigure(encoding="utf-8")
    if result.returncode != 0:
        print(f"codegraph 갱신 실패: {result.stderr.strip()[-300:]}", file=sys.stderr)
    else:
        print(result.stdout.strip(), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
