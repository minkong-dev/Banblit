# CLAUDE.md — Banblit 전용 지침

공통 규칙은 `~/.claude/CLAUDE.md` 에 있다. 핵심 원칙, 소통 방식, 파일 생성 3모드,
코드 리뷰, 코딩 규칙, 보안, 커밋, 파일 삭제, 문서 형상관리 — 전부 거기다.

이 파일은 **이 프로젝트에만 해당하는 것**만 담는다. 공통 규칙과 겹치면 이 파일이 우선한다.

---
## 1. 이 프로젝트에서 쓰는 ECC 에이전트

ECC에는 에이전트가 67개 있다. 이 프로젝트에서 부르는 것은 아래로 한정한다.

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

구현 단위는 가능한 한 작게 나눠 서브에이전트에 위임한다. 메인 대화는 계획·통합·검증에
집중한다. 독립적인 작업이 2개 이상이면 한 번에 함께 띄워 동시에 돌린다.
위임할 때는 파일 경로와 줄 번호, 무엇을·왜·어떻게를 빠짐없이 넘긴다 — 서브에이전트는
이 대화를 보지 못한다.
목록에 없는 에이전트는 필요해질 때 이 표에 추가하고 쓴다. 미리 켜두지 않는다.

---
## 2. 이 프로젝트에서 쓰는 ECC 스킬

ECC에는 스킬이 281개 있다. 이 프로젝트 구성에 맞는 것은 아래뿐이다. 나머지는 부르지 않는다.

- **서버** — `python-patterns`, `python-testing`, `fastapi-patterns`, `error-handling`, `coding-standards`
- **데이터** — `postgres-patterns`, `database-migrations`
- **배포** — `docker-patterns`, `deployment-patterns`
- **화면** — `react-patterns`, `react-testing`, `react-performance`, `frontend-a11y`, `design-system`
- **테스트** — `tdd-workflow`, `e2e-testing`
- **점검** — `security-review`, `security-scan`, `context-budget`, `repo-scan`

`coding-standards`는 주석 규칙이 아래 `refactoring` 스킬과 충돌한다. 충돌 시 `refactoring`이 우선한다.

ECC 밖의 스킬은 네 가지를 쓴다 — 문서는 `cluedoc`, 외부 포맷 내보내기는 `document-skills`,
Claude API 연동은 `claude-api`, 그리고 `ui-ux-pro-max`.

`ui-ux-pro-max` 는 **자료를 찾아보는 용도로만 쓴다.** 색 짝·폰트 짝·차트 종류를 고를 때
연다. 화면을 실제로 만드는 것은 6장이 정한 `example-skills:frontend-design` 이다.
이 스킬에 화면을 맡기면 "이런 제품에는 보통 이런 색"의 평균값이 나와, 어느 서비스에
갖다 놔도 되는 화면이 된다.

---
## 2-1. 리팩토링 스킬 (이 저장소 것)

**리팩토링을 할 때는 `refactoring` 스킬을 반드시 invoke한다.** 예외 없다.

모듈을 나누거나 합칠 때, 모듈 간 통신 방식을 정할 때, 메시지 규격을 바꿀 때,
코드 리뷰에서 컨벤션 위반을 찾을 때도 같다.

`.claude/skills/refactoring/SKILL.md` 에 있다. 목적은 `refactoring.md` 에 있다.

**고치기 전에는 `refactor-audit` 스킬로 먼저 센다.** 리뷰어가 위반 판정으로 검사하고,
러너가 코드를 처음 보는 개발자 입장에서 막히는 지점을 질문으로 남긴다. 두 결과를
`AUDIT.md` 한 장으로 합쳐 승인받은 뒤에 고친다. 규모를 모르고 손대지 않는다.

---
## 2-2. 구현 방식

구현은 공통 규칙 4장의 **모드 2(TDD)** 로 한다. 실패하는 테스트를 먼저 쓰고,
실패하는 모습을 직접 본 다음에만 구현으로 넘어간다.

한 덩어리가 끝나면 `code-reviewer` 와 해당 언어 검토자를 돌린다.
**통과율 80% 미만이면 별도 검토 없이 그 부분을 다시 고친다.** 80% 이상이면
기준 통과점과 미흡점을 사용자에게 브리핑하고, 승인받은 뒤 다음으로 간다.

---
## 3. 문서

`cluedoc` 스킬이 관리한다. 단 **`README.md`는 ECC 소관**이다 — `doc-updater` 에이전트가 맡는다.

### 3-1. 관리 범위

- **cluedoc**: `.cluedoc/` 아래 전부, `COMMAND.md`
- **ECC**: `README.md`
- **아무도 자동으로 건드리지 않음**: `CLAUDE.md`

담당 도구를 부르는 것은 **문서를 새로 만들거나 절 단위로 다시 쓸 때**다.
줄 몇 개 고치는 정도는 직접 한다.

<!-- cluedoc:start -->
### 3-1-1. 문서 동기화 (Cluedoc)

이 저장소는 `.cluedoc/` 아래에 기능마다 하나씩 사람이 읽는 그림 문서(paper)를 둔다.
코드를 고치고 나면 **cluedoc** 스킬로 영향받은 paper 를 전부 갱신한다 — 상위·본인·하위 모두.
시스템 동작을 묻는 질문에 답할 때는 이 paper 들을 참고하고, 답 끝에 짧은 읽기 안내를 붙인다.
<!-- cluedoc:end -->

### 3-2. 개발일지

사용자가 당일 작업 종료를 알리면 `dev_history/YYYY-MM-DD.md` 를 쓴다.
사용자의 고민과 결정이 어떤 흐름으로 진행되고 반영되었는지가 목적이다.
트러블슈팅과 사용자 본인의 고민·결정사항을 반드시 담는다.

무엇을 했는지는 `git log`에 이미 있으므로 커밋 목록을 옮겨 적지 않는다.
**맨 끝에 "남은 것" 항목을 둔다** — 아직 못 한 작업을 여기에 적는다. 별도 파일을 만들지 않는다.

> 2026-08-27에 `PROGRESS.md`·`TASK.md`를 폐지했다. `git log`와 개발일지에 같은 내용이
> 중복돼서다. 파일은 `trash/2026-08-27-harness-ecc/` 에 있다. 다시 만들지 않는다.

### 3-3. COMMAND.md

실행하는 모든 명령어를 기록한다. 명령어마다 실행 경로, 용도, 붙인 옵션 전부의 의미(생략 시 기본값 포함), 주의점을 적는다.

- **파일을 통째로 읽지 않는다.** 해당 명령어를 검색해 확인하고, 없으면 그 자리에만 덧붙인다.
- 실제로 실행해 동작을 확인한 명령어만 적는다. 추측으로 적지 않는다.
- 설명하지 못하는 옵션은 붙이지 않는다.

`.cluedoc/` 하위 문서가 바뀌면 그 모듈을 만들고·돌리고·검증하는 명령어가 같이 바뀌었는지 확인하고 같은 작업 안에서 갱신한다.

### 3-4. 외부 포맷으로 내보내기

PDF·PPT·Word·Excel은 `document-skills` 스킬을 포맷에 맞게 쓴다.

---
## 4. 기술 스택

- 서버 — Python 3.14, FastAPI, uv, SQLAlchemy, Alembic, pytest
- 배정 계산 — OR-Tools(CP-SAT)
- 데이터베이스 — PostgreSQL 17
- 화면 — React + Vite + TypeScript (React Router, TanStack Query, Vitest) — 아직 코드 없음
- LLM — Claude API — 아직 연동 전
- 실행 — Docker Compose

구성·흐름 등 상세 구조는 `.cluedoc/` 문서가 담는다. 여기에는 "무엇을 쓰는지"만 적는다.

---
## 5. 코드 스타일

- 타입 표기를 반드시 붙인다. 함수의 매개변수와 반환값 모두.
- 이름 규칙은 언어의 표준을 따른다 — 파이썬은 함수·변수 `snake_case`, 클래스 `PascalCase`,
  화면 코드(TypeScript)는 변수·함수 `camelCase`, 컴포넌트·타입 `PascalCase`.
- 그 밖의 가독성·주석 규칙은 `refactoring` 스킬 7·8절이 정본이다.

---
## 6. 이 프로젝트 고유 제약

- **화면은 직접 쓰지 않는다.** 외형·배치·상호작용·디자인 체계는 `example-skills:frontend-design`
  같은 검증된 디자인 스킬로만 만든다. 로직·상태·서버 통신·테스트는 직접 써도 된다.
- **모든 실행은 컨테이너 안이다.** 호스트에 파이썬 환경이 없다. 테스트도 마이그레이션도
  `docker compose run --rm dev ...` 로 돈다. 명령은 `COMMAND.md` 가 정본이다.
- **DB는 호스트 포트를 열지 않는다.** 이 PC에 다른 프로덕트의 PostgreSQL이 떠 있어
  충돌을 피하려고 컨테이너 내부망(`db:5432`)만 쓴다. 확인은 `docker compose exec db` 로 한다.
- **시각에 시간대를 붙이지 않는다.** 배정 엔진이 시간대 없는 값만 받는다. 여름시간제까지
  같이 설계하기 전에는 시간대 지원을 열지 않는다.
- **점유 단위는 30분 칸 고정이다.** 칸당 선착순 하나. 배정도 예약도 같은 구조를 쓴다.
- **사람은 이름이 아니라 번호로 구분한다.** 동명이인이 있다.

---
## 7. 커밋 메시지

```
<scope>: <imperative summary>

<optional body>
```

허용 scope는 일곱 개다 — `scheduling` `docs` `infra` `backend` `frontend` `test` `chore`

- 이 형식은 커밋 검사 훅(`.githooks/commit-msg`)이 강제한다. 어기면 커밋이 거부된다.
- 새로 받은 저장소는 한 번 `git config core.hooksPath .githooks` 를 실행해 훅을 켠다.
- scope를 추가할 때는 `.githooks/commit-msg` 의 `SCOPES` 목록도 함께 고친다.
- 커밋 메시지 끝에 `Co-Authored-By` 같은 꼬리말을 붙이지 않는다.

---
## 8. 비밀값

- API 키·비밀번호는 배포 디렉토리와 git에 절대 넣지 않는다.
- 저장소 루트의 `.env`(환경별 `.env.dev`, `.env.test` 등)로 관리한다.
- 파일 최상단에 어떤 API의 키이고 어느 계정에 연결된 것인지 적는다. 없으면 사용자에게 요청한다.
- 인증 토큰은 발행일과 유효기간을 적고 갱신한다.

### 8-1. push에 포함하지 않는 것

- `dev_history/` — 내부 기록이다.
- `trash/` — 지우는 대신 옮겨 두는 곳이다.
- `.claude/settings.local.json` — 이 PC에만 해당하는 권한 목록이다.
- `.env` 계열 — 비밀값이 든다. 견본(`.env.example`)만 예외로 올린다.

규칙 파일과 훅·스킬(`CLAUDE.md`, `.claude/`)은 저장소가 함께 들고 다녀야 다른 PC에서도
같은 방식으로 일할 수 있으므로 포함한다.
