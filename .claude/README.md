# .claude — 하네스 구성과 기준

> 문서 버전: 1.0.0 draft

하네스는 이 저장소에서 Claude 가 일하는 방식을 정하는 설정 묶음입니다. 원칙은 1개입니다.
**항상 로드되는 것은 최소로, 나머지는 필요할 때만 로드합니다.** 2026-10-08 에 개발자님이 확정했습니다.

## 구성

| 층 | 위치 | 로드 시점 | 담는 것 | 추가, 삭제 기준 |
|---|---|---|---|---|
| 1 항상 | `~/.claude/CLAUDE.md`, `CLAUDE.md`, `MEMORY.md` | 매 세션 | 말투, 3모드, 삭제 금지, 커밋 형식, 저장소 고유 제약 | 다른 층에 있는 내용은 넣지 않음. 각 파일 50줄 이내를 목표 |
| 2 호출 | 전역 `~/.claude/skills/{writing-style,refactoring}` + 저장소 `skills/{writing-style-local,refactoring-local}` | 글 쓸 때, 리팩토링할 때 | 규칙 본문은 전역, 저장소 고유 사항은 `-local` | 프로젝트 무관 규칙은 전역에, 이 저장소만의 표기, 모듈 지도는 local 에 |
| 3 호출 | 저장소 `skills/` 21개 | 리뷰어 에이전트와 제가 읽음 | 언어, 도구별 관례(python-patterns, react-patterns 등), cluedoc, ui-ux-pro-max | 쓰지 않는 스킬은 trash 로. ECC rules 에서 흡수한 규칙은 각 SKILL.md 끝 "ECC rules 에서 흡수" 절 |
| 4 호출 | `agents/` 8개 | 코드 수정 후 리뷰, TDD, 빌드 오류 | 파일 머리 description 이 "언제 쓰는가". 이 폴더가 유일한 기준 | 한 번도 호출하지 않은 에이전트는 trash 로. 필요하면 ECC 캐시에서 파일 1개만 복사 |
| 5 자동 | `hooks/` 2개 + `.githooks/` 2개, 등록은 `settings.json` | 도구 실행 전후, 커밋 전 | 기계가 판정할 수 있는 것만 | 판단이 필요한 검사는 훅이 아니라 스킬 |
| 6 플러그인 | `~/.claude/settings.json` 의 `enabledPlugins` | 호출 | document-skills, claude-api, example-skills(frontend-design) | ecc, ponytail 은 끔. 매 요청에 설명이 붙는 플러그인은 켜지 않음 |

## 훅

| 훅 | 시점 | 동작 | 실패 시 |
|---|---|---|---|
| `hooks/move_to_trash.py` | Bash, PowerShell 실행 전 | 명령에 rm, del, Remove-Item 등이 있으면 거부 | 종료 코드 2(차단) |
| `hooks/style_check.py` | Write, Edit 뒤 | writing-style 금지 표현을 grep 해 경고 출력 | 종료 코드 0(경고만) |
| `hooks/codegraph_hook.py` | Write, Edit 뒤(.py, .ts, .tsx) | `scripts/codegraph.py` 로 `.cluedoc/graph/` 재생성 | 종료 코드 0(경고만) |
| `.githooks/commit-msg` | 커밋 메시지 작성 뒤 | `<scope>: <요약>` 형식과 허용 scope 검사 | 커밋 거부 |
| `.githooks/pre-commit` | 커밋 직전(윈도우만) | `codegraph.py` 재생성 후 `.cluedoc` 를 add, 그다음 `banblit.sh check`(pytest, mypy) | 커밋 거부. `--no-verify` 로 건너뜀 |

`.githooks/` 는 `banblit up` 이 `core.hooksPath` 로 활성화합니다. 훅은 전부 Python(표준 라이브러리)이라 OS 에 관계없이 1벌입니다.
이 구성은 FIO(개발자님의 하네스 패키지, 경로는 `~/.claude/fio.path`)에서 관리하고, 다른 저장소에는 `/fio init` 으로 적용합니다.

## 없앤 것과 이유

| 대상 | 이동 위치 | 이유 |
|---|---|---|
| `rules/` 25개(ECC 복사본) | `trash/2026-10-08-harness/rules/` | 매 세션 로드되는데 공통 CLAUDE.md, 전역 스킬과 중복. 고유 규칙 34개만 스킬로 흡수 |
| `agents/{planner,architect,doc-updater}` | `trash/2026-10-08-harness/agents/` | 호출한 적 없음. 계획, 구조, README 는 직접 |
| `skills/{refactoring,refactor-audit}` | `trash/2026-10-08-refactoring-global/` | 전역 스킬로 이동 |
| `skills/coding-standards` | `trash/2026-10-08-refactor-audit/skills/` | 전역 refactoring 의 `reference/coding-standards.md` 로 이동 |

## 어떻게 확인했나

- 훅: `.githooks/test-commit-msg.sh` 14건 통과. `style-check.ps1` 은 trash 경로 입력 시 경고 없음 확인.
- 스킬, 에이전트: `banblit check` 743 통과, mypy 통과(2026-10-08). 로드 비용은 ecc 를 끈 다음 세션에서 측정합니다.
