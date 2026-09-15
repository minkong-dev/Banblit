# CLAUDE.md — Banblit 전용 지침

공통 규칙은 `~/.claude/CLAUDE.md` 에 있습니다. 핵심 원칙, 소통 방식, 파일 생성 3모드,
코드 리뷰, 코딩 규칙, 보안, 커밋, 파일 삭제, 문서 형상관리 — 전부 거기입니다.

이 파일은 **이 프로젝트에만 해당하는 것**만 담습니다. 공통 규칙과 겹치면 이 파일이 우선합니다.

---
## 0. 세션을 시작할 때

**`dev_history/` 의 가장 최근 파일 하나를 읽습니다.** 현재 상태, 지금 하던 일, 남은 것이
전부 거기 있습니다. 그 파일이 가리키기 전에는 저장소를 훑지 않습니다.

이 규칙은 세션을 짧게 유지하기 위한 것입니다. 컨텍스트는 요청마다 통째로 다시 나가므로
세션이 길어질수록 같은 질문 하나가 몇 배씩 비싸집니다. 파악을 파일에서 하면 `/clear` 가
공짜가 되고, 작업 하나가 끝날 때마다 끊을 수 있습니다.

---
## 1. 이 프로젝트의 에이전트

`.claude/agents/` 에 있는 열한 개가 전부입니다. ECC(`affaan-m/ECC`)에서 필요한 것만 옮겨 왔고,
플러그인 자체는 꺼 두었습니다 — 68개를 다 켜면 요청마다 40,637 토큰이 붙는데 이 열한 개의
몫은 671 토큰입니다.

| 상황 | 에이전트 |
|---|---|
| 복잡한 기능·리팩토링 계획 | `planner` |
| 구조 결정 | `architect` |
| 새 기능·버그 수정 | `tdd-guide` |
| 코드를 쓰거나 고친 직후 | `code-reviewer` |
| 파이썬 코드 | `python-reviewer` |
| 서버 주소(FastAPI) 코드 | `fastapi-reviewer` |
| 데이터베이스·마이그레이션 | `database-reviewer` |
| 화면 코드 | `react-reviewer` |
| 보안이 걸린 코드, 커밋 전 | `security-reviewer` |
| 빌드·타입 오류 | `build-error-resolver` |
| README 갱신 | `doc-updater` |

서브에이전트는 **중간 산출물을 확인하지 않아도 되는 일**에만 띄웁니다.
훑을 양이 6만 자를 넘고 돌려받을 것이 한 문단일 때가 그 경우입니다.
수정할 파일과 내용이 정해진 편집은 직접 합니다.
서브에이전트 2개 이상을 동시에 띄우는 것은 시간이 급할 때만 합니다. 비용은 개수만큼 늘어납니다.

서브에이전트 하나의 고정비는 프리앰블 38,000 토큰이고, 그 값은 그 에이전트가 도는 내내
매 요청마다 다시 나갑니다. 유일한 이득은 그 에이전트가 읽은 것이 끝나면 버려진다는 것뿐입니다.
결과를 이쪽에서 검토해야 하는 일은 내용이 어차피 이 대화로 들어오므로 이득이 없습니다.

위임할 때는 파일 경로와 줄 번호, 무엇을·왜·어떻게를 빠짐없이 넘깁니다 — 서브에이전트는
이 대화를 보지 못합니다.
목록에 없는 에이전트가 필요해지면 ECC 캐시에서 그 파일 하나만 `.claude/agents/` 로 옮기고
표에 적습니다. 플러그인을 통째로 켜지 않습니다.

---
## 2. 이 프로젝트의 스킬

`.claude/skills/` 에 있는 것이 전부입니다. 아래 스무 개는 ECC에서 옮겨 왔습니다.

- **서버** — `python-patterns`, `python-testing`, `fastapi-patterns`, `error-handling`, `coding-standards`
- **데이터** — `postgres-patterns`, `database-migrations`
- **배포** — `docker-patterns`, `deployment-patterns`
- **화면** — `react-patterns`, `react-testing`, `react-performance`, `frontend-a11y`, `design-system`
- **테스트** — `tdd-workflow`, `e2e-testing`
- **점검** — `security-review`, `security-scan`, `context-budget`, `repo-scan`

`coding-standards`는 주석 규칙이 아래 `refactoring` 스킬과 충돌합니다. 충돌 시 `refactoring`이 우선합니다.

ECC 밖의 스킬은 네 가지를 씁니다 — 문서는 `cluedoc`(`KeunwooPark/cluedoc`, `.claude/skills/` 에 있습니다),
외부 포맷 내보내기는 `document-skills`, Claude API 연동은 `claude-api`, 그리고 `ui-ux-pro-max`.

ECC의 언어별 규칙 문서는 `.claude/rules/{common,python,react,typescript}/` 에 있습니다.
스킬과 에이전트가 이 경로를 참조합니다. 주석·가독성 규칙이 `refactoring` 스킬과 어긋나면
`refactoring` 이 정본입니다.

`ui-ux-pro-max` 는 **자료를 찾아보는 용도로만 씁니다.** 색 짝·폰트 짝·차트 종류를 고를 때
엽니다. 화면을 실제로 만드는 것은 6장이 정한 `example-skills:frontend-design` 입니다.
이 스킬에 화면을 맡기면 "이런 제품에는 보통 이런 색"의 평균값이 나와, 어느 서비스에
갖다 놔도 되는 화면이 됩니다.

---
## 2-1. 리팩토링 스킬 (이 저장소 것)

**리팩토링을 할 때는 `refactoring` 스킬을 반드시 invoke합니다.** 예외 없습니다.

모듈을 나누거나 합칠 때, 모듈 간 통신 방식을 정할 때, 메시지 규격을 바꿀 때,
코드 리뷰에서 컨벤션 위반을 찾을 때도 같습니다.

`.claude/skills/refactoring/SKILL.md` 에 있습니다. 목적은 `refactoring.md` 에 있습니다.

**수정하기 전에는 `refactor-audit` 스킬로 먼저 셉니다.** 리뷰어가 위반 판정으로 검사하고,
러너가 코드를 처음 보는 개발자 입장에서 막히는 지점을 질문으로 남깁니다. 두 결과를
`AUDIT.md` 한 장으로 합쳐 승인받은 뒤에 수정합니다. 규모를 모르고 손대지 않습니다.

---
## 2-2. 구현 방식

구현은 공통 규칙 4장의 **모드 3(TDD 후 ponytail)** 로 합니다. 실패하는 테스트를 먼저 쓰고,
실패하는 모습을 직접 본 다음에만 구현으로 넘어갑니다.

**리뷰는 기능 하나가 끝났을 때 한 번 돌립니다.** 덩어리마다가 아닙니다.
대상은 저장소가 아니라 `git diff` 로 한정합니다 — 검토자가 읽어야 할 양이 두 자릿수 배로 줄고,
바뀌지 않은 코드를 다시 훑는 일이 없어집니다.

해당 언어 검토자 하나를 고릅니다(`python-reviewer` `fastapi-reviewer` `database-reviewer`
`react-reviewer`). 보안이 걸린 diff 일 때만 `security-reviewer` 를 더합니다.
`code-reviewer` 는 언어 검토자가 없는 diff 에 씁니다. 셋을 한꺼번에 돌리지 않습니다.

**통과율 80% 미만이면 별도 검토 없이 그 부분을 다시 수정합니다.** 80% 이상이면
기준 통과점과 미흡점을 사용자에게 브리핑하고, 승인받은 뒤 다음으로 갑니다.

---
## 3. 문서

`cluedoc` 스킬이 관리합니다. 단 **`README.md`는 ECC 소관**입니다 — `doc-updater` 에이전트가 맡습니다.

### 3-1. 관리 범위

- **cluedoc**: `.cluedoc/` 아래 전부, `COMMAND.md`
- **ECC**: `README.md`
- **아무도 자동으로 건드리지 않음**: `CLAUDE.md`

담당 도구를 부르는 것은 **문서를 새로 만들거나 절 단위로 다시 쓸 때**입니다.
줄 몇 개 수정하는 정도는 직접 합니다.

<!-- cluedoc:start -->
### 3-1-1. 문서 동기화 (Cluedoc)

이 저장소는 `.cluedoc/` 아래에 기능마다 하나씩 사람이 읽는 그림 문서(paper)를 둡니다.
코드를 수정하고 나면 **cluedoc** 스킬로 영향받은 paper 를 전부 갱신합니다 — 상위·본인·하위 모두.
시스템 동작을 묻는 질문에 답할 때는 이 paper 들을 참고하고, 답 끝에 짧은 읽기 안내를 붙입니다.
<!-- cluedoc:end -->

### 3-2. 개발일지

사용자가 당일 작업 종료를 알리면 `dev_history/YYYY-MM-DD.md` 를 씁니다.
사용자의 고민과 결정이 어떤 흐름으로 진행되고 반영되었는지가 목적입니다.
트러블슈팅과 사용자 본인의 고민·결정사항을 반드시 담습니다.

**이 파일은 0장이 정한 세션 진입점이기도 합니다.** 다음 세션이 이 개발일지만 읽고 바로 이어서
일할 수 있어야 합니다. 그러려면 맨 앞에 **"지금 상태"** 를 둡니다 — 지금 무엇을 하던 중이고,
어느 파일이 어떤 상태이며, 다음 한 걸음이 무엇인지. 뒤쪽 서술을 읽지 않아도 이 항목만으로
재개할 수 있어야 합니다.

무엇을 했는지는 `git log`에 이미 있으므로 커밋 목록을 옮겨 적지 않습니다.
**맨 끝에 "남은 것" 항목을 둡니다** — 아직 못 한 작업을 개발일지 맨 끝에 적습니다. 별도 파일을 만들지 않습니다.

> 2026-08-27에 `PROGRESS.md`·`TASK.md`를 폐지했습니다. `git log`와 개발일지에 같은 내용이
> 중복돼서입니다. 파일은 `trash/2026-08-27-harness-ecc/` 에 있습니다. 다시 만들지 않습니다.

### 3-3. COMMAND.md

실행하는 모든 명령어를 기록합니다. 명령어마다 실행 경로, 용도, 붙인 옵션 전부의 의미(생략 시 기본값 포함), 주의점을 적습니다.

- **파일을 통째로 읽지 않습니다.** 해당 명령어를 검색해 확인하고, 없으면 그 자리에만 덧붙입니다.
- 실제로 실행해 동작을 확인한 명령어만 적습니다. 추측으로 적지 않습니다.
- 설명하지 못하는 옵션은 붙이지 않습니다.

`.cluedoc/` 하위 문서가 바뀌면 그 모듈을 만들고·돌리고·검증하는 명령어가 같이 바뀌었는지 확인하고 같은 작업 안에서 갱신합니다.

### 3-4. 외부 포맷으로 내보내기

PDF·PPT·Word·Excel은 `document-skills` 스킬을 포맷에 맞게 씁니다.

---
## 4. 기술 스택

- 서버 — Python 3.14, FastAPI, uv, SQLAlchemy, Alembic, pytest
- 배정 계산 — OR-Tools(CP-SAT)
- 데이터베이스 — PostgreSQL 17
- 화면 — React + Vite + TypeScript (React Router, TanStack Query, Vitest)
- LLM — Claude API — 아직 연동 전
- 실행 — Docker Compose

구성·흐름 등 상세 구조는 `.cluedoc/` 문서가 담습니다. 이 파일에는 "무엇을 쓰는지"만 적습니다.

---
## 5. 코드 스타일

- 타입 표기를 반드시 붙입니다. 함수의 매개변수와 반환값 모두.
- 이름 규칙은 언어의 표준을 따릅니다 — 파이썬은 함수·변수 `snake_case`, 클래스 `PascalCase`,
  화면 코드(TypeScript)는 변수·함수 `camelCase`, 컴포넌트·타입 `PascalCase`.
- 그 밖의 가독성·주석 규칙은 `refactoring` 스킬 7·8절이 정본입니다.

---
## 6. 이 프로젝트 고유 제약

- **화면은 직접 쓰지 않습니다.** 외형·배치·상호작용·디자인 체계는 `example-skills:frontend-design`
  같은 검증된 디자인 스킬로만 만듭니다. 로직·상태·서버 통신·테스트는 직접 써도 됩니다.
- **모든 실행은 컨테이너 안입니다.** 호스트에 파이썬 환경이 없습니다. 테스트도 마이그레이션도
  `docker compose run --rm dev ...` 로 돕니다. 명령은 `COMMAND.md` 가 정본입니다.
- **DB는 호스트 포트를 열지 않습니다.** 이 PC에 다른 프로덕트의 PostgreSQL이 떠 있어
  충돌을 피하려고 컨테이너 내부망(`db:5432`)만 씁니다. 확인은 `docker compose exec db` 로 합니다.
- **시각에 시간대를 붙이지 않습니다.** 배정 엔진이 시간대 없는 값만 받습니다. 여름시간제까지
  같이 설계하기 전에는 시간대 지원을 열지 않습니다.
- **점유 단위는 한 시간 칸 고정입니다.** 칸당 선착순 하나. 배정도 예약도 같은 구조를 씁니다.
  서버 쪽 정본은 `backend/src/backend/scheduling/slots.py` 의 `SLOT_MINUTES` 입니다.
- **사람은 이름이 아니라 번호로 구분합니다.** 동명이인이 있습니다.

---
## 7. 커밋 메시지

```
<scope>: <imperative summary>

<optional body>
```

허용 scope는 일곱 개입니다 — `scheduling` `docs` `infra` `backend` `frontend` `test` `chore`

- 이 형식은 커밋 검사 훅(`.githooks/commit-msg`)이 강제합니다. 어기면 커밋이 거부됩니다.
- 새로 받은 저장소는 한 번 `git config core.hooksPath .githooks` 를 실행해 훅을 켭니다.
- scope를 추가할 때는 `.githooks/commit-msg` 의 `SCOPES` 목록도 함께 수정합니다.
- 커밋 메시지 끝에 `Co-Authored-By` 같은 꼬리말을 붙이지 않습니다.

---
## 8. 비밀값

- API 키·비밀번호는 배포 디렉토리와 git에 절대 넣지 않습니다.
- 저장소 루트의 `.env`(환경별 `.env.dev`, `.env.test` 등)로 관리합니다.
- 파일 최상단에 어떤 API의 키이고 어느 계정에 연결된 것인지 적습니다. 없으면 사용자에게 요청합니다.
- 인증 토큰은 발행일과 유효기간을 적고 갱신합니다.

### 8-1. push에 포함하지 않는 것

- `trash/` — 삭제하는 대신 옮겨 두는 곳입니다.
- `.claude/settings.local.json` — 이 PC에만 해당하는 권한 목록입니다.
- `.env` 계열 — 비밀값이 듭니다. 견본(`.env.example`)만 예외로 올립니다.

규칙 파일과 훅·스킬(`CLAUDE.md`, `.claude/`)은 저장소가 함께 들고 다녀야 다른 PC에서도
같은 방식으로 일할 수 있으므로 포함합니다.

`dev_history/` 도 포함합니다. 무엇을 했고 무엇이 남았는지가 `dev_history/` 에만 있어서, 빠지면
다른 PC나 다음 세션에서 진행 상황을 따라갈 수 없습니다.
