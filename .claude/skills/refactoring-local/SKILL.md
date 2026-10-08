---
name: refactoring-local
description: Banblit 의 리팩토링 고유 사항 — 모듈 지도, 시퀀스 파일 이름, 직접 호출 예외, 테스트 위치, audit 기본 범위. 전역 refactoring 스킬이 함께 invoke 합니다. 규칙 자체는 전역 스킬에 있습니다.
---

# Banblit 리팩토링 보충

전역 `refactoring` 스킬의 규칙 위에 이 저장소에서 확정된 사항만 적습니다. 아래 사항은 다시 묻지 않고 적용합니다.
2026-10-08 에 저장소의 `refactoring`, `refactor-audit` 스킬을 전역으로 옮기면서 분리했습니다. 옛 파일은 `trash/2026-10-08-refactoring-global/` 에 있습니다.

## 모듈 지도 (1절)

서버는 `backend/src/backend/`, 화면은 `frontend/src/` 입니다. 시퀀스 파일 이름은 `pipeline.py` 입니다.

| 모듈 | 경로 | 책임 | 시퀀스 파일 |
|---|---|---|---|
| api (gateway) | `api/` | FastAPI app, router, 인증 dependency, rate limit. 도메인 판단 없음 | `app.py` |
| db | `db/` | engine, model, commit, schedule 저장 | `pipeline.py` |
| scheduling | `scheduling/` | CP-SAT 배정 계산. 시간대 없는 값만 받음(CLAUDE.md 6장) | `pipeline.py` |
| services/<도메인> | `services/auth`, `period`, `board`, `notification`, `permission`, `reservation`, `room`, `roster`, `settings`, `unavailable`, `validation` | 도메인 1개씩 | 각 디렉토리의 `pipeline.py` |
| jobs | `jobs/` | auto_assign 주기 실행 | `auto_assign.py` |
| contract | `contract.py` | api 와 scheduling 이 공유하는 규격 선언. 계산, 분기 없음 | — |
| 화면 routes | `frontend/src/routes/` | 주소 1개당 화면 1개 | — |
| 화면 components | `frontend/src/components/` | 화면 공용 부품. `queries.ts` 가 서버 조회 규격 | — |
| 화면 lib | `frontend/src/lib/` | 계산, 변환. React 에 의존하지 않음 | — |

## 통신 (2절)

- **message broker 는 적용하지 않습니다.** 서버 1개 process 의 FastAPI 입니다. 모듈 간 통신은 api(gateway) 의 router 가 services 의 `pipeline.py` 를 호출하는 직접 호출입니다.
- services 끼리의 직접 호출은 2절 예외입니다. 자리를 세어 둡니다. audit 때 목록을 갱신합니다.
- 외부와 직접 통신하는 자리(timeout 필수)

| 호출하는 쪽 | 대상 | timeout 위치 |
|---|---|---|
| `services/auth/mailer.py` | SMTP | 코드의 timeout 인자 |
| `db/engine.py` | PostgreSQL | connect 인자 |
| `frontend/src/lib/api.ts` | api | `REQUEST_TIMEOUT_MS`(AbortSignal.timeout), 업로드는 `UPLOAD_TIMEOUT_MS` |
| `frontend/nginx.conf.template` | api(배포) | `proxy_read_timeout 30s`. 배정 계산 상한과 함께 변경 |

- 규격 1세트: 서버는 `contract.py`, 화면은 `queries.ts`. 같은 field 를 다른 곳에 다시 선언하지 않습니다.

## 테스트 위치 (3절)

| 계층 | 경로 | 실행 명령(COMMAND.md) |
|---|---|---|
| 파일, 모듈 단위(서버) | `backend/tests/unit/` | 1-2 `docker compose run --rm dev pytest -q` |
| 통합(DB 연결) | `backend/tests/integration/` | 1-2 와 같은 명령. DB container 필요 |
| 화면 단위 | `frontend/src/**/*.test.tsx` | vitest |
| 화면 종단 | `frontend/e2e/*.spec.ts` | 12-1 `docker compose --profile e2e run --rm e2e` |

`banblit check` 가 서버 단위, 통합과 mypy 를 함께 실행합니다.

## health check (5절)

- 서버: `api/app.py` 의 `/health`. `db/health.py` 가 DB 연결을 실제로 확인하고, 실패한 의존 대상을 응답에 포함합니다.
- compose: `db` 는 `pg_isready`, `e2e-api` 는 `/health` 를 healthcheck 로 씁니다. `banblit up` 은 container 상태가 아니라 `/health` 와 5173 응답으로 준비를 판단합니다.

## 실행환경 분기 (6절)

- base = `docker-compose.yml`(배포). override = `docker-compose.override.yml`(개발). 규칙대로 Release 가 base 입니다.
- profile: `e2e`, `manual`, `deploy-only`(caddy, backup).
- 환경별 값은 `.env` 입니다. 견본은 `.env.example`.

## 주석 (7절)

- 어투("~합니다")와 용어는 `writing-style-local` 에 있습니다. 사용자 결정은 "(사용자 결정 YYYY-MM-DD)" 로 표시합니다.
- 시퀀스 파일 호출부 WHY 의 예: `services/period/pipeline.py` 에서 검증을 배정 계산보다 앞에 두는 이유를 호출 줄에 적습니다.

## 함수 크기 판정 예시 (8절)

| 예 | 줄 수 | JSX 외 담당 | 판정 |
|---|---|---|---|
| `routes/DayDialogParts.tsx RepeatFields` | 70 | 0 — 계산은 `lib/calendar` 에 있음 | 통과 |
| `routes/SettingsMembers.tsx SetForm` | 100 | 1 — 저장 mutation | 통과 |
| `routes/SettingsMembers.tsx SetRail`(수정 전) | 101 | 4 — 조회, 삭제 mutation, modal state 3개, 가로 스크롤 제어 | 위반 |

## 문서 (9절)

- 기능 문서는 `.cluedoc/` 의 paper(cluedoc 스킬). 명령은 `COMMAND.md`. 개발일지는 `dev_history/`.
- 폐기 위치는 `trash/<날짜>-<대상>/` 입니다. 파일을 삭제하지 않습니다.
- 진행도 문서(`PROGRESS.md`, `TASK.md`)는 2026-08-27 에 폐지했습니다. 다시 만들지 않습니다.

## 다시 올리지 않는 항목 (사용자 결정 2026-10-08)

- `docker-compose.override.yml` 의 `dev` service 는 유지합니다. 테스트, migration 전용이고 api 의 환경변수를 테스트에 섞지 않기 위해서입니다.
- `.claude/skills/security-scan` 은 유지합니다. `.claude/` 설정 검사용이고 security-review(코드)와 대상이 다릅니다.
- `services/auth/mailer.py` 는 유지합니다. notification 등 다른 service 가 쓸 예정입니다.

## 다음 audit 에 올릴 항목 (사용자 결정 2026-10-08)

- `services/*/pipeline.py` 12개가 재export 전용(함수 0개)입니다. 1절 시퀀스 파일 규칙대로 호출 순서와 가변값을 pipeline.py 에 모으는 작업을 올립니다.

## audit 기본 범위

- 경로: `backend/src/` 와 `frontend/src/`. 인자로 경로를 받으면 그 범위.
- 검수 항목 6개(전역 audit)의 이 저장소 대상 — 1 문체: 주석, `.cluedoc/`, `COMMAND.md`, 자동화 파일. 2 병합: `services/*` 의 기능 파일, `.claude/skills/` 중복, 자동화 스크립트. 4 압축: `CLAUDE.md`(공통 규칙 `~/.claude/CLAUDE.md` 와 겹치는 줄). 5 압축: `COMMAND.md`(삭제된 옵션, service 의 절, `banblit.sh` 가 대체한 개별 명령). 6 정리: `trash/` 이동 대상, `.logs/`, 참조 0건 파일.
- 출력: 저장소 루트 `AUDIT.md`. 끝나면 `trash/<날짜>-refactor-audit/` 로 이동.
- 리뷰어는 "통신(2절)" 의 "적용하지 않음" 을 반영합니다. broker 미적용을 위반으로 올리지 않습니다.

## 목적 (저장소 루트의 refactoring.md 에서 2026-10-08 이동. 개발자님이 쓴 원문입니다)



## 첫 번째 목적

각 기능이 명확히 **분리된 결합도**를 가진 채, **기대 입력**과 **기대 출력**이 확정된 깨끗한 인터페이스만으로, 상대 기능 인터페이스와 **정형화**된 통신을 해야한다. 
이를 위해서는 **메시지 브로커** 기반 **이벤트 버스** 통신을 하여야 하며, 각 기능은 **완벽히 분리**된 별개의 기능이어야한다. 
각 기능의 분리는 **독립된 단위테스트가** 증명한다. 해당 기능은 명확히 독립적으로 **근본적인** 해당 기능의 성질을 완벽하게 재현해 낼 수 있어야한다. 
  

예를 들어, **결제 MSA(Micro Service Architecture, 기능 단위로 분리해 각각 배포하는 구조)**를 리팩토링한다고 가정을 해보자.
해당 MSA의 기능 중, 카카오페이로 결제 기능이 있다고 한다면, 카카오페이로 이동하는 버튼이 반드시 있어야한다.

해당 이동 버튼의 기능은 카카오페이 앱에 열기 요청을 보내는게 전부이다. 
즉 카카오페이측의 API가 외부의 요청으로 앱을 열기 위해 받아야하는 인터페이스 규칙을 맞춰서 호출만 하면 된다. 

증명하는 방법은 단위테스트로 해당 버튼을 누르고 카카오페이 API가 정상적인 Reponse를 주었다면, 그 모듈은 성공적인 테스트가 된것.



## 두 번째 목적

소스코드와 문서가 명확히 분리되어야 하고, 문서는 항상 내용과 분량, 문서 수 모두 **반드시 꼭 필요한 만큼만** 작성한다. 
임시문서는 임시 문서임을 반드시 기입하여야 하며, 해당 문서의 쓰임이 다한 경우 /trash로 보낸다. 

소스코드는 필요한 주석을 상세하게 남기되, """ """ 같은 멀티라인 주석으로 장황하게 쓰는 것을 금지한다.  
싱글라인 코멘트를 통한 핵심 1~2줄, 문서 및 주석은 UI, 백엔드, CPU, GPU, API 등 개발용어를

판, 뒷단, 처리기, 그림작가, 메뉴판 등 **임의의 한글 단어로 변환하여 설명하는 것을 엄격하게 금지한다**
주석은 A 함수에 B 값을 넣어 C를 한다. 등의 시퀀스가 한눈에 이해 가능한 양식으로 쓸것.

## 세 번째 목적

현재는 나(사용자님. 대표님 등 다른 호칭 금지) 하나만으로 개발을 진행하는 단독 개발이나,
동료 개발자, 혹은 인계받을 내 다음 개발자를 위해 반드시 이해하기 쉬운 구조로 소스코드를 개발한다.


> 다음과 같은 코드가 있다고 가정했을 때, comprehension(한 줄로 목록을 생성하는 구문)과 연산자를 사용할 수 있다.
> 이렇게 사용성이 개선될 때를 제외하고는 사용을 지양하는 것이 좋다.
> 코드 라인 수는 줄어들어 최적화에는 유리할 수 있으나,
> 가독성이 매우 떨어지며 code read 및 review에 드는 cost가 늘어난다.

```python

L = []

for i in range(10): # 10회 반복한다
    L.append(i) # "L" 리스트 가장 마지막 인덱스 뒤로 i를 반복 삽입한다

print(L) # 출력

# 위의 형태는 아래처럼 쓰는 것이 좋다.

L = [ i for i in range(10) ] # 단일 결과, 단일 출처, 단일 반복, 단일 조건일 경우 컴프리헨션을 사용한다.
print(*L) 

# 언패킹 연산자처럼 오타로 생각하거나 놓치기 쉬운 부분은 주석을 상세히 쓰는 것이 좋다.

print(*L) # 변수 앞의 * 기호는 포인터가 아니라 언패킹 연산자입니다.
# ["1", "2" ..] 형태의 출력을 1 2 .. 처럼 대괄호 및 큰따옴표를 없애고 공백으로 구분하여 출력합니다. 


```

따라서 위의 예시의 반복문 뿐 아니라,
함수 호출부, 연산, 변수, 상수 등 개발 전반적인 부분에서 과도하거나 불필요한 축약식 코드를 지양한다.


추가로 다음과 같은 경우의 케이스가 있다.

> 디버깅을 하지 않아도 고칠 수 있는 부분을 남겨서는 안된다.

```python

ip_and_port = input() # ip_and_port 는 "192.168.0.1:8000" 같은 형태를 기대

return ip_and_port

```

> 이런 경우는 입력값이 192.168.0.1 처럼 특정 기대값(포트번호도 있을것이라는 기대)에서 벗어날 가능성이 있으므로,
> 다음과 같이 작성해야한다.

```python

ip = input() # ip 는 "192.168.0.1" 같은 형태를 기대
port = input() # port 는 "8000" 같은 형태를 기대

ip_and_port = f"{ip}:{port}"

```


추가로 다음과 같은 케이스도 있다.
필요 이상으로 늘리거나 풀어서 작성하여서도 안된다.

```python

# x가 5보다 큰지를 비교하고 True 혹은 False로 리턴할 때, 해당 if문은 불필요하다.
if x > 5:
    return True
else:
    return False

# 이렇게 축약하는 것은 매우 기초적인 부분이며, 이해에 드는 노력이 늘지 않는다.
return x > 5

```


배열의 길이만큼 순회하는 for문의 경우, 예약어인 enumerate를 사용하는 것이 좋다.

```python

for i in range(len(arr)):
    print(i, arr[i])

# enumerate 쓰면 됨
for i, v in enumerate(arr):
    print(i, v)

```

## 네 번째 목적

**장애구역 격리**를 목표로 한다.
작은 기능 하나의 소스코드까지 깊은 단계에서 모두 다 구역을 격리할 수는 없겠으나, 

게시판 MSA의 글쓰기 기능에 장애가 생겼다면, 해당 장애가 글 저장 기능에 까지 **확산되지 않아야한다.**

나아가 하나의 MSA가 장애가 **다른 MSA로의 장애 확산**을 하지 않도록,
각 MSA는 **명확히 분리된 컨테이너**에서 **gateway(단일 진입 서버)를 통한 handshake(연결 확인 절차)**만을 진행하여, 장애 확산을 막는다.

## 다섯 번째 목적

**Health check(서버 생존 확인 요청)**를 매우 견고히 한다.
장애구역을 조기에 판단하고 모니터링하여, 장애를 사전에 분리할 수 있도록
상세하고 견고한 헬스체크를 반드시 구성한다.

## 여섯 번째 목적 

**서비스의 갈래**를 명확히 구분하여, 독립된 실행환경을 구성한다.

**릴리즈**와 **데모**가 같은 파이프라인을 쓴다고 해도, 각 서버에서만 필요한 부분이 있을 것이다.
해당 지점을 명확히 분기하기 위해서는 상기 첫 번째 목적에서 언급한, 파이프라인 자체가 인터페이스화가 되어있어야 할 것이다.

릴리즈와 데모는 서로 다른 이유로 필요에 의해 각 모듈의 API를 호출할 것이고,
공통적인 API로 해결할 수 없는 독자적인 기능은, 별도의 독립환경에 각각 구현하여 쌓아 나갈 것이다.

또한 **개발** 서버와 **테스트** 서버의 특수성도 마찬가지이다. 

Dev, Test, Relese, Demo의 각 특수성을 고려하여, 각 대상이 독립된 환경에서 고유 의존성 모듈을 쌓아 나가는 것을 목표로 한다.
물론 해당 독립환경 내에서의 기능간 통신 또한 인터페이스화가 되어있어야한다.
