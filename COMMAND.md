# COMMAND

> 문서 버전: 1.7.0 draft

이 문서는 Banblit에서 실제로 실행해 동작을 확인한 명령어만 담는다.
실행해 보지 않은 명령어는 적지 않는다.

각 명령어는 **실행 경로 / 용도 / 옵션별 의미 / 주의점** 순으로 기록한다.

---

## 1. 컨테이너 — 개발용

### 1-1. 개발용 이미지 만들기

```
docker compose build dev
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 개발용 컨테이너 이미지(`banblit-backend:dev`)를 만든다. 파이썬 3.14, OR-Tools, pytest가 들어간 환경이 이 안에 담긴다.
- **옵션**
  - `build` — `docker-compose.yml`에 적힌 설정대로 이미지를 만든다. 만들기만 하고 실행하지 않는다.
  - `dev` — 만들 대상 서비스 이름. `docker-compose.yml`의 `services.dev`를 가리킨다. 생략하면 정의된 모든 서비스를 만든다.
- **주의점**
  - 처음 실행하면 파이썬 기반 이미지와 OR-Tools를 인터넷에서 받아오므로 몇 분 걸린다. 두 번째부터는 캐시가 있어 몇 초로 끝난다.
  - `backend/pyproject.toml` 또는 `backend/uv.lock`이 바뀌면 다시 실행해야 한다. 소스 코드만 고친 경우에는 다시 만들 필요가 없다.

### 1-1-1. 의존성을 추가한 뒤 잠금 파일 갱신하기

```
docker compose run --rm --no-deps dev uv lock
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `backend/pyproject.toml`에 패키지를 추가·삭제한 뒤, 실제로 설치할 버전을 확정해 `backend/uv.lock`에 적는다. 이미지는 `uv sync --locked`로 잠금 파일에 적힌 버전 그대로만 설치하므로, 이 단계를 건너뛰면 `1-1` 빌드가 "잠금 파일이 pyproject.toml과 맞지 않는다"며 실패한다.
- **옵션**
  - `--no-deps` — 잠금 파일을 만드는 데 PostgreSQL 이 필요 없으므로 `db` 서비스를 띄우지 않는다.
  - `uv lock` — 컨테이너 안에서 실행할 명령. 호스트에는 파이썬 환경이 없어 `uv`를 쓸 수 없다. 컨테이너의 `/app`이 내 PC의 `backend/` 폴더와 연결돼 있어, 갱신된 잠금 파일이 그대로 내 PC에 남는다.
- **주의점**
  - 이 명령 뒤에는 반드시 `1-1`(`docker compose build dev`)을 실행해야 새 패키지가 이미지에 들어간다.

### 1-2. 컨테이너 안에서 테스트 돌리기

```
docker compose run --rm dev pytest -q
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 개발용 컨테이너를 띄워 그 안에서 테스트를 실행한다. 이것이 이 프로젝트의 **기준 테스트 실행 방법**이다.
- **옵션**
  - `run` — 서비스를 일회성으로 띄워 명령을 실행한다. 명령이 끝나면 컨테이너도 멈춘다.
  - `--rm` — 끝난 컨테이너를 자동으로 지운다. 붙이지 않으면 실행할 때마다 멈춘 컨테이너가 쌓인다.
  - `dev` — 실행할 서비스 이름.
  - `pytest` — 컨테이너 안에서 실행할 명령. 이미지에 기본 실행 명령으로도 `pytest`가 지정돼 있어 생략 가능하지만, 뒤에 옵션을 붙이려면 이렇게 적어야 한다.
  - `-q` — 결과를 짧게 출력한다(통과한 테스트를 점 하나로 표시). 붙이지 않으면 기본값인 보통 길이로 출력한다.
- **자주 쓰는 변형**
  - `docker compose run --rm dev pytest -v` — 테스트 이름을 하나씩 모두 출력한다. 어떤 시나리오를 검사하는지 눈으로 확인할 때 쓴다.
  - `docker compose run --rm dev pytest tests/unit/test_resolution.py` — 특정 파일만 돌린다.
- **주의점**
  - 내 PC의 `backend/` 폴더가 컨테이너 안에 연결돼 있어, 코드를 고치면 이미지를 다시 만들지 않아도 바로 반영된다.

### 1-2-1. 아무것도 띄우지 않고 순수 계산 테스트만 돌리기

```
docker compose run --rm --no-deps dev pytest -q tests/unit
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 바깥과 통신하지 않는 검사만 돌린다. 실패가 코드 탓인지 환경 탓인지 갈라낼 때 먼저 이것을 돌린다.
- **옵션**
  - `--no-deps` — `docker-compose.yml`에서 `dev`가 의존하는 `db` 서비스를 띄우지 않는다. 붙이지 않으면 PostgreSQL 이 먼저 떠서, 아무것도 없이 도는지를 확인하는 의미가 없어진다.
  - `tests/unit` — 돌릴 폴더를 지정한다. 생략하면 `tests/` 전체가 돌아 통합 검사까지 포함된다.
- **주의점**
  - 바깥과 실제로 통신하는 검사는 `tests/integration/<의존 대상>/` 아래에 둔다. 지금은 `tests/integration/db/` 하나뿐이다.
  - 폴더 이름이 곧 표시(marker) 이름이다. `backend/tests/conftest.py`의 `pytest_collection_modifyitems`가 폴더를 보고 자동으로 붙인다. 표시 이름 자체는 `backend/pyproject.toml`의 `[tool.pytest.ini_options]`에 등록돼 있다.
  - `tests/unit` 의 검사가 실제 DB 픽스처(`test_engine`·`db_session`·`api_client`)를 쓰면 수집 단계에서 멈춘다. DB 가 떠 있는 동안 조용히 통과해 버리는 것을 막기 위해서다.
  - 2026-08-28 기준 전체 145개 중 `tests/unit` 이 91개, `tests/integration/db` 가 54개다.

### 1-2-2. DB 가 필요한 테스트만 돌리기

```
docker compose run --rm dev pytest -q tests/integration/db
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 실제 PostgreSQL 에 붙어야 도는 검사만 돌린다.
- **주의점**
  - `--no-deps` 를 붙이면 안 된다. `db` 서비스가 떠 있어야 한다.
  - 표시로 고르는 `-m db` 도 같은 결과를 낸다. 폴더 쪽이 눈에 더 잘 보여 이쪽을 정본으로 쓴다.

### 1-2-3. 타입 검사 돌리기

```
docker compose run --rm --no-deps dev mypy
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 표기한 타입과 실제로 넘어가는 값이 어긋나지 않는지 검사한다. `CLAUDE.md`가 모든 함수에 타입 표기를 요구하는데, 이 검사가 없으면 표기가 맞는지 아무도 확인하지 않는다.
- **옵션**
  - `--no-deps` — 타입 검사는 코드를 읽기만 하므로 PostgreSQL 이 필요 없다.
  - `mypy` — 검사할 대상을 뒤에 적지 않는다. `backend/pyproject.toml`의 `[tool.mypy]`에 `files = ["src", "tests"]`로 적혀 있어 그 둘을 검사한다.
- **주의점**
  - `disallow_untyped_defs`가 켜져 있다. 표기가 빠진 함수는 mypy가 속을 아예 들여다보지 않으므로, 표기가 빠진 것 자체를 오류로 잡는다.
  - 2026-08-28 기준 소스 44개 파일이 오류 없이 통과한다.

### 1-3. 가장 느린 테스트 확인하기

```
docker compose run --rm dev pytest -q --durations=5
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 전체 테스트를 실행하면서, 실행 시간이 긴 테스트를 순서대로 뽑아 보여준다. 기간 자동 배정처럼 계산량이 실제 운영 규모에 가까운 테스트가 얼마나 걸리는지 확인할 때 쓴다.
- **옵션**
  - `run --rm dev pytest -q` — `1-2`와 동일. 개발용 컨테이너를 일회성으로 띄워 테스트를 짧은 출력으로 돌린다.
  - `--durations=5` — 테스트가 모두 끝난 뒤, 실행 시간이 긴 순서로 5개까지만 목록에 보여준다. 숫자는 몇 개까지 보여줄지를 정하며, 생략하면 이 목록 자체가 출력되지 않는다(`--durations=0`을 주면 전체 테스트를 모두 나열한다).
- **주의점**: 시간 값은 실행하는 기계 성능에 좌우된다. 이 저장소 문서에 적힌 수치는 이 방법으로 측정한 실측값이며, 다른 환경에서는 달라질 수 있다.

### 1-4. 컨테이너 안에 직접 들어가기

```
docker compose run --rm dev bash
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 컨테이너 내부를 직접 둘러본다. 설치된 패키지 확인이나 명령 시험에 쓴다.
- **옵션**
  - `bash` — 컨테이너 안에서 실행할 명령을 명령줄 셸로 지정한다.
- **주의점**: 나올 때는 `exit`를 입력한다. `--rm`이 붙어 있어 나오는 순간 컨테이너가 지워지므로, 컨테이너 안에서 연결된 폴더 밖에 만든 파일은 사라진다.

---

## 2. 컨테이너 — 배포용

### 2-1. 배포용 이미지 만들기

```
docker build --target prod -t banblit-backend:prod backend/
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 실행에 필요한 것만 담긴 배포용 이미지를 만든다. 테스트 도구는 들어가지 않는다.
- **옵션**
  - `--target prod` — `Dockerfile`의 여러 단계 중 `prod` 단계까지만 만든다. 생략하면 파일에 적힌 마지막 단계까지 만든다.
  - `-t banblit-backend:prod` — 만든 이미지에 붙일 이름과 꼬리표. 생략하면 이름 없는 이미지가 되어 나중에 찾기 어렵다.
  - `backend/` — `Dockerfile`과 복사 대상 파일들이 있는 폴더. 이 폴더가 기준이 되므로 `backend/` 바깥 파일은 이미지에 넣을 수 없다.
- **주의점**: 배포용 단계는 소스를 이미지 안에 복사해 넣는다. 코드를 고쳤으면 반드시 다시 만들어야 반영된다.

### 2-2. 배포용 이미지 동작 확인

```
docker run --rm -d -p 8001:8000 --name banblit-prod-check banblit-backend:prod
curl -s http://localhost:8001/health
docker stop banblit-prod-check
```

- **실행 경로**: 어디서든 무관 (단, 8001 포트가 이미 쓰이고 있지 않아야 한다)
- **용도**: 배포용 이미지가 실제로 서버로 기동해 요청에 응답하는지 확인한다. 배포용 `Dockerfile`의 실행 명령이 `uvicorn backend.api.app:app`으로 서버를 띄우도록 바뀌면서, 컨테이너가 문구만 출력하고 끝나던 이전 방식(`python -c "..."`)은 더 이상 쓸 수 없다 — 서버는 종료되지 않고 계속 떠 있으므로 포트를 열어 응답을 확인해야 한다.
- **옵션**
  - `docker run` — 이미지로 컨테이너를 새로 만들어 실행한다.
  - `--rm` — 컨테이너가 멈추면 자동으로 지운다.
  - `-d` — 백그라운드로 띄운다. 붙이지 않으면 서버가 터미널을 점유해 뒤 명령을 칠 수 없다.
  - `-p 8001:8000` — 내 PC의 8001번 포트를 컨테이너 안의 8000번 포트에 연결한다. 개발용 `api` 서비스(`3-1`)가 8000번을 쓰므로, 겹치지 않게 8001번을 썼다.
  - `--name banblit-prod-check` — 컨테이너에 이름을 붙인다. 뒤에서 `docker stop`으로 정지시킬 때 이 이름으로 찾는다. 생략하면 임의의 이름이 붙어 찾기 번거롭다.
  - `curl -s http://localhost:8001/health` — 서버가 응답하는지 확인. `-s`는 진행 표시를 숨긴다. `{"status":"ok"}`가 나오면 정상.
  - `docker stop banblit-prod-check` — 이름으로 컨테이너를 정지시킨다. `--rm`이 붙어 있으므로 정지 즉시 컨테이너도 삭제된다.
- **주의점**: `-d` 없이 실행하면 터미널이 서버 로그로 막혀 다음 명령을 칠 수 없다. 확인이 끝나면 반드시 `docker stop`으로 내려야 컨테이너가 계속 떠 있는 채로 남지 않는다.

### 2-3. 배포용에 테스트 도구가 없는지 확인

```
docker run --rm banblit-backend:prod python -c "import pytest"
```

- **실행 경로**: 어디서든 무관
- **용도**: 배포용 이미지에 개발용 도구가 섞여 들어가지 않았는지 검사한다.
- **옵션**
  - `python -c "..."` — 컨테이너 안에서 따옴표 안의 파이썬 코드를 실행한다.
- **주의점**: **이 명령은 실패해야 정상이다.** `ModuleNotFoundError: No module named 'pytest'`가 나오면 단계 분리가 제대로 된 것이다. 성공하면 배포용에 테스트 도구가 섞인 것이므로 `Dockerfile`을 점검해야 한다.

---

## 3. 스케줄링 API 서버 — 로컬 기동

### 3-1. 개발용 API 서버 띄우기

```
docker compose up -d api
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker-compose.yml`의 `api` 서비스를 백그라운드로 띄워, `http://localhost:8000`에서 스케줄링 API(`GET /health`, `POST /assign`)를 호출할 수 있게 한다. `api` 서비스는 개발용(`dev`) 이미지를 쓰고 `backend/` 폴더를 컨테이너에 연결해, `--reload` 옵션으로 코드를 고치면 서버가 자동으로 다시 뜬다.
- **옵션**
  - `up` — 정의된 서비스를 만들고(필요하면 이미지를 빌드) 실행한다.
  - `-d` — 백그라운드로 띄운다. 붙이지 않으면 터미널이 서버 로그로 막혀 다음 명령을 칠 수 없다.
  - `api` — 띄울 대상 서비스 이름. `docker-compose.yml`의 `services.api`를 가리킨다. 생략하면 `docker-compose.yml`에 정의된 서비스가 모두 뜬다(`dev`는 기본 명령이 `pytest`라 곧바로 종료된다).
- **주의점**
  - 8000번 포트가 이미 다른 프로그램(다른 프로젝트의 컨테이너 등)에 쓰이고 있으면 `port is already allocated` 오류로 실패한다. 이 저장소와 무관한 컨테이너가 그 포트를 쓰고 있다면, 함부로 내리지 말고 `CLAUDE.md` 4-1에 따라 먼저 사용자에게 확인받는다.
  - `backend/pyproject.toml` 또는 `backend/uv.lock`이 바뀐 뒤라면 `docker compose build dev`로 이미지를 먼저 다시 만들어야 새 패키지가 반영된다(`api` 서비스는 `dev` 이미지를 그대로 쓴다).

### 3-1-1. 띄운 서버 내리기

```
docker compose stop api
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `3-1`로 띄운 API 서버를 멈춘다. 8000번 포트를 놓아준다.
- **옵션**
  - `stop` — 컨테이너를 멈추기만 하고 지우지는 않는다. 다음에 `up -d api`로 다시 띄우면 같은 컨테이너를 쓴다. 지우려면 `stop` 대신 `down`을 쓰지만, `down`은 `db`까지 함께 내리므로 주의한다.
  - `api` — 멈출 서비스 이름. 생략하면 `db`를 포함한 모든 서비스가 멈춘다.

### 3-1-2. 서버 기록 보기

```
docker compose logs api --tail 30
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: API 서버가 남긴 기록을 본다. 요청이 500이나 503으로 답했을 때 원인을 여기서 찾는다.
- **옵션**
  - `--tail 30` — 마지막 30줄만 본다. 생략하면 기동 이후 전부를 출력해 화면이 넘친다.

### 3-2. 서버 응답 확인

```
curl -s http://localhost:8000/health
```

- **실행 경로**: 어디서든 무관 (단, `3-1`로 `api` 서비스가 떠 있어야 한다)
- **용도**: 서버가 정상적으로 응답하는지 확인한다. `{"status":"ok"}`가 나오면 정상.
- **옵션**
  - `-s` — 진행률 표시줄을 숨기고 응답 본문만 출력한다.
- **주의점**: Git Bash에서 한글이 포함된 JSON 본문을 작은따옴표로 감싼 인라인 인자(`-d '...'`)로 `POST /assign`에 넘기면 인코딩이 깨져 `"There was an error parsing the body"`가 돌아온다. 한글이 포함된 요청은 UTF-8로 저장한 파일을 `--data-binary @파일명`으로 넘겨야 한다.

### 3-3. 서버 내리기

```
docker compose down
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker compose up`으로 띄운 서비스(컨테이너·네트워크)를 정리한다.
- **옵션**: 옵션 없이 사용 — `docker-compose.yml`에 정의된 모든 서비스를 대상으로 정리한다.
- **주의점**: 이 저장소가 띄운 서비스만 내린다. 다른 프로젝트의 컨테이너에는 영향을 주지 않는다.

---

### 3-4. 프로토타입 화면을 실제 데이터로 열어보기

```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/proto/scheduler-live.html
start http://localhost:8000/proto/scheduler-live.html
start http://localhost:8000/proto/assignment-live.html
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `frontend/prototypes/` 의 화면을 **API 서버가 함께 내보내는 주소**로 연다. `-live` 가 붙은 사본은 하드코딩 데이터를 지우고 실제 API 응답을 그린다. 원본(`scheduler.html`, `assignment.html`)은 확정된 화면 설계의 근거라 손대지 않고 그대로 둔다.
- **옵션**
  - `curl -s` — 진행률 표시를 끈다. `-o /dev/null` 은 본문을 버리고, `-w "%{http_code}"` 는 상태 코드만 출력한다. 화면을 열기 전에 서빙이 붙었는지만 확인할 때 쓴다.
  - `start <url>` — Windows에서 기본 브라우저로 주소를 연다. 옵션 없이 주소만 넘긴다.
- **주의점**
  - **`3-1`로 API 서버가 떠 있어야 하고, `4-5`의 시드가 들어가 있어야 한다.** 서버가 없으면 주소 자체가 열리지 않고, 데이터가 없으면 달력이 빈 채로 뜬다.
  - 이 주소는 `docker-compose.yml` 의 `api` 서비스에 `./frontend/prototypes:/proto:ro` 를 걸고 `PROTOTYPE_DIR=/proto` 를 준 덕에 생긴다. 환경변수가 없으면 `backend/src/backend/api/app.py` 끝의 `app.mount` 가 아예 실행되지 않아 `/proto` 가 존재하지 않는다 — 배포에는 붙지 않는다는 뜻이다.
  - 파일을 브라우저로 직접 여는 것(`file://`)으로는 동작하지 않는다. 출처가 달라져 화면의 `fetch` 가 CORS 에 막힌다. 반드시 `localhost:8000/proto/` 로 연다.
  - 볼륨이 읽기 전용(`:ro`)이라 컨테이너 안에서는 이 파일들을 고칠 수 없다. 호스트에서 고치면 새로고침만으로 반영된다.

---

## 4. 데이터 저장소

### 4-1. DB 컨테이너만 따로 띄우기

```
docker compose up -d db
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker-compose.yml`의 `db` 서비스(PostgreSQL 17)만 백그라운드로 띄운다. `dev`·`api` 서비스는 `depends_on: db (service_healthy)`로 이 서비스를 자동으로 함께 띄우므로, DB 안을 직접 들여다보고 싶을 때(예: `4-4`의 `psql` 접속)만 이 명령을 따로 쓴다.
- **옵션**
  - `up` — 정의된 서비스를 만들고(필요하면 이미지를 받아오고) 실행한다.
  - `-d` — 백그라운드로 띄운다. 붙이지 않으면 터미널이 로그로 막힌다.
  - `db` — 띄울 대상 서비스 이름. 생략하면 `docker-compose.yml`에 정의된 서비스가 모두 뜬다.
- **주의점**
  - **호스트 포트를 열지 않았다.** 이 PC에는 다른 프로덕트의 PostgreSQL 컨테이너가 있어 5432 포트 충돌을 피하려고 `db` 서비스는 컨테이너 사이 내부망(`db:5432`)으로만 접속하도록 만들었다. 그래서 내 PC에 설치된 DB 도구(예: pgAdmin, DBeaver, `psql` 등)로 `localhost`에 바로 접속할 수 없다 — 반드시 `4-4`처럼 `docker compose exec db`로 컨테이너 안에 들어가서 확인해야 한다.
  - 데이터는 이름 있는 볼륨(`banblit-db-data`)에 보존된다. `docker compose down`으로 서비스를 내려도 데이터는 남고, `docker compose down -v`처럼 볼륨까지 지우는 명령을 쓸 때만 사라진다.

### 4-2. 마이그레이션을 최신으로 맞추기

```
docker compose run --rm dev alembic upgrade head
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `backend/migrations/versions/`에 쌓인 마이그레이션을 순서대로 적용해, DB 스키마를 가장 최신 정의(`backend/src/backend/db/models.py`)와 맞춘다.
- **옵션**
  - `run --rm dev` — `1-2`와 동일. 개발용 컨테이너를 일회성으로 띄워 명령을 실행하고 끝나면 지운다.
  - `alembic upgrade head` — alembic에게 "아직 적용되지 않은 마이그레이션을 전부, 가장 최신(head)까지 순서대로 적용하라"고 지시한다.
- **주의점**
  - `dev` 서비스가 `db`에 `depends_on: service_healthy`로 걸려 있어, 이 명령을 실행하면 `db` 컨테이너가 떠 있지 않던 경우 자동으로 함께 뜨고 healthcheck를 통과한 뒤에 적용이 시작된다. 따로 `4-1`을 먼저 실행할 필요는 없다.
  - 접속 주소는 `backend/migrations/env.py`가 `config.attributes`에 명시된 값을 최우선하고, 없으면 `DATABASE_URL` 환경변수로 접속한다. 이 명령으로 실행하면 컨테이너 환경변수인 `DATABASE_URL`(메인 `banblit` DB)이 그대로 쓰인다 — 테스트 전용 DB(`banblit_test`)는 pytest 실행 시 `backend/tests/conftest.py`가 별도로 다룬다.

### 4-3. 모델 변경 후 마이그레이션 새로 만들기

```
docker compose run --rm dev alembic revision --autogenerate -m "<제목>"
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `backend/src/backend/db/models.py`를 고친 뒤, 그 변경분을 현재 DB 스키마와 비교해 마이그레이션 파일을 자동으로 만든다. 파일은 `backend/migrations/versions/`에 생성된다.
- **옵션**
  - `revision` — 새 마이그레이션 파일 하나를 만든다.
  - `--autogenerate` — 현재 DB에 이미 적용된 스키마와 `models.py`가 정의한 목표 스키마를 비교해, 그 차이를 채운 `upgrade()`/`downgrade()` 초안을 자동으로 써 준다.
  - `-m "<제목>"` — 마이그레이션 파일 이름에 들어갈 설명. 생략하면 제목 없는 파일이 되어 나중에 무슨 변경인지 알아보기 어렵다.
- **주의점**
  - **autogenerate는 `CheckConstraint`를 감지하지 못할 수 있다.** 실제로 `rooms`(30분 격자), `periods`(kind 목록), `assignments`(시간 역전 방지) 테이블의 `CheckConstraint`가 자동 생성된 초안에 빠졌던 적이 있어, 파일을 열어 직접 확인하고 빠졌으면 `op.create_check_constraint`로 채워 넣어야 한다.
  - 자동 생성된 파일은 초안일 뿐이다. 실행하기 전에 반드시 내용을 읽고, 기본값 데이터를 심어야 하는 경우(예: `positions` 기본 5종)는 `upgrade()` 끝에 `op.bulk_insert`를 직접 추가해야 한다.
  - 생성만 하고 적용은 되지 않는다. 적용하려면 `4-2`의 `alembic upgrade head`를 이어서 실행해야 한다.

### 4-4. 저장소 안을 직접 들여다보기 (psql)

```
docker compose exec db psql -U banblit -d banblit
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `db` 서비스가 이미 떠 있어야 한다)
- **용도**: 컨테이너 안의 PostgreSQL에 `psql` 클라이언트로 직접 접속해, 테이블 내용을 눈으로 확인한다.
- **옵션**
  - `exec` — 이미 떠 있는 컨테이너 안에서 명령을 실행한다. (`run`과 달리 새 컨테이너를 만들지 않는다.)
  - `db` — 접속할 대상 서비스 이름.
  - `psql -U banblit -d banblit` — `banblit` 사용자로 `banblit` 데이터베이스에 접속한다. 사용자·DB 이름은 `.env`(`.env.example` 견본)의 `POSTGRES_USER`·`POSTGRES_DB` 값과 같아야 한다.
- **주의점**
  - **호스트 포트를 열지 않았으므로, 이 방법 말고는 내 PC의 DB 도구로 직접 접속할 수 없다.** `db` 서비스가 `docker compose up -d db`나 `docker compose run --rm dev alembic ...` 등으로 이미 기동돼 있어야 하며, 떠 있지 않으면 `service "db" is not running` 오류가 난다.
  - 나올 때는 `\q`를 입력한다.

---

### 4-5. 개발용 시드 데이터 넣기

```
docker compose run --rm dev python scripts/seed_dev.py
docker compose run --rm dev python scripts/seed_dev.py --reset
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 화면에 띄울 실제 데이터를 만든다. 팀 4개·부원·합주실 2개·기간 2개를 넣고, 각 기간에 대해 배정을 실제로 돌린다. 앞 기간(1번)은 배정이 성사돼 `assignments`에 저장되고, 뒤 기간(2번)은 새벽 네시가 자리를 못 채워 저장 없이 조율안만 나온다 — 프로토타입 화면의 "확정된 시간표"와 "A안·B안"을 둘 다 실물로 보기 위한 구성이다.
- **옵션**
  - `run --rm dev` — `1-2`와 동일. 개발용 컨테이너를 일회성으로 띄워 명령을 실행하고 끝나면 지운다.
  - `python scripts/seed_dev.py` — 컨테이너의 `working_dir`가 `/app`이고 `PYTHONPATH=/app/src`라서 `backend.*` 를 그대로 불러올 수 있다. 별도 설치 없이 이 경로로 실행한다.
  - `--reset` — 생략하면 팀이 이미 하나라도 있을 때 아무것도 하지 않고 끝난다. 붙이면 시드가 만든 것(배정·백업·못 나오는 시간·소속·기간·합주실·팀·사람)을 지우고 처음부터 다시 넣는다.
- **주의점**
  - **`4-2`의 마이그레이션을 먼저 돌려야 한다.** 표가 없으면 첫 조회에서 실패한다.
  - 포지션(`positions`)은 마이그레이션이 넣는 기준 데이터라 시드가 건드리지 않는다. `--reset`도 지우지 않는다.
  - 배정 계산(CP-SAT)이 기간마다 한 번씩, 조율안을 찾느라 사람 수만큼 더 돈다. 이 구성에서 30초 안팎 걸린다.
  - `dev` 서비스가 `db`에 `depends_on: service_healthy`로 걸려 있어 `db`가 자동으로 함께 뜬다.

---

## 5. 이미지 주고받기

### 5-1. 이미지를 파일 하나로 내보내기

```
docker save banblit-backend:dev -o banblit-backend-dev.tar
```

- **실행 경로**: 파일을 저장할 폴더
- **용도**: 개발 환경 전체를 파일 하나로 묶는다. 상대는 이 파일만 받으면 인터넷 설치 과정 없이 동일한 환경을 쓸 수 있다.
- **옵션**
  - `-o <파일이름>` — 내보낼 파일 이름. 생략하면 화면으로 쏟아지므로 반드시 지정한다.
- **주의점**: 파일 크기가 800MB를 넘는다. 저장소에 올리지 않는다.

### 5-2. 받은 파일을 이미지로 풀기

```
docker load -i banblit-backend-dev.tar
```

- **실행 경로**: 받은 파일이 있는 폴더
- **용도**: 내보낸 파일을 이미지로 되돌린다. 푼 뒤에는 `1-2`의 테스트 실행 명령을 그대로 쓸 수 있다.
- **옵션**
  - `-i <파일이름>` — 읽어들일 파일 이름.

---

## 6. 로컬 가상환경 (참고용, 기준 아님)

컨테이너 도입 이전에 쓰던 방식이다. **기준 실행 방법은 `1-2`의 컨테이너 실행이다.**
컨테이너 빌드가 막혔을 때의 대비책으로만 남겨 둔다.

```
uv run pytest -q
```

- **실행 경로**: `backend/`
- **용도**: 내 PC에 만들어 둔 가상환경에서 테스트를 실행한다.
- **옵션**
  - `run` — 프로젝트 가상환경 안에서 뒤따르는 명령을 실행한다. 가상환경이 없거나 패키지가 부족하면 먼저 맞춰 놓고 실행한다.
  - `-q` — 결과를 짧게 출력한다.
- **주의점**: 내 PC의 운영체제와 파이썬 설치 상태에 결과가 좌우된다. 다른 PC에서 같은 결과를 보장하지 않는다.

---

## 7. 커밋 메시지 검사 훅

### 7-1. 훅 켜기

```
git config core.hooksPath .githooks
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 커밋 메시지 형식 검사를 켠다. 저장소를 새로 받았을 때 **한 번만** 실행한다.
- **옵션**
  - `core.hooksPath` — git이 훅 스크립트를 찾을 폴더를 지정하는 설정 이름. 기본값은 `.git/hooks`이며, 그 폴더는 저장소에 올라가지 않아 다른 PC와 공유되지 않는다. `.githooks`로 바꾸면 저장소에 함께 올라가 모두가 같은 검사를 쓴다.
  - `.githooks` — 지정할 폴더 이름.
- **주의점**: 이 설정은 저장소마다 따로 잡힌다. 새로 복제한 저장소에서는 다시 실행해야 한다.

### 7-2. 훅이 제대로 거르는지 검사

```
bash .githooks/test-commit-msg.sh
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 훅이 통과시켜야 할 메시지와 거부해야 할 메시지를 각각 넣어 결과를 확인한다. 훅을 고쳤다면 반드시 실행한다.
- **주의점**: 통과 14 / 실패 0이 나와야 정상이다. 실제 커밋을 만들지 않으므로 히스토리에 영향이 없다.

### 7-3. 통과하는 커밋 메시지 형식

```
<scope>: <요약>

<본문은 빈 줄 하나를 띄우고 쓴다>
```

- **허용 scope**: `scheduling` `docs` `infra` `backend` `frontend` `test` `chore`
- **거부되는 경우**: scope가 없거나 목록에 없을 때, 콜론 뒤에 공백이 없을 때, 요약이 비었을 때, 본문 앞에 빈 줄이 없을 때
- **그대로 통과하는 경우**: `Merge`·`Revert`로 시작하는 커밋(git이 자동 생성하는 형식이라 검사하지 않는다)
- **주의점**: scope를 추가하려면 `.githooks/commit-msg`의 `SCOPES` 목록과 `CLAUDE.md` 7장을 함께 고친다.

---

## 8. 원격 저장소

### 8-1. 로컬 커밋을 원격에 올리기

```bash
git push origin develop
```

- **실행 경로**: 저장소 루트 (`C:\Users\joycompany\Desktop\Banblit`)
- **용도**: 로컬 `develop` 브랜치의 커밋을 GitHub(`minkong-dev/Banblit`)의 같은 이름 브랜치로 올린다. 성공하면 `이전해시..새해시  develop -> develop` 한 줄이 나온다.
- **옵션별 의미**:
  - `origin` — 올릴 원격 저장소 이름. `git remote -v`로 확인할 수 있다.
  - `develop` — 올릴 브랜치 이름. 생략하면 현재 브랜치의 추적 대상으로 올라가지만, 어디로 가는지 눈에 보이게 매번 적는다.
- **주의점**:
  - 이 PC의 시스템 자격증명이 github.com에 회사 계정을 내주기 때문에, 이 저장소 전용 자격증명(minkong-dev)이 따로 설정되어 있다. 다른 PC에서 처음 받으면 다시 설정해야 한다.
  - 올린 것은 다른 사람이 이미 받아 갔을 수 있으므로 되돌리기 어렵다. 사용자가 올리라고 했을 때만 실행한다.

---

## 9. 삭제 금지 훅

### 9-1. 훅이 제대로 막는지 검사

```bash
rm trash/없는파일.txt
```

- **실행 경로**: 저장소 루트
- **용도**: `.claude/hooks/move-to-trash.ps1`이 지우는 명령을 실제로 막는지 확인한다. **이 명령은 거부되어야 정상이다.** "파일을 지우지 않습니다. 저장소 루트의 trash/ 로 옮기십시오."가 나오면 훅이 살아 있는 것이다.
- **옵션별 의미**: 옵션이 없다. 지우려는 대상 경로 하나만 준다. 실제로 없는 파일을 지정해, 훅이 뚫렸을 때도 아무것도 사라지지 않게 한다.
- **주의점**:
  - 막는 대상은 `rm` `del` `erase` `rmdir` `unlink` `Remove-Item` `ri` `rd` 여덟 가지다. 명령 첫머리이거나 `;` `&` `|` 뒤에 올 때만 걸린다 — 파일 이름에 우연히 `rm`이 들어간 경우는 막지 않는다.
  - 훅 설정은 `.claude/settings.json`에 있다. 이 파일을 고치면 새 세션부터 반영된다.
  - 파일을 치워야 할 때는 지우지 말고 옮긴다: `mv <파일> trash/<날짜>-<무엇을-치우는지>/`
