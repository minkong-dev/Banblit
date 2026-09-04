# COMMAND

> 문서 버전: 1.11.0 draft

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

### 3-4. 확정된 설계 원본 화면 열어보기

```
curl -s -o /dev/null -w "%{http_code}
" http://localhost:8000/proto/scheduler.html
start http://localhost:8000/proto/scheduler.html
start http://localhost:8000/proto/assignment.html
start http://localhost:8000/proto/landing.html
start http://localhost:8000/proto/login.html
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `frontend/prototypes/` 에 굳혀둔 **확정된 화면 설계 원본**을 연다. 사람이 실제로 쓰는 화면은 이것이 아니라 `10-1` 의 화면 개발 서버가 내보내는 앱이다. 이 원본은 앱을 고치다 모양이 어긋났을 때 나란히 놓고 비교할 기준으로만 쓴다.
- **옵션**
  - `curl -s` — 진행률 표시를 끈다. `-o /dev/null` 은 본문을 버리고, `-w "%{http_code}"` 는 상태 코드만 출력한다. 화면을 열기 전에 서빙이 붙었는지만 확인할 때 쓴다.
  - `start <url>` — Windows에서 기본 브라우저로 주소를 연다. 옵션 없이 주소만 넘긴다.
- **주의점**
  - **`3-1`로 API 서버가 떠 있어야 한다.** 원본은 예시 데이터가 안에 박혀 있어 시드가 없어도 그려지지만, 주소 자체는 서버가 떠 있어야 열린다.
  - 이 주소는 `docker-compose.yml` 의 `api` 서비스에 `./frontend/prototypes:/proto:ro` 를 걸고 `PROTOTYPE_DIR=/proto` 를 준 덕에 생긴다. 환경변수가 없으면 `backend/src/backend/api/app.py` 끝의 `app.mount` 가 아예 실행되지 않아 `/proto` 가 존재하지 않는다 — 배포에는 붙지 않는다는 뜻이다.
  - `-live` 가 붙은 사본은 2026-09-03 React 이전과 함께 없어졌다. `trash/2026-09-03-react-migration/` 에 있다.
  - 원본은 서버에 아무것도 묻지 않고 그림도 옆에 놓인 파일을 상대경로로 부르므로, 파일을 브라우저로 직접 여는 것(`file://`)으로도 그대로 열린다. 서버로 여는 쪽을 적어둔 것은 앱(`10-1`)과 나란히 놓고 비교하기 편해서다.
  - 볼륨이 읽기 전용(`:ro`)이라 컨테이너 안에서는 이 파일들을 고칠 수 없다. 원본은 설계를 바꾸기로 했을 때만 호스트에서 고친다.

---

### 3-5. 로그인·인증 흐름 확인 (쿠키)

```
curl -s -i -X POST http://localhost:8000/signup -H "Content-Type: application/json" --data-binary @signup.json -c cookies.txt
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/me -b cookies.txt
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/logout -b cookies.txt
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/me -b cookies.txt
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `3-1`로 `api` 서비스가 떠 있어야 한다)
- **용도**: 로그인 세션이 **쿠키**로 오가는지를 네 줄로 확인한다. 가입해서 쿠키를 파일에 받아두고(1행), 그 쿠키만으로 "내 계정"을 물어 `200`을 받고(2행), 로그아웃한 뒤(3행) 같은 쿠키로 다시 물어 `401`이 되는지 본다(4행). 4행이 `200`이면 로그아웃이 세션을 끊지 못한 것이다.
- **본문 파일**: 1행의 `signup.json`은 직접 만든다. 이름·이메일·비밀번호·포지션 네 값이 필요하고, 포지션은 마이그레이션이 심어둔 목록(보컬·기타·베이스·드럼·키보드)에서 고른다.

  ```json
  {"name": "홍길동", "email": "test@example.com", "password": "banblit-test-1", "positions": ["드럼"]}
  ```

- **옵션**
  - `-s` — 진행률 표시줄을 숨긴다.
  - `-i` — 응답 **머리글까지 함께** 출력한다. 생략하면 본문만 나와 `set-cookie` 두 줄(`banblit_session`, `banblit_signed_in`)이 실제로 내려오는지 눈으로 볼 수 없다.
  - `-X POST` — 보내는 방식을 지정한다. 생략하면 `GET`이다(본문을 붙이면 `curl`이 알아서 `POST`로 바꾸지만, 읽는 사람을 위해 적어 둔다).
  - `-H "Content-Type: application/json"` — 본문이 JSON이라고 알린다. 생략하면 서버가 본문을 JSON으로 읽지 않아 `422`로 거절한다.
  - `--data-binary @<파일>` — 파일 내용을 **손대지 않고 그대로** 본문으로 보낸다.
  - `-c <쿠키파일>` — 응답으로 받은 쿠키를 그 파일에 **저장한다**. 생략하면 받은 쿠키를 버리므로 다음 줄이 인증되지 않는다.
  - `-b <쿠키파일>` — 저장해 둔 쿠키를 요청에 **실어 보낸다**. 생략하면 쿠키 없이 나가므로 `/me`는 `401`이다.
  - `-o /dev/null` — 본문을 버린다. `-w "%{http_code}\n"` — 상태 번호만 한 줄로 찍는다. 둘을 함께 써서 번호만 본다.
- **주의점**
  - **`4-2`의 마이그레이션이 먼저 적용돼 있어야 한다.** 세션을 담는 `sessions` 표가 없으면 가입 자체가 실패한다.
  - 한글이 든 본문을 인라인(`-d '...'`)으로 넘기면 Git Bash에서 인코딩이 깨진다. 그래서 `--data-binary @파일`을 쓴다 — 자세한 사유는 `3-2`의 주의점에 적어 두었다.
  - **쿠키 파일은 로그인한 상태 그 자체다.** 확인이 끝나면 지우고, 저장소에 올리지 않는다.
  - 같은 이메일로 1행을 두 번 실행하면 `422`("이미 가입된 이메일입니다")가 돌아온다. 다시 확인할 때는 이메일을 바꾸거나 `4-5`의 `--reset`으로 데이터를 비운다.
  - 개발 구성은 `docker-compose.override.yml`이 `COOKIE_SECURE=false`로 덮으므로 `http`로도 쿠키가 붙는다. 배포 구성(`11-2`)은 `docker-compose.yml`의 `COOKIE_SECURE=true`가 살아 있어, `https`가 아니면 브라우저가 세션 쿠키를 저장하지 않는다.
  - `token` 같은 필드를 응답 본문에서 찾지 않는다. 세션은 본문이 아니라 쿠키로만 오간다 — 헤더에 토큰을 실어 보내던 예전 방식은 더 이상 동작하지 않는다.

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

### 4-4-1. 로그인 세션 표를 눈으로 확인하기

```
docker compose exec -T db psql -U banblit -d banblit -c "select member_id, left(token_hash,12), revoked_at is not null from sessions order by id desc limit 3;"
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `db` 서비스가 이미 떠 있어야 한다)
- **용도**: 방금 만든 로그인 세션이 실제로 저장소에 남았는지, 로그아웃이 그 줄에 취소 표시를 남겼는지 확인한다. `3-5`를 돌린 직후에 보면 마지막 줄의 마지막 칸이 `t`(취소됨)로 바뀌어 있다.
- **옵션**
  - `exec` — 이미 떠 있는 컨테이너 안에서 명령을 실행한다. (`4-4`와 같다.)
  - `-T` — 터미널을 붙이지 않는다. 생략하면 터미널을 붙이려 하므로, 출력을 다른 명령으로 넘기거나 스크립트 안에서 돌릴 때 걸린다.
  - `-c "<질의>"` — 대화형으로 들어가지 않고 질의 하나만 실행하고 끝낸다. 생략하면 `4-4`처럼 `psql` 안으로 들어간다.
  - `left(token_hash,12)` — 세션을 가리키는 지문의 앞 12글자만 본다. **전체를 찍지 않는다** — 줄을 알아보는 데는 앞자리로 충분하다.
- **주의점**
  - **원문 토큰은 이 표에 없다.** 저장된 것은 되돌릴 수 없게 줄인 지문뿐이라, 여기 보이는 값으로는 로그인할 수 없다.
  - 만료된 세션 줄은 저절로 지워지지 않는다. 쌓인 줄이 눈에 걸리면 이 질의로 확인하고 직접 지운다.

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

---

## 10. 화면 앱

### 10-1. 화면 개발 서버 띄우기

```
docker compose up -d api web
docker compose logs web --since 1m
start http://localhost:5173/
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `web` 서비스(Vite 개발 서버)를 띄워 `http://localhost:5173` 에서 React 앱을 연다. 주소마다 다른 화면이 뜬다 — `/` 랜딩, `/login` `/signup` `/find-id` `/find-password` `/reset-password` 계정 다섯 벌, `/scheduler` 달력, `/admin` 배정 결과.
- **옵션**
  - `up -d api web` — 화면과 API 를 함께 띄운다. `web` 만 띄워도 `depends_on` 이 `api` 를 함께 올리지만, 둘을 적어두면 무엇이 떠야 하는지가 명령에 드러난다. `api` 는 다시 `db` 가 healthy 가 될 때까지 기다린다.
  - `logs web --since 1m` — **최근 1분치 기록만** 본다. 아래 주의점 참고.
  - `start <url>` — Windows에서 기본 브라우저로 주소를 연다.
- **주의점**
  - **처음 띄우면 컨테이너 안에서 `npm install` 이 돈다.** 꾸러미는 호스트 폴더가 아니라 `banblit-web-modules` 라는 이름 붙은 저장소에 들어간다(윈도우 폴더에 그대로 두면 파일이 많아 눈에 띄게 느려진다). 설치가 끝나기 전에는 5173 이 응답하지 않는다. `VITE ... ready in` 이 기록에 뜬 뒤에 연다.
  - **`docker compose logs web` 은 이전 기동의 기록까지 함께 보여준다.** 컨테이너를 지우지 않고 `stop`/`start` 만 하면 기록이 쌓인 채로 남는다. `--since` 없이 보면 지난번 `ready` 를 이번 것으로 잘못 읽는다. 이번 기동 이후만 보려면 `--since 1m` 또는 `docker inspect banblit-web-1 --format '{{.State.StartedAt}}'` 로 얻은 시각을 `--since` 에 넣는다.
  - **코드를 고쳤는데 화면이 안 바뀌면 개발 서버가 옛 코드를 물고 있는 것이다.** 윈도우 폴더를 컨테이너에 걸면 파일이 바뀌었다는 알림이 컨테이너 안까지 오지 않는다. `frontend/vite.config.ts` 의 `server.watch.usePolling` 이 이것 때문에 켜져 있다. 그래도 안 따라오면 `docker compose restart web` 으로 다시 띄운다. 이 증상을 코드 문제로 오진한 적이 두 번 있다.
  - **화면은 5173, API 는 8000 에서 돈다.** 브라우저는 화면을 받아온 곳과 다른 곳에 값을 물으면 막으므로, 개발 서버가 정해진 경로만 API 로 대신 넘긴다. 넘기는 경로 목록은 `frontend/vite.config.ts` 의 `API_PATHS` 가 갖는다. API 통로를 추가하면 이 목록도 함께 늘려야 한다.
  - 달력에 데이터가 보이려면 `4-2` 마이그레이션과 `4-5` 시드가 들어가 있어야 한다. 없으면 화면은 정상적으로 뜨고 "저장된 배정이 없다" 고 말한다.
  - 5173 번 포트가 다른 프로그램에 쓰이고 있으면 실패한다. 이 저장소와 무관한 컨테이너가 그 포트를 쓰고 있다면 함부로 내리지 않는다.

### 10-1-1. 화면이 실제로 뜨는지 확인하기

```
curl -s -o /dev/null -w "%{http_code}
" http://localhost:5173/scheduler
curl -s http://localhost:5173/periods/1/schedule
```

- **실행 경로**: 어디서든 무관 (단, `10-1` 로 `web` 이 떠 있어야 한다)
- **용도**: 브라우저를 열지 않고 두 가지를 확인한다. 첫 줄은 주소를 직접 쳤을 때 화면이 나오는지(`200`), 둘째 줄은 개발 서버가 API 로 제대로 넘기는지(시간표 JSON 이 오는지)다.
- **옵션**
  - `-s` — 진행률 표시를 끈다. `-o /dev/null` 은 본문을 버리고 `-w "%{http_code}"` 로 상태 코드만 찍는다.
- **주의점**
  - `000` 이 나오면 서버가 아직 응답하지 않는 것이다. 대개 `npm install` 이 아직 도는 중이다. `10-1` 의 기록 확인으로 돌아간다.
  - 이 확인은 화면이 **응답하는지**만 본다. 화면이 설계대로 그려지는지는 브라우저로 열어 `3-4` 의 원본과 나란히 놓고 봐야 한다.

### 10-2. 화면 테스트 돌리기

```
docker compose run --rm --no-deps web npm test
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 화면 쪽 검사를 돌린다. 지금 덮는 것은 순수 계산과 입력 검증이다 — 서버 호출 감싸개, 달력 칸 계산, 30분 조각을 합주로 잇는 계산, 계정 서식 입력 검사. 통과하면 `Tests 55 passed` 가 나온다. 화면을 실제로 띄워 보는 검사는 아직 없다.
- **옵션**
  - `run` — 일회용 컨테이너를 만들어 명령 하나만 돌리고 끝낸다. 개발 서버를 띄운 채로도 따로 돌릴 수 있다.
  - `--rm` — 끝나면 그 컨테이너를 지운다. 붙이지 않으면 돌릴 때마다 찌꺼기가 쌓인다.
  - `--no-deps` — `depends_on` 에 걸린 `api`(그리고 `db`)를 함께 띄우지 않는다. 화면 검사는 서버가 필요 없다. 생략하면 DB 까지 올라와 느려진다.
  - `npm test` — `frontend/package.json` 의 `test` 를 실행한다. 내용은 `vitest run` 이다. `run` 이 붙어 있어 한 번 돌고 끝나며, 파일을 지켜보는 상태로 머물지 않는다.
- **주의점**
  - 꾸러미는 `10-1` 이 채워둔 `banblit-web-modules` 저장소를 그대로 쓴다. 그래서 이 명령은 설치 없이 곧바로 돈다.
  - 검사 파일은 `frontend/src/**/*.test.ts` 만 잡는다. 범위는 `frontend/vite.config.ts` 의 `test.include` 가 정한다.

### 10-3. 화면 타입 검사 돌리기

```
docker compose run --rm --no-deps web npm run typecheck
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 화면 코드의 타입을 검사한다. 아무것도 출력하지 않고 끝나면 통과다.
- **옵션**
  - `npm run typecheck` — `frontend/package.json` 의 `typecheck` 를 실행한다. 내용은 `tsc -b --noEmit` 이다. `-b` 는 `frontend/tsconfig.json` 이 가리키는 설정들을 순서대로 검사하고, `--noEmit` 은 결과 파일을 만들지 않는다.
  - `--rm --no-deps` — `10-2` 와 같은 이유다.
- **주의점**
  - `-b` 는 지난 검사 결과를 `frontend/tsconfig.tsbuildinfo` 에 남겨 두 번째부터 빨라진다. 이 파일은 저장소에 들어 있다.

### 10-4. 화면 빌드하기

```
docker compose run --rm --no-deps web npm run build
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 배포용 화면 묶음을 만든다. 결과는 `frontend/dist/` 에 들어간다.
- **옵션**
  - `npm run build` — `frontend/package.json` 의 `build` 를 실행한다. 내용은 `tsc -b && vite build` 다. 타입 검사를 먼저 통과해야 묶기로 넘어간다.
  - `--rm --no-deps` — `10-2` 와 같은 이유다.
- **주의점**
  - **`frontend/dist/` 는 저장소에 들어 있다.** 이 명령을 돌리면 그 안이 덮여 쓰이므로, 커밋 전에 `git status` 로 무엇이 바뀌었는지 본다.
  - 이 묶음을 실제로 내보내는 장치는 아직 없다. 개발 서버는 배포에 가지 않으므로, 배포에서는 주소를 나눠주는 다른 것이 그 일을 대신해야 한다 — 아직 정하지 않았다.

---

## 11. 배포용 구성

### 11-1. 배포용 이미지 만들기

```
docker compose -f docker-compose.prod.yml build
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 배포용 이미지 두 개를 만든다. 서버는 `backend/Dockerfile` 의 `prod` 단계(테스트 도구가 빠진 것), 화면은 `frontend/Dockerfile` 의 `prod` 단계(묶은 파일을 nginx 가 내보내는 것)다.
- **옵션**
  - `-f docker-compose.prod.yml` — 개발용(`docker-compose.yml`) 대신 이 파일을 쓴다. 생략하면 개발용이 대상이 되어 화면 이미지가 아예 없다.
  - 서비스 이름을 뒤에 붙이면 그것만 만든다 (`... build web`).
- **주의점**
  - 화면 이미지는 컨테이너 안에서 `npm ci` 와 `npm run build` 를 새로 돌린다. 처음에는 몇 분 걸린다.
  - 개발용 이미지와 이름이 다르다(`banblit-frontend:prod`, `banblit-backend:prod`). 개발용을 덮어쓰지 않는다.

### 11-2. 배포용 구성이 실제로 도는지 확인

```
docker run -d --rm --name banblit-prod-smoke --network banblit_default   -e API_ORIGIN=http://api:8000 -e NGINX_ENVSUBST_FILTER='^API_ORIGIN$'   -p 8080:80 banblit-frontend:prod
curl -s -o /dev/null -w "%{http_code}
" http://localhost:8080/scheduler
curl -s http://localhost:8080/api/health
docker rm -f banblit-prod-smoke
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 배포용 화면 이미지만 따로 띄워, 개발 서버가 하던 두 가지를 nginx 가 대신하는지 본다 — 주소를 직접 쳤을 때 화면이 나오는지, `/api` 가 서버로 넘어가는지.
- **옵션**
  - `--network banblit_default` — **개발용으로 이미 떠 있는 `api` 컨테이너에 닿으려고 그 망에 붙인다.** 이것 없이는 `api` 라는 이름을 못 찾아 502 가 난다. 망 이름은 `docker network ls` 로 확인한다.
  - `-e API_ORIGIN` — nginx 가 넘길 주소. 코드에 박혀 있지 않고 여기서 준다.
  - `-e NGINX_ENVSUBST_FILTER='^API_ORIGIN$'` — **채울 이름을 이것 하나로 못박는다.** 없이 두면 nginx 가 제 설정 안의 `$uri`·`$host` 까지 빈 값으로 지워 설정이 깨진다.
  - `--rm` — 멈추면 지워진다. 확인용이라 남길 이유가 없다.
  - `-p 8080:80` — 컨테이너 안 80번을 이 PC 의 8080 으로 연다. 개발 서버(5173)와 부딪히지 않는다.
- **주의점**
  - **`docker compose -f docker-compose.prod.yml up` 을 그냥 쓰면 안 된다.** 프로젝트 이름이 개발용과 같아 떠 있는 개발 컨테이너를 갈아치운다. 나란히 띄우려면 `-p banblit-prod` 로 프로젝트 이름을 따로 준다.
  - 이 확인은 화면과 넘기기만 본다. 데이터가 보이려면 `4-2` 마이그레이션과 `4-5` 시드가 들어가 있어야 한다.

---

## 12. 종단(E2E) 검사

### 12-1. 종단 검사 돌리기

```
docker compose run --rm e2e
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `frontend/e2e/` 의 Playwright 검사를 전부 돌린다. 사람이 브라우저에서 하는
  일(달력 보기, 설정 고치기, 글쓰기·댓글, 배정 다시 계산, 팀 명단 보기)을 흉내내
  화면·서버·저장소가 실제로 이어져 도는지 확인한다.
- **옵션**
  - `run --rm` — 일회성 컨테이너를 띄워 명령을 실행하고 끝나면 지운다.
  - `e2e` — `docker-compose.yml` 의 `e2e` 서비스. 공식 이미지 `mcr.microsoft.com/playwright:v1.62.1-noble`
    를 써서 브라우저를 따로 받지 않는다. 컨테이너 안에서 `npm install` 로 `frontend/package.json`
    의 `@playwright/test`(버전을 이미지 태그와 똑같이 `1.62.1` 로 고정했다)를 설치한 뒤
    `npx playwright test` 를 돈다.
  - `depends_on: web` 이 걸려 있어 `web` 서비스가 자동으로 함께 뜬다. 다만 `web` 이
    응답할 수 있는 상태까지 기다려 주지는 않으므로(→ 주의점), 미리 `10-1` 로 띄워
    두고 화면이 실제로 열리는 것을 확인한 뒤 이 명령을 돌리는 편이 안전하다.
- **주의점**
  - **`web` 을 막 띄웠거나 막 재시작했다면 먼저 준비될 때까지 기다려야 한다.**
    컨테이너 안에서 매번 `npm install` 을 다시 돌기 때문에(`docker-compose.yml`
    의 `web.command`), 뜬 지 얼마 안 됐으면 5173 번이 아직 응답하지 않는다.
    이 상태에서 `e2e` 를 돌리면 모든 검사가 `ECONNREFUSED` 로 한꺼번에 실패한다.
    `10-1-1` 의 확인 명령으로 200 이 나오는 것을 보고 나서 돌린다.
  - **이미지가 크다(브라우저 세 종 포함, 처음 받으면 1GB 가 넘는다).** 처음 한 번만
    느리고, 그 뒤로는 로컬 이미지 캐시를 그대로 쓴다.
  - **`@playwright/test` 버전과 이미지 태그 버전이 어긋나면 안 된다.** 이미지 안의
    브라우저가 그 버전에 맞춰 미리 깔려 있어서다. `frontend/package.json` 의
    devDependency 버전을 올릴 때는 `docker-compose.yml` 의 `e2e.image` 태그도
    같은 숫자로 함께 고친다.
  - 꾸러미는 `web` 과 따로 `banblit-e2e-modules` 라는 이름 붙은 저장소에 둔다.
    이미지 바탕(Ubuntu)이 `web`(Alpine)과 달라, 네이티브 바이너리가 섞이는 것을
    막으려고 나눴다.
  - 계산이 걸리는 검사(`frontend/e2e/assignment.spec.ts`)는 배정 다시 계산이
    끝날 때까지 기다린다. 2026-09-04 실측으로 1초 안팎이라 20초면 넉넉하지만,
    컨테이너 부하가 크면 늘어날 수 있다.
  - 검사 중 `frontend/e2e/notices.spec.ts` 가 공지에 글을 하나 남긴다. 지우는
    통로가 없어 돌릴 때마다(제목에 실행 시각을 붙여 구분은 되지만) 계속 쌓인다.

### 12-2. 특정 검사 파일만 돌리기

```
docker compose run --rm e2e npx playwright test e2e/assignment.spec.ts
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 파일 하나만 골라 돌린다. `12-1` 은 매번 전체를 돌려 느릴 때 이쪽을 쓴다.
- **옵션**
  - `npx playwright test <경로>` — `e2e` 서비스의 기본 명령(`npm install && npx playwright test`)
    대신 뒤에 이어 붙인 명령을 그대로 실행한다. 경로는 `frontend/` 기준 상대경로다.

### 12-3. 화면 쪽에서 종단 검사만 따로 린트·타입 검사하기

```
docker compose run --rm --no-deps web npm run lint:e2e
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `frontend/e2e/` 만 타입 인식 린트로 검사한다.
- **주의점**
  - **`frontend/eslint.config.js` 는 이 저장소의 `config-protection` 훅이 에이전트의
    수정을 막는다.** 그래서 `e2e/` 전용 설정을 `frontend/e2e/lint.config.js` 에
    따로 두고, `npm run lint`(기본 `eslint .`)에서는 `--ignore-pattern 'e2e/**/*'`
    로 그 폴더를 빼는 대신 이 명령으로 따로 검사한다. 두 설정 파일이 나뉜 것은
    선호가 아니라 이 제약 때문이다 — 한 파일로 합치려면 사람이 직접
    `frontend/eslint.config.js` 에 `files: ["e2e/**/*.ts"]` 블록을 더해야 한다.
  - `npm run typecheck`(`tsc -b --noEmit`)은 `frontend/tsconfig.json` 의 `include`
    에 `e2e` 를 이미 넣어 두어 따로 명령을 안 만들어도 `e2e/` 까지 함께 검사한다.
