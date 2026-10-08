"""파일을 쓰거나 수정한 직후, writing-style 의 금지 표현이 있으면 경고를 출력합니다. 차단하지 않습니다(항상 종료 코드 0).
입력은 표준입력의 JSON 1개이고, tool_input.file_path 에 수정한 파일 경로가 있습니다.
검사 대상 확장자는 md, py, ts, tsx, sh, ps1, yml, yaml, conf, template, Dockerfile 입니다."""

import json
import re
import sys
from pathlib import Path

EXTS = (".md", ".py", ".ts", ".tsx", ".sh", ".ps1", ".yml", ".yaml", ".conf", ".template")
SKIP_PARTS = {"trash", "node_modules", "dev_history", "graph"}

# writing-style search 패턴과 writing-style-local 의 "쓰지 않는 이름" 입니다. 바꾸면 두 스킬도 같이 바꿉니다.
PATTERNS = [re.compile(p) for p in (
    r"(한다|했다|이다|된다|있다)\.?$",
    r"붙박이|걸치기|나눠쓰기|낭독기|되묻기|말풍선|통로|뒷단|처리기|그림작가|메뉴판|정본|바탕|물려받|굽는|굽지|꾸러미|잠금 파일|이름 풀이|떨어뜨리|찔러|뜰 때|채워진다",
    r"고치|지우|돌려주|앉히|틀린|넘긴다|떼고|거르는|비우",
    r"그것|이것|이 안|여기서",
    r"여럿|몇몇|하나둘",
    r"강력한|혁신적인|완벽한",
    r"처음에는|예전에는|검토했|바꿨다|변경 이력",
    r"캡쳐|병합 커밋|되돌리기 커밋|검사 도구|단추|집중합주 기간|전체합주|팀별합주",
)]


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return 0
    raw = payload.get("tool_input", {}).get("file_path") or ""
    path = Path(raw)
    if not raw or not path.exists() or SKIP_PARTS & set(path.parts):
        return 0
    if not (raw.endswith(EXTS) or "Dockerfile" in path.name):
        return 0
    hits = []
    for no, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        if re.match(r"^\s*(```|\||#!)", line):
            continue
        if any(p.search(line) for p in PATTERNS):
            hits.append(f"{no}: {line.strip()}")
    if hits:
        sys.stderr.reconfigure(encoding="utf-8")
        print(f"writing-style 경고 — {raw} ({len(hits)}줄). 반말 종결, 조어, 쓰지 않는 표기를 확인하십시오.", file=sys.stderr)
        for h in hits[:10]:
            print(f"  {h}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
