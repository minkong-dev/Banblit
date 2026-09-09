# COMMAND

> 문서 버전: 1.11.0 draft

이 문서는 Banblit에서 실제로 실행해 동작을 확인한 명령어만 담고, 실행해 보지 않은 명령어는 적지 않습니다.

각 명령어는 **실행 경로 / 용도 / 옵션별 의미 / 주의점** 순으로 기록합니다.

---

## 1. 컨테이너 — 개발용

### 1-1. 개발용 이미지 만들기

```
docker compose build dev
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 개발용 컨테이너 이미지(`banblit-backend:dev`)를 만듭니다. 파이썬 3.14, OR-Tools, pytest가 들어간 환경이 이 안에 담깁니다.
- **옵션**
  - `build` — `docker-compose.yml`에 적힌 설정대로 이미지를 만듭니다. 만들기만 하고 실행하지 않습니다.
  - `dev` — 만들 대상 서비스 이름. `docker-compose.yml`의 `services.dev`를 가리킵니다. 생략하면 정의된 모든 서비스를 만듭니다.
- **주의점**
  - 처음 실행하면 파이썬 기반 이미지와 OR-Tools를 인터넷에서 받아오므로 몇 분 걸립니다. 두 번째부터는 캐시가 있어 몇 초로 끝납니다.
  - `backend/pyproject.toml` 또는 `backend/uv.lock`이 바뀌면 다시 실행해야 합니다. 소스 코드만 고친 경우에는 다시 만들 필요가 없습니다.

### 1-1-1. 의존성을 추가한 뒤 잠금 파일 갱신하기

```
docker compose run --rm --no-deps dev uv lock
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `backend/pyproject.toml`에 패키지를 추가·삭제한 뒤, 실제로 설치할 버전을 확정해 `backend/uv.lock`에 적습니다. 이미지는 `uv sync --locked`로 잠금 파일에 적힌 버전 그대로만 설치하므로, 이 단계를 건너뛰면 `1-1` 빌드가 "잠금 파일이 pyproject.toml과 맞지 않는다"며 실패합니다.
- **옵션**
  - `--no-deps` — 잠금 파일을 만드는 데 PostgreSQL 이 필요 없으므로 `db` 서비스를 띄우지 않습니다.
  - `uv lock` — 컨테이너 안에서 실행할 명령. 호스트에는 파이썬 환경이 없어 `uv`를 쓸 수 없습니다. 컨테이너의 `/app`이 내 PC의 `backend/` 폴더와 연결돼 있어, 갱신된 잠금 파일이 그대로 내 PC에 남습니다.
- **주의점**
  - 이 명령 뒤에는 반드시 `1-1`(`docker compose build dev`)을 실행해야 새 패키지가 이미지에 들어갑니다.

### 1-2. 컨테이너 안에서 테스트 돌리기

```
docker compose run --rm dev pytest -q
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 개발용 컨테이너를 띄워 그 안에서 테스트를 실행합니다. 이것이 이 프로젝트의 **기준 테스트 실행 방법**입니다.
- **옵션**
  - `run` — 서비스를 일회성으로 띄워 명령을 실행합니다. 명령이 끝나면 컨테이너도 멈춥니다.
  - `--rm` — 끝난 컨테이너를 자동으로 지웁니다. 붙이지 않으면 실행할 때마다 멈춘 컨테이너가 쌓입니다.
  - `dev` — 실행할 서비스 이름.
  - `pytest` — 컨테이너 안에서 실행할 명령. 이미지에 기본 실행 명령으로도 `pytest`가 지정돼 있어 생략 가능하지만, 뒤에 옵션을 붙이려면 이렇게 적어야 합니다.
  - `-q` — 결과를 짧게 출력합니다(통과한 테스트를 점 하나로 표시). 붙이지 않으면 기본값인 보통 길이로 출력합니다.
- **자주 쓰는 변형**
  - `docker compose run --rm dev pytest -v` — 테스트 이름을 하나씩 모두 출력합니다. 어떤 시나리오를 검사하는지 눈으로 확인할 때 씁니다.
  - `docker compose run --rm dev pytest tests/unit/test_resolution.py` — 특정 파일만 돌립니다.
- **주의점**
  - 내 PC의 `backend/` 폴더가 컨테이너 안에 연결돼 있어, 코드를 고치면 이미지를 다시 만들지 않아도 바로 반영됩니다.

### 1-2-0. 테스트를 여러 개 동시에 돌릴 때 테스트 DB를 갈라 쓰기

```
docker compose run --rm -e TEST_DB_NAME=banblit_test_a dev pytest -q tests/integration/db/test_room_endpoints.py
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 서로 다른 파일을 동시에 검사할 때 씁니다. 검사는 시작할 때 표를 전부 지우고 마이그레이션을 다시 적용하므로, 두 실행이 같은 DB를 쓰면 서로의 표를 지웁니다.
- **옵션**
  - `-e TEST_DB_NAME=banblit_test_a` — `docker compose run` 이 컨테이너에 넘기는 환경변수입니다. `backend/tests/conftest.py` 가 이 값으로 검사 전용 DB 이름을 정합니다. **생략하면 `banblit_test`** 를 씁니다. 이름은 아무거나 되며, 없으면 첫 실행에서 만듭니다.
- **주의점**
  - 혼자 돌릴 때는 붙이지 않습니다. DB 이름이 늘어날수록 `docker compose exec db psql` 로 확인할 때 어느 것이 무엇인지 헷갈립니다.
  - 만들어진 검사용 DB는 자동으로 지워지지 않습니다. `1-4`의 `docker compose down -v` 로 저장소를 통째로 비울 때 함께 사라집니다.

### 1-2-1. 아무것도 띄우지 않고 순수 계산 테스트만 돌리기

```
docker compose run --rm --no-deps dev pytest -q tests/unit
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 바깥과 통신하지 않는 검사만 돌립니다. 실패가 코드 탓인지 환경 탓인지 갈라낼 때 먼저 이것을 돌립니다.
- **옵션**
  - `--no-deps` — `docker-compose.yml`에서 `dev`가 의존하는 `db` 서비스를 띄우지 않습니다. 붙이지 않으면 PostgreSQL 이 먼저 떠서, 아무것도 없이 도는지를 확인하는 의미가 없어집니다.
  - `tests/unit` — 돌릴 폴더를 지정합니다. 생략하면 `tests/` 전체가 돌아 통합 검사까지 포함됩니다.
- **주의점**
  - 바깥과 실제로 통신하는 검사는 `tests/integration/<의존 대상>/` 아래에 둡니다. 지금은 `tests/integration/db/` 하나뿐입니다.
  - 폴더 이름이 곧 표시(marker) 이름입니다. `backend/tests/conftest.py`의 `pytest_collection_modifyitems`가 폴더를 보고 자동으로 붙입니다. 표시 이름 자체는 `backend/pyproject.toml`의 `[tool.pytest.ini_options]`에 등록돼 있습니다.
  - `tests/unit` 의 검사가 실제 DB 픽스처(`test_engine`·`db_session`·`api_client`)를 쓰면 수집 단계에서 멈춥니다. DB 가 떠 있는 동안 조용히 통과해 버리는 것을 막기 위해서입니다.
  - 2026-08-28 기준 전체 145개 중 `tests/unit` 이 91개, `tests/integration/db` 가 54개입니다.

### 1-2-2. DB 가 필요한 테스트만 돌리기

```
docker compose run --rm dev pytest -q tests/integration/db
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 실제 PostgreSQL 에 붙어야 도는 검사만 돌립니다.
- **주의점**
  - `--no-deps` 를 붙이면 안 됩니다. `db` 서비스가 떠 있어야 합니다.
  - 표시로 고르는 `-m db` 도 같은 결과를 냅니다. 폴더 쪽이 눈에 더 잘 보여 이쪽을 정본으로 씁니다.

### 1-2-3. 타입 검사 돌리기

```
docker compose run --rm --no-deps dev mypy
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 표기한 타입과 실제로 넘어가는 값이 어긋나지 않는지 검사합니다. `CLAUDE.md`가 모든 함수에 타입 표기를 요구하는데, 이 검사가 없으면 표기가 맞는지 아무도 확인하지 않습니다.
- **옵션**
  - `--no-deps` — 타입 검사는 코드를 읽기만 하므로 PostgreSQL 이 필요 없습니다.
  - `mypy` — 검사할 대상을 뒤에 적지 않습니다. `backend/pyproject.toml`의 `[tool.mypy]`에 `files = ["src", "tests"]`로 적혀 있어 그 둘을 검사합니다.
- **주의점**
  - `disallow_untyped_defs`가 켜져 있습니다. 표기가 빠진 함수는 mypy가 속을 아예 들여다보지 않으므로, 표기가 빠진 것 자체를 오류로 잡습니다.
  - 2026-08-28 기준 소스 44개 파일이 오류 없이 통과합니다.

### 1-3. 가장 느린 테스트 확인하기

```
docker compose run --rm dev pytest -q --durations=5
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 전체 테스트를 실행하면서, 실행 시간이 긴 테스트를 순서대로 뽑아 보여줍니다. 기간 자동 배정처럼 계산량이 실제 운영 규모에 가까운 테스트가 얼마나 걸리는지 확인할 때 씁니다.
- **옵션**
  - `run --rm dev pytest -q` — `1-2`와 동일. 개발용 컨테이너를 일회성으로 띄워 테스트를 짧은 출력으로 돌립니다.
  - `--durations=5` — 테스트가 모두 끝난 뒤, 실행 시간이 긴 순서로 5개까지만 목록에 보여줍니다. 숫자는 몇 개까지 보여줄지를 정하며, 생략하면 이 목록 자체가 출력되지 않습니다(`--durations=0`을 주면 전체 테스트를 모두 나열합니다).
- **주의점**: 시간 값은 실행하는 기계 성능에 좌우됩니다. 이 저장소 문서에 적힌 수치는 이 방법으로 측정한 실측값이며, 다른 환경에서는 달라질 수 있습니다.

### 1-4. 컨테이너 안에 직접 들어가기

```
docker compose run --rm dev bash
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 컨테이너 내부를 직접 둘러봅니다. 설치된 패키지 확인이나 명령 시험에 씁니다.
- **옵션**
  - `bash` — 컨테이너 안에서 실행할 명령을 명령줄 셸로 지정합니다.
- **주의점**: 나올 때는 `exit`를 입력합니다. `--rm`이 붙어 있어 나오는 순간 컨테이너가 지워지므로, 컨테이너 안에서 연결된 폴더 밖에 만든 파일은 사라집니다.

---

## 2. 컨테이너 — 배포용

### 2-1. 배포용 이미지 만들기

```
docker build --target prod -t banblit-backend:prod backend/
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 실행에 필요한 것만 담긴 배포용 이미지를 만듭니다. 테스트 도구는 들어가지 않습니다.
- **옵션**
  - `--target prod` — `Dockerfile`의 여러 단계 중 `prod` 단계까지만 만듭니다. 생략하면 파일에 적힌 마지막 단계까지 만듭니다.
  - `-t banblit-backend:prod` — 만든 이미지에 붙일 이름과 꼬리표. 생략하면 이름 없는 이미지가 되어 나중에 찾기 어렵습니다.
  - `backend/` — `Dockerfile`과 복사 대상 파일들이 있는 폴더. 이 폴더가 기준이 되므로 `backend/` 바깥 파일은 이미지에 넣을 수 없습니다.
- **주의점**: 배포용 단계는 소스를 이미지 안에 복사해 넣습니다. 코드를 고쳤으면 반드시 다시 만들어야 반영됩니다.

### 2-2. 배포용 이미지 동작 확인

```
docker run --rm -d -p 8001:8000 --name banblit-prod-check banblit-backend:prod
curl -s http://localhost:8001/health
docker stop banblit-prod-check
```

- **실행 경로**: 어디서든 무관 (단, 8001 포트가 이미 쓰이고 있지 않아야 합니다)
- **용도**: 배포용 이미지가 실제로 서버로 기동해 요청에 응답하는지 확인합니다. 배포용 `Dockerfile`의 실행 명령이 `uvicorn backend.api.app:app`으로 서버를 띄우도록 바뀌면서, 컨테이너가 문구만 출력하고 끝나던 이전 방식(`python -c "..."`)은 더 이상 쓸 수 없습니다 — 서버는 종료되지 않고 계속 떠 있으므로 포트를 열어 응답을 확인해야 합니다.
- **옵션**
  - `docker run` — 이미지로 컨테이너를 새로 만들어 실행합니다.
  - `--rm` — 컨테이너가 멈추면 자동으로 지웁니다.
  - `-d` — 백그라운드로 띄웁니다. 붙이지 않으면 서버가 터미널을 점유해 뒤 명령을 칠 수 없습니다.
  - `-p 8001:8000` — 내 PC의 8001번 포트를 컨테이너 안의 8000번 포트에 연결합니다. 개발용 `api` 서비스(`3-1`)가 8000번을 쓰므로, 겹치지 않게 8001번을 썼습니다.
  - `--name banblit-prod-check` — 컨테이너에 이름을 붙입니다. 뒤에서 `docker stop`으로 정지시킬 때 이 이름으로 찾습니다. 생략하면 임의의 이름이 붙어 찾기 번거롭습니다.
  - `curl -s http://localhost:8001/health` — 서버가 응답하는지 확인. `-s`는 진행 표시를 숨깁니다. `{"status":"ok"}`가 나오면 정상.
  - `docker stop banblit-prod-check` — 이름으로 컨테이너를 정지시킵니다. `--rm`이 붙어 있으므로 정지 즉시 컨테이너도 삭제됩니다.
- **주의점**: `-d` 없이 실행하면 터미널이 서버 로그로 막혀 다음 명령을 칠 수 없습니다. 확인이 끝나면 반드시 `docker stop`으로 내려야 컨테이너가 계속 떠 있는 채로 남지 않습니다.

### 2-3. 배포용에 테스트 도구가 없는지 확인

```
docker run --rm banblit-backend:prod python -c "import pytest"
```

- **실행 경로**: 어디서든 무관
- **용도**: 배포용 이미지에 개발용 도구가 섞여 들어가지 않았는지 검사합니다.
- **옵션**
  - `python -c "..."` — 컨테이너 안에서 따옴표 안의 파이썬 코드를 실행합니다.
- **주의점**: **이 명령은 실패해야 정상입니다.** `ModuleNotFoundError: No module named 'pytest'`가 나오면 단계 분리가 제대로 된 것입니다. 성공하면 배포용에 테스트 도구가 섞인 것이므로 `Dockerfile`을 점검해야 합니다.

---

## 3. 스케줄링 API 서버 — 로컬 기동

### 3-1. 개발용 API 서버 띄우기

```
docker compose up -d api
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker-compose.yml`의 `api` 서비스를 백그라운드로 띄워, `http://localhost:8000`에서 스케줄링 API(`GET /health`, `POST /assign`)를 호출할 수 있게 합니다. `api` 서비스는 개발용(`dev`) 이미지를 쓰고 `backend/` 폴더를 컨테이너에 연결해, `--reload` 옵션으로 코드를 고치면 서버가 자동으로 다시 뜹니다.
- **옵션**
  - `up` — 정의된 서비스를 만들고(필요하면 이미지를 빌드) 실행합니다.
  - `-d` — 백그라운드로 띄웁니다. 붙이지 않으면 터미널이 서버 로그로 막혀 다음 명령을 칠 수 없습니다.
  - `api` — 띄울 대상 서비스 이름. `docker-compose.yml`의 `services.api`를 가리킵니다. 생략하면 `docker-compose.yml`에 정의된 서비스가 모두 뜹니다(`dev`는 기본 명령이 `pytest`라 곧바로 종료됩니다).
- **주의점**
  - 8000번 포트가 이미 다른 프로그램(다른 프로젝트의 컨테이너 등)에 쓰이고 있으면 `port is already allocated` 오류로 실패합니다. 이 저장소와 무관한 컨테이너가 그 포트를 쓰고 있다면, 함부로 내리지 말고 `CLAUDE.md` 4-1에 따라 먼저 사용자에게 확인받습니다.
  - `backend/pyproject.toml` 또는 `backend/uv.lock`이 바뀐 뒤라면 `docker compose build dev`로 이미지를 먼저 다시 만들어야 새 패키지가 반영됩니다(`api` 서비스는 `dev` 이미지를 그대로 씁니다).

### 3-1-1. 띄운 서버 내리기

```
docker compose stop api
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `3-1`로 띄운 API 서버를 멈춥니다. 8000번 포트를 놓아줍니다.
- **옵션**
  - `stop` — 컨테이너를 멈추기만 하고 지우지는 않습니다. 다음에 `up -d api`로 다시 띄우면 같은 컨테이너를 씁니다. 지우려면 `stop` 대신 `down`을 쓰지만, `down`은 `db`까지 함께 내리므로 주의합니다.
  - `api` — 멈출 서비스 이름. 생략하면 `db`를 포함한 모든 서비스가 멈춥니다.

### 3-1-2. 서버 기록 보기

```
docker compose logs api --tail 30
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: API 서버가 남긴 기록을 봅니다. 요청이 500이나 503으로 답했을 때 원인을 여기서 찾습니다.
- **옵션**
  - `--tail 30` — 마지막 30줄만 봅니다. 생략하면 기동 이후 전부를 출력해 화면이 넘칩니다.

### 3-2. 서버 응답 확인

```
curl -s http://localhost:8000/health
```

- **실행 경로**: 어디서든 무관 (단, `3-1`로 `api` 서비스가 떠 있어야 합니다)
- **용도**: 서버가 정상적으로 응답하는지 확인합니다. `{"status":"ok"}`가 나오면 정상.
- **옵션**
  - `-s` — 진행률 표시줄을 숨기고 응답 본문만 출력합니다.
- **주의점**: Git Bash에서 한글이 포함된 JSON 본문을 작은따옴표로 감싼 인라인 인자(`-d '...'`)로 `POST /assign`에 넘기면 인코딩이 깨져 `"There was an error parsing the body"`가 돌아옵니다. 한글이 포함된 요청은 UTF-8로 저장한 파일을 `--data-binary @파일명`으로 넘겨야 합니다.

### 3-3. 서버 내리기

```
docker compose down
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker compose up`으로 띄운 서비스(컨테이너·네트워크)를 정리합니다.
- **옵션**: 옵션 없이 사용 — `docker-compose.yml`에 정의된 모든 서비스를 대상으로 정리합니다.
- **주의점**: 이 저장소가 띄운 서비스만 내립니다. 다른 프로젝트의 컨테이너에는 영향을 주지 않습니다.

### 3-4. 로그인·인증 흐름 확인 (쿠키)

```
curl -s -i -X POST http://localhost:8000/signup -H "Content-Type: application/json" --data-binary @signup.json -c cookies.txt
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/me -b cookies.txt
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/logout -b cookies.txt
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/me -b cookies.txt
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `3-1`로 `api` 서비스가 떠 있어야 합니다)
- **용도**: 로그인 세션이 **쿠키**로 오가는지를 네 줄로 확인합니다. 가입해서 쿠키를 파일에 받아두고(1행), 그 쿠키만으로 "내 계정"을 물어 `200`을 받고(2행), 로그아웃한 뒤(3행) 같은 쿠키로 다시 물어 `401`이 되는지 봅니다(4행). 4행이 `200`이면 로그아웃이 세션을 끊지 못한 것입니다.
- **본문 파일**: 1행의 `signup.json`은 직접 만듭니다. 이름·이메일·비밀번호·포지션 네 값이 필요하고, 포지션은 마이그레이션이 심어둔 목록(보컬·기타·베이스·드럼·키보드)에서 고릅니다.

  ```json
  {"name": "홍길동", "email": "test@example.com", "password": "banblit-test-1", "positions": ["드럼"]}
  ```

- **옵션**
  - `-s` — 진행률 표시줄을 숨깁니다.
  - `-i` — 응답 **머리글까지 함께** 출력합니다. 생략하면 본문만 나와 `set-cookie` 두 줄(`banblit_session`, `banblit_signed_in`)이 실제로 내려오는지 눈으로 볼 수 없습니다.
  - `-X POST` — 보내는 방식을 지정합니다. 생략하면 `GET`입니다. 본문을 붙이면 `curl`이 알아서 `POST`로 바꾸지만, 읽는 사람을 위해 적어 둡니다.
  - `-H "Content-Type: application/json"` — 본문이 JSON이라고 알립니다. 생략하면 서버가 본문을 JSON으로 읽지 않아 `422`로 거절합니다.
  - `--data-binary @<파일>` — 파일 내용을 **손대지 않고 그대로** 본문으로 보냅니다.
  - `-c <쿠키파일>` — 응답으로 받은 쿠키를 그 파일에 **저장합니다**. 생략하면 받은 쿠키를 버리므로 다음 줄이 인증되지 않습니다.
  - `-b <쿠키파일>` — 저장해 둔 쿠키를 요청에 **실어 보냅니다**. 생략하면 쿠키 없이 나가므로 `/me`는 `401`입니다.
  - `-o /dev/null` — 본문을 버립니다. `-w "%{http_code}\n"` — 상태 번호만 한 줄로 찍습니다. 둘을 함께 써서 번호만 봅니다.
- **주의점**
  - **`4-2`의 마이그레이션이 먼저 적용돼 있어야 합니다.** 세션을 담는 `sessions` 표가 없으면 가입 자체가 실패합니다.
  - 한글이 든 본문을 인라인(`-d '...'`)으로 넘기면 Git Bash에서 인코딩이 깨집니다. 그래서 `--data-binary @파일`을 씁니다 — 자세한 사유는 `3-2`의 주의점에 적어 두었습니다.
  - **쿠키 파일은 로그인한 상태 그 자체입니다.** 확인이 끝나면 지우고, 저장소에 올리지 않습니다.
  - 같은 이메일로 1행을 두 번 실행하면 `422`("이미 가입된 이메일입니다")가 돌아옵니다. 다시 확인할 때는 이메일을 바꿉니다.
  - 개발 구성은 `docker-compose.override.yml`이 `COOKIE_SECURE=false`로 덮으므로 `http`로도 쿠키가 붙습니다. 배포 구성(`11-1`)은 `docker-compose.yml`의 `COOKIE_SECURE=true`가 살아 있어, `https`가 아니면 브라우저가 세션 쿠키를 저장하지 않습니다.
  - `token` 같은 필드를 응답 본문에서 찾지 않습니다. 세션은 본문이 아니라 쿠키로만 오갑니다 — 헤더에 토큰을 실어 보내던 예전 방식은 더 이상 동작하지 않습니다.


### 3-5. 게시판 첨부파일 올리고 받아 보기

```
curl -s -b cookies.txt -X POST http://localhost:8000/posts/31/attachments -F "file=@score.pdf;type=application/pdf"
curl -s -b cookies.txt -D headers.txt -o got.pdf http://localhost:8000/attachments/1
cmp score.pdf got.pdf
docker compose exec api ls -l /var/lib/banblit/attachments
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `3-1`로 `api` 서비스가 떠 있고 `3-4`로 받아 둔 `cookies.txt` 가 있어야 합니다)
- **용도**: 파일이 실제로 서버 디스크에 저장되고 그대로 다시 내려오는지 확인합니다. 1행이 글 31번에 파일을 붙이고(201), 2행이 그것을 내려받고, 3행이 보낸 것과 받은 것이 한 바이트도 다르지 않은지 비교합니다(다르면 메시지가 나오고, 같으면 아무것도 출력하지 않습니다). 4행은 컨테이너 안의 저장 폴더를 열어, 서버가 지은 이름으로 파일이 하나 놓였는지 눈으로 봅니다.
- **옵션**
  - `-F "file=@<파일>"` — `multipart/form-data` 로 파일을 보냅니다. 항목 이름 `file` 은 서버가 정한 것이라 바꾸면 422 다. `;type=` 을 생략하면 curl 이 확장자를 보고 종류를 정합니다. `;filename=` 을 덧붙이면 보낼 이름을 따로 지정할 수 있습니다.
  - `-D <파일>` — 응답 머리글을 그 파일에 받습니다. `content-disposition: attachment` 와 `x-content-type-options: nosniff` 가 붙었는지 확인하는 데 씁니다. 생략하면 머리글을 볼 수 없습니다.
  - `-o <파일>` — 내려받은 내용을 그 파일에 씁니다. 생략하면 이진 파일이 터미널에 그대로 쏟아집니다.
- **주의점**
  - **글쓴이 본인만 붙이고 지울 수 있습니다.** 다른 계정의 쿠키로 1행을 보내면 403 입니다. 팀 게시판 글이면 내려받기도 그 팀 소속만 됩니다.
  - **허용 목록에 없는 확장자는 422 로 거절됩니다.** 목록은 `backend/src/backend/api/attachment_service.py` 의 `ALLOWED_EXTENSIONS` 한 곳에만 있습니다.
  - **Git Bash 에서 `;filename=` 에 한글을 적으면 이름이 깨져 저장됩니다.** 터미널이 UTF-8 로 보내지 않아서입니다 — 서버 문제가 아닙니다. 브라우저와 검사(`tests/integration/db/test_attachment_endpoints.py`)에서는 한글 이름이 그대로 남습니다.
  - **개발 구성에는 앞단(nginx)이 없습니다.** 크기 상한(`client_max_body_size 300m`)은 배포 구성에서만 걸리므로, 개발에서 300MB 를 넘겨 보내면 그대로 통과합니다. 배포 구성으로 확인하려면 `11-1` 로 띄운 곳에서 봅니다.
  - 저장 폴더는 `banblit-attachments` 볼륨입니다. `docker compose down` 으로 내려도 남고, `down -v` 로만 사라집니다.

---

## 4. 데이터 저장소

### 4-1. DB 컨테이너만 따로 띄우기

```
docker compose up -d db
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker-compose.yml`의 `db` 서비스(PostgreSQL 17)만 백그라운드로 띄웁니다. `dev`·`api` 서비스는 `depends_on: db (service_healthy)`로 이 서비스를 자동으로 함께 띄우므로, DB 안을 직접 들여다보고 싶을 때(예: `4-4`의 `psql` 접속)만 이 명령을 따로 씁니다.
- **옵션**
  - `up` — 정의된 서비스를 만들고(필요하면 이미지를 받아오고) 실행합니다.
  - `-d` — 백그라운드로 띄웁니다. 붙이지 않으면 터미널이 로그로 막힙니다.
  - `db` — 띄울 대상 서비스 이름. 생략하면 `docker-compose.yml`에 정의된 서비스가 모두 뜹니다.
- **주의점**
  - **호스트 포트를 열지 않았습니다.** 이 PC에는 다른 프로덕트의 PostgreSQL 컨테이너가 있어 5432 포트 충돌을 피하려고 `db` 서비스는 컨테이너 사이 내부망(`db:5432`)으로만 접속하도록 만들었습니다. 그래서 내 PC에 설치된 DB 도구(예: pgAdmin, DBeaver, `psql` 등)로 `localhost`에 바로 접속할 수 없습니다 — 반드시 `4-4`처럼 `docker compose exec db`로 컨테이너 안에 들어가서 확인해야 합니다.
  - 데이터는 이름 있는 볼륨(`banblit-db-data`)에 보존됩니다. `docker compose down`으로 서비스를 내려도 데이터는 남고, `docker compose down -v`처럼 볼륨까지 지우는 명령을 쓸 때만 사라집니다.

### 4-2. 마이그레이션을 최신으로 맞추기

```
docker compose run --rm dev alembic upgrade head
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `backend/migrations/versions/`에 쌓인 마이그레이션을 순서대로 적용해, DB 스키마를 가장 최신 정의(`backend/src/backend/db/models.py`)와 맞춥니다.
- **옵션**
  - `run --rm dev` — `1-2`와 동일. 개발용 컨테이너를 일회성으로 띄워 명령을 실행하고 끝나면 지웁니다.
  - `alembic upgrade head` — alembic에게 "아직 적용되지 않은 마이그레이션을 전부, 가장 최신(head)까지 순서대로 적용하라"고 지시합니다.
- **주의점**
  - `dev` 서비스가 `db`에 `depends_on: service_healthy`로 걸려 있어, 이 명령을 실행하면 `db` 컨테이너가 떠 있지 않던 경우 자동으로 함께 뜨고 healthcheck를 통과한 뒤에 적용이 시작됩니다. 따로 `4-1`을 먼저 실행할 필요는 없습니다.
  - 접속 주소는 `backend/migrations/env.py`가 `config.attributes`에 명시된 값을 최우선하고, 없으면 `DATABASE_URL` 환경변수로 접속합니다. 이 명령으로 실행하면 컨테이너 환경변수인 `DATABASE_URL`(메인 `banblit` DB)이 그대로 쓰입니다 — 테스트 전용 DB(`banblit_test`)는 pytest 실행 시 `backend/tests/conftest.py`가 별도로 다룹니다.

### 4-2-1. 마이그레이션을 한 칸 되돌리기 / 지금 어디인지 보기

```
docker compose run --rm dev alembic current
docker compose run --rm dev alembic heads
docker compose run --rm dev alembic downgrade -1
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `alembic current`는 지금 DB에 적용된 마이그레이션 번호를 출력합니다. `alembic heads`는 DB가 아니라 `backend/migrations/versions/` 파일들을 읽어 맨 끝 번호를 출력합니다 — 새 마이그레이션을 만들기 직전에 어떤 번호 위에 얹을지 확인하는 자리이고, 줄이 두 개 이상 나오면 갈래가 생긴 것입니다. `alembic downgrade -1`은 가장 최근에 적용된 마이그레이션 하나의 `downgrade()`를 실행해 그 직전 상태로 되돌립니다.
- **옵션**
  - `-1` — 되돌릴 칸 수. 숫자 대신 `alembic downgrade <revision>`처럼 되돌아갈 목적지 번호를 직접 적어도 됩니다. 생략하면 오류입니다 — 어디까지 되돌릴지 반드시 적어야 합니다.
- **주의점**
  - **열을 지우는 `downgrade()`는 그 열의 값을 함께 지웁니다.** 되돌린 뒤 다시 `upgrade`해도 지워진 값은 돌아오지 않습니다. 새 마이그레이션을 검증할 때만 쓰고, 값이 든 저장소에서는 먼저 백업합니다.
  - 권한 묶음 마이그레이션(`b7f1a92c4d31`)의 되돌리기는 `members.role`을 다시 만들고, 항목이 전부 켜진 묶음을 가진 사람을 `head_manager`로 되돌린 뒤 두 표를 지웁니다. 이 왕복은 `backend/tests/integration/db/test_permission_migration.py`가 전용 DB에서 자동으로 확인합니다.

### 4-3. 모델 변경 후 마이그레이션 새로 만들기

```
docker compose run --rm dev alembic revision --autogenerate -m "<제목>"
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `backend/src/backend/db/models.py`를 고친 뒤, 그 변경분을 현재 DB 스키마와 비교해 마이그레이션 파일을 자동으로 만듭니다. 파일은 `backend/migrations/versions/`에 생성됩니다.
- **옵션**
  - `revision` — 새 마이그레이션 파일 하나를 만듭니다.
  - `--autogenerate` — 현재 DB에 이미 적용된 스키마와 `models.py`가 정의한 목표 스키마를 비교해, 그 차이를 채운 `upgrade()`/`downgrade()` 초안을 자동으로 써 줍니다.
  - `-m "<제목>"` — 마이그레이션 파일 이름에 들어갈 설명. 생략하면 제목 없는 파일이 되어 나중에 무슨 변경인지 알아보기 어렵습니다.
- **주의점**
  - **autogenerate는 `CheckConstraint`를 감지하지 못할 수 있습니다.** 실제로 `rooms`(정시 격자), `periods`(kind 목록), `assignments`(시간 역전 방지) 테이블의 `CheckConstraint`가 자동 생성된 초안에 빠졌던 적이 있어, 파일을 열어 직접 확인하고 빠졌으면 `op.create_check_constraint`로 채워 넣어야 합니다.
  - 자동 생성된 파일은 초안일 뿐입니다. 실행하기 전에 반드시 내용을 읽고, 기본값 데이터를 심어야 하는 경우(예: `positions` 기본 5종)는 `upgrade()` 끝에 `op.bulk_insert`를 직접 추가해야 합니다.
  - 생성만 하고 적용은 되지 않습니다. 적용하려면 `4-2`의 `alembic upgrade head`를 이어서 실행해야 합니다.

### 4-4. 저장소 안을 직접 들여다보기 (psql)

```
docker compose exec db psql -U banblit -d banblit
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `db` 서비스가 이미 떠 있어야 합니다)
- **용도**: 컨테이너 안의 PostgreSQL에 `psql` 클라이언트로 직접 접속해, 테이블 내용을 눈으로 확인합니다.
- **옵션**
  - `exec` — 이미 떠 있는 컨테이너 안에서 명령을 실행합니다. (`run`과 달리 새 컨테이너를 만들지 않습니다.)
  - `db` — 접속할 대상 서비스 이름.
  - `psql -U banblit -d banblit` — `banblit` 사용자로 `banblit` 데이터베이스에 접속합니다. 사용자·DB 이름은 `.env`(`.env.example` 견본)의 `POSTGRES_USER`·`POSTGRES_DB` 값과 같아야 합니다.
- **주의점**
  - **호스트 포트를 열지 않았으므로, 이 방법 말고는 내 PC의 DB 도구로 직접 접속할 수 없습니다.** `db` 서비스가 `docker compose up -d db`나 `docker compose run --rm dev alembic ...` 등으로 이미 기동돼 있어야 하며, 떠 있지 않으면 `service "db" is not running` 오류가 납니다.
  - 나올 때는 `\q`를 입력합니다.

---

### 4-4-1. 로그인 세션 테이블을 눈으로 확인하기

```
docker compose exec -T db psql -U banblit -d banblit -c "select member_id, left(token_hash,12), revoked_at is not null from sessions order by id desc limit 3;"
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `db` 서비스가 이미 떠 있어야 합니다)
- **용도**: 방금 만든 로그인 세션이 실제로 저장소에 남았는지, 로그아웃이 그 줄에 취소 표시를 남겼는지 확인합니다. `3-4`를 돌린 직후에 보면 마지막 줄의 마지막 칸이 `t`(취소됨)로 바뀌어 있습니다.
- **옵션**
  - `exec` — 이미 떠 있는 컨테이너 안에서 명령을 실행합니다. (`4-4`와 같습니다.)
  - `-T` — 터미널을 붙이지 않습니다. 생략하면 터미널을 붙이려 하므로, 출력을 다른 명령으로 넘기거나 스크립트 안에서 돌릴 때 걸립니다.
  - `-c "<질의>"` — 대화형으로 들어가지 않고 질의 하나만 실행하고 끝냅니다. 생략하면 `4-4`처럼 `psql` 안으로 들어갑니다.
  - `left(token_hash,12)` — 세션을 가리키는 지문의 앞 12글자만 봅니다. **전체를 찍지 않습니다** — 줄을 알아보는 데는 앞자리로 충분합니다.
- **주의점**
  - **원문 토큰은 이 표에 없습니다.** 저장된 것은 되돌릴 수 없게 줄인 지문뿐이라, 여기 보이는 값으로는 로그인할 수 없습니다.
  - 만료된 세션 줄은 저절로 지워지지 않습니다. 쌓인 줄이 눈에 걸리면 이 질의로 확인하고 직접 지웁니다.

---

## 5. 이미지 주고받기

### 5-1. 이미지를 파일 하나로 내보내기

```
docker save banblit-backend:dev -o banblit-backend-dev.tar
```

- **실행 경로**: 파일을 저장할 폴더
- **용도**: 개발 환경 전체를 파일 하나로 묶습니다. 상대는 이 파일만 받으면 인터넷 설치 과정 없이 동일한 환경을 쓸 수 있습니다.
- **옵션**
  - `-o <파일이름>` — 내보낼 파일 이름. 생략하면 화면으로 쏟아지므로 반드시 지정합니다.
- **주의점**: 파일 크기가 800MB를 넘습니다. 저장소에 올리지 않습니다.

### 5-2. 받은 파일을 이미지로 풀기

```
docker load -i banblit-backend-dev.tar
```

- **실행 경로**: 받은 파일이 있는 폴더
- **용도**: 내보낸 파일을 이미지로 되돌립니다. 푼 뒤에는 `1-2`의 테스트 실행 명령을 그대로 쓸 수 있습니다.
- **옵션**
  - `-i <파일이름>` — 읽어들일 파일 이름.

---

## 6. 로컬 가상환경 (참고용, 기준 아님)

컨테이너 도입 이전에 쓰던 방식입니다. **기준 실행 방법은 `1-2`의 컨테이너 실행입니다.**
컨테이너 빌드가 막혔을 때의 대비책으로만 남겨 둡니다.

```
uv run pytest -q
```

- **실행 경로**: `backend/`
- **용도**: 내 PC에 만들어 둔 가상환경에서 테스트를 실행합니다.
- **옵션**
  - `run` — 프로젝트 가상환경 안에서 뒤따르는 명령을 실행합니다. 가상환경이 없거나 패키지가 부족하면 먼저 맞춰 놓고 실행합니다.
  - `-q` — 결과를 짧게 출력합니다.
- **주의점**: 내 PC의 운영체제와 파이썬 설치 상태에 결과가 좌우됩니다. 다른 PC에서 같은 결과를 보장하지 않습니다.

---

## 7. 커밋 메시지 검사 훅

### 7-1. 훅 켜기

```
git config core.hooksPath .githooks
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 커밋 메시지 형식 검사를 켭니다. 저장소를 새로 받았을 때 **한 번만** 실행합니다.
- **옵션**
  - `core.hooksPath` — git이 훅 스크립트를 찾을 폴더를 지정하는 설정 이름. 기본값은 `.git/hooks`이며, 그 폴더는 저장소에 올라가지 않아 다른 PC와 공유되지 않습니다. `.githooks`로 바꾸면 저장소에 함께 올라가 모두가 같은 검사를 씁니다.
  - `.githooks` — 지정할 폴더 이름.
- **주의점**: 이 설정은 저장소마다 따로 잡힙니다. 새로 복제한 저장소에서는 다시 실행해야 합니다.

### 7-2. 훅이 제대로 거르는지 검사

```
bash .githooks/test-commit-msg.sh
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 훅이 통과시켜야 할 메시지와 거부해야 할 메시지를 각각 넣어 결과를 확인합니다. 훅을 고쳤다면 반드시 실행합니다.
- **주의점**: 통과 14 / 실패 0이 나와야 정상입니다. 실제 커밋을 만들지 않으므로 히스토리에 영향이 없습니다.

### 7-3. 통과하는 커밋 메시지 형식

```
<scope>: <요약>

<본문은 빈 줄 하나를 띄우고 쓴다>
```

- **허용 scope**: `scheduling` `docs` `infra` `backend` `frontend` `test` `chore`
- **거부되는 경우**: scope가 없거나 목록에 없을 때, 콜론 뒤에 공백이 없을 때, 요약이 비었을 때, 본문 앞에 빈 줄이 없을 때
- **그대로 통과하는 경우**: `Merge`·`Revert`로 시작하는 커밋(git이 자동 생성하는 형식이라 검사하지 않습니다)
- **주의점**: scope를 추가하려면 `.githooks/commit-msg`의 `SCOPES` 목록과 `CLAUDE.md` 7장을 함께 고칩니다.

---

## 8. 원격 저장소

### 8-1. 로컬 커밋을 원격에 올리기

```bash
git push origin develop
```

- **실행 경로**: 저장소 루트 (`C:\Users\joycompany\Desktop\Banblit`)
- **용도**: 로컬 `develop` 브랜치의 커밋을 GitHub(`minkong-dev/Banblit`)의 같은 이름 브랜치로 올립니다. 성공하면 `이전해시..새해시  develop -> develop` 한 줄이 나옵니다.
- **옵션별 의미**:
  - `origin` — 올릴 원격 저장소 이름. `git remote -v`로 확인할 수 있습니다.
  - `develop` — 올릴 브랜치 이름. 생략하면 현재 브랜치의 추적 대상으로 올라가지만, 어디로 가는지 눈에 보이게 매번 적습니다.
- **주의점**:
  - 이 PC의 시스템 자격증명이 github.com에 회사 계정을 내주기 때문에, 이 저장소 전용 자격증명(minkong-dev)이 따로 설정되어 있습니다. 다른 PC에서 처음 받으면 다시 설정해야 합니다.
  - 올린 것은 다른 사람이 이미 받아 갔을 수 있으므로 되돌리기 어렵습니다. 사용자가 올리라고 했을 때만 실행합니다.

---

## 9. 삭제 금지 훅

### 9-1. 훅이 제대로 막는지 검사

```bash
rm trash/없는파일.txt
```

- **실행 경로**: 저장소 루트
- **용도**: `.claude/hooks/move-to-trash.ps1`이 지우는 명령을 실제로 막는지 확인합니다. **이 명령은 거부되어야 정상입니다.** "파일을 지우지 않습니다. 저장소 루트의 trash/ 로 옮기십시오."가 나오면 훅이 살아 있는 것입니다.
- **옵션별 의미**: 옵션이 없습니다. 지우려는 대상 경로 하나만 줍니다. 실제로 없는 파일을 지정해, 훅이 뚫렸을 때도 아무것도 사라지지 않게 합니다.
- **주의점**:
  - 막는 대상은 `rm` `del` `erase` `rmdir` `unlink` `Remove-Item` `ri` `rd` 여덟 가지입니다. 명령 첫머리이거나 `;` `&` `|` 뒤에 올 때만 걸립니다 — 파일 이름에 우연히 `rm`이 들어간 경우는 막지 않습니다.
  - 훅 설정은 `.claude/settings.json`에 있습니다. 이 파일을 고치면 새 세션부터 반영됩니다.
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
- **용도**: `web` 서비스(Vite 개발 서버)를 띄워 `http://localhost:5173` 에서 React 앱을 엽니다. 주소마다 다른 화면이 뜹니다 — `/` 랜딩, `/login` `/signup` `/find-id` `/find-password` `/reset-password` 계정 다섯 벌, `/scheduler` 달력, `/admin` 배정 결과.
- **옵션**
  - `up -d api web` — 화면과 API 를 함께 띄웁니다. `web` 만 띄워도 `depends_on` 이 `api` 를 함께 올리지만, 둘을 적어두면 무엇이 떠야 하는지가 명령에 드러납니다. `api` 는 다시 `db` 가 healthy 가 될 때까지 기다립니다.
  - `logs web --since 1m` — **최근 1분치 기록만** 봅니다. 아래 주의점 참고.
  - `start <url>` — Windows에서 기본 브라우저로 주소를 엽니다.
- **주의점**
  - **처음 띄우면 컨테이너 안에서 `npm install` 이 돕니다.** 패키지는 호스트 폴더가 아니라 `banblit-web-modules` 라는 이름 붙은 저장소에 들어갑니다(윈도우 폴더에 그대로 두면 파일이 많아 눈에 띄게 느려집니다). 설치가 끝나기 전에는 5173 이 응답하지 않습니다. `VITE ... ready in` 이 기록에 뜬 뒤에 엽니다.
  - **`docker compose logs web` 은 이전 기동의 기록까지 함께 보여줍니다.** 컨테이너를 지우지 않고 `stop`/`start` 만 하면 기록이 쌓인 채로 남습니다. `--since` 없이 보면 지난번 `ready` 를 이번 것으로 잘못 읽습니다. 이번 기동 이후만 보려면 `--since 1m` 또는 `docker inspect banblit-web-1 --format '{{.State.StartedAt}}'` 로 얻은 시각을 `--since` 에 넣습니다.
  - **코드를 고쳤는데 화면이 안 바뀌면 개발 서버가 옛 코드를 물고 있는 것입니다.** 윈도우 폴더를 컨테이너에 걸면 파일이 바뀌었다는 알림이 컨테이너 안까지 오지 않습니다. `frontend/vite.config.ts` 의 `server.watch.usePolling` 이 이것 때문에 켜져 있습니다. 그래도 안 따라오면 `docker compose restart web` 으로 다시 띄웁니다. 이 증상을 코드 문제로 오진한 적이 두 번 있습니다.
  - **화면은 5173, API 는 8000 에서 돕니다.** 브라우저는 화면을 받아온 곳과 다른 곳에 값을 물으면 막으므로, 개발 서버가 정해진 경로만 API 로 대신 넘깁니다. 넘기는 경로 목록은 `frontend/vite.config.ts` 의 `API_PATHS` 가 갖습니다. API 통로를 추가하면 이 목록도 함께 늘려야 합니다.
  - 달력에 데이터가 보이려면 `4-2` 마이그레이션이 들어가 있고 팀·기간·배정이 실제로 등록돼 있어야 합니다. 없으면 화면은 정상적으로 뜨고 "저장된 배정이 없다" 고 말합니다.
  - 5173 번 포트가 다른 프로그램에 쓰이고 있으면 실패합니다. 이 저장소와 무관한 컨테이너가 그 포트를 쓰고 있다면 함부로 내리지 않습니다.

### 10-1-1. 화면이 실제로 뜨는지 확인하기

```
curl -s -o /dev/null -w "%{http_code}
" http://localhost:5173/scheduler
curl -s http://localhost:5173/periods/1/schedule
```

- **실행 경로**: 어디서든 무관 (단, `10-1` 로 `web` 이 떠 있어야 합니다)
- **용도**: 브라우저를 열지 않고 두 가지를 확인합니다. 첫 줄은 주소를 직접 쳤을 때 화면이 나오는지(`200`), 둘째 줄은 개발 서버가 API 로 제대로 넘기는지(시간표 JSON 이 오는지)다.
- **옵션**
  - `-s` — 진행률 표시를 끕니다. `-o /dev/null` 은 본문을 버리고 `-w "%{http_code}"` 로 상태 코드만 찍습니다.
- **주의점**
  - `000` 이 나오면 서버가 아직 응답하지 않는 것입니다. 대개 `npm install` 이 아직 도는 중입니다. `10-1` 의 기록 확인으로 돌아갑니다.
  - 이 확인은 화면이 **응답하는지**만 봅니다. 화면이 설계대로 그려지는지는 브라우저로 직접 열어 봐야 합니다.

### 10-2. 화면 테스트 돌리기

```
docker compose run --rm --no-deps web npm test
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 화면 쪽 검사를 돌립니다. 지금 덮는 것은 순수 계산과 입력 검증이다 — 서버 호출 감싸개, 달력 칸 계산, slot 조각을 합주로 잇는 계산, 계정 서식 입력 검사, 삭제 확인 문구의 조사 붙이기. 통과하면 `Tests 202 passed` 가 나옵니다. 화면을 실제로 띄워 보는 검사는 아직 없습니다.
- **옵션**
  - `run` — 일회용 컨테이너를 만들어 명령 하나만 돌리고 끝냅니다. 개발 서버를 띄운 채로도 따로 돌릴 수 있습니다.
  - `--rm` — 끝나면 그 컨테이너를 지웁니다. 붙이지 않으면 돌릴 때마다 찌꺼기가 쌓입니다.
  - `--no-deps` — `depends_on` 에 걸린 `api`(그리고 `db`)를 함께 띄우지 않습니다. 화면 검사는 서버가 필요 없습니다. 생략하면 DB 까지 올라와 느려집니다.
  - `npm test` — `frontend/package.json` 의 `test` 를 실행합니다. 내용은 `vitest run` 입니다. `run` 이 붙어 있어 한 번 돌고 끝나며, 파일을 지켜보는 상태로 머물지 않습니다.
- **주의점**
  - 패키지는 `10-1` 이 채워둔 `banblit-web-modules` 저장소를 그대로 씁니다. 그래서 이 명령은 설치 없이 곧바로 돕니다.
  - 검사 파일은 `frontend/src/**/*.test.ts` 만 잡습니다. 범위는 `frontend/vite.config.ts` 의 `test.include` 가 정합니다.

### 10-3. 화면 타입 검사 돌리기

```
docker compose run --rm --no-deps web npm run typecheck
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 화면 코드의 타입을 검사합니다. 아무것도 출력하지 않고 끝나면 통과입니다.
- **옵션**
  - `npm run typecheck` — `frontend/package.json` 의 `typecheck` 를 실행합니다. 내용은 `tsc -b --noEmit` 입니다. `-b` 는 `frontend/tsconfig.json` 이 가리키는 설정들을 순서대로 검사하고, `--noEmit` 은 결과 파일을 만들지 않습니다.
  - `--rm --no-deps` — `10-2` 와 같은 이유입니다.
- **주의점**
  - `-b` 는 지난 검사 결과를 `frontend/tsconfig.tsbuildinfo` 에 남겨 두 번째부터 빨라집니다. 이 파일은 저장소에 들어 있습니다.

### 10-4. 화면 빌드하기

```
docker compose run --rm --no-deps web npm run build
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 배포용 화면 묶음을 만듭니다. 결과는 `frontend/dist/` 에 들어갑니다.
- **옵션**
  - `npm run build` — `frontend/package.json` 의 `build` 를 실행합니다. 내용은 `tsc -b && vite build` 다. 타입 검사를 먼저 통과해야 묶기로 넘어갑니다.
  - `--rm --no-deps` — `10-2` 와 같은 이유입니다.
- **주의점**
  - **`frontend/dist/` 는 저장소에 들어 있습니다.** 이 명령을 돌리면 그 안이 덮여 쓰이므로, 커밋 전에 `git status` 로 무엇이 바뀌었는지 봅니다.
  - 이 묶음을 실제로 내보내는 장치는 아직 없습니다. 개발 서버는 배포에 가지 않으므로, 배포에서는 주소를 나눠주는 다른 것이 그 일을 대신해야 합니다 — 아직 정하지 않았습니다.

---

## 11. 배포

`docker-compose.yml` 이 **배포용 정본**입니다. 개발에서는 `docker-compose.override.yml` 이
자동으로 얹혀 그 위를 덮습니다. 그래서 배포에서는 `-f docker-compose.yml` 로 override 를
빼고 부르고, 개발에서는 아무것도 붙이지 않습니다.

배포에만 있는 서비스가 둘입니다 — 앞단 `caddy` 와 정기 백업 `backup`. 개발 override 가
이 둘에 profile 을 붙여 두어 개발에서는 뜨지 않습니다.

```
        배포 (-f docker-compose.yml)        개발 (그냥 docker compose)
        caddy   ← 443 을 받는 유일한 문      —
        web     ← 127.0.0.1 로만 열림        web  ← vite, 5173
        api                                  api
        db                                   db
        auto-assign                          auto-assign (꺼짐)
        backup                               —
```

### 11-1. 서버에 처음 올리기

```
git clone https://github.com/minkong-dev/Banblit.git
cd Banblit
cp .env.example .env
nano .env
docker compose -f docker-compose.yml up -d --build
docker compose -f docker-compose.yml run --rm api alembic upgrade head
```

- **실행 경로**: 서버의 저장소 루트
- **용도**: 클론한 저장소를 실제로 서비스하는 상태까지 올립니다.
- **`.env` 에서 반드시 채울 것**
  - `POSTGRES_PASSWORD` — 견본의 개발용 값을 그대로 두지 않습니다.
  - `BANBLIT_DOMAIN` — 이 이름으로 인증서를 받습니다. 이 이름이 **이미 이 서버를 가리키고
    있어야** 발급이 됩니다. 먼저 DNS 를 걸고 전파를 확인한 뒤에 띄웁니다.
  - `BACKUP_DIR` — 백업을 남길 host 폴더. 데이터베이스 volume 과 **다른 디스크**에 두는
    것이 좋습니다. 같은 디스크에 두면 그 디스크가 죽을 때 백업도 함께 갑니다.
  - `SMTP_*` — 비우면 비밀번호 재설정 메일이 나가지 않습니다. 비밀번호를 잊은 사람이
    스스로 되찾을 길이 없어집니다.
  - `APP_ORIGIN` — 메일에 담을 링크의 앞부분. 비우면 `http://localhost:5173` 이 실려 나가
    받는 사람이 누를 수 없는 링크가 됩니다.
- **옵션**
  - `-f docker-compose.yml` — 개발용 override 를 빼고 배포용만 씁니다. **빠뜨리면 개발
    설정이 얹혀 쿠키의 Secure 가 꺼지고 caddy·backup 이 뜨지 않습니다.**
  - `--build` — 서버에서 이미지를 직접 만듭니다. 처음에는 화면 묶기까지 돌아 몇 분 걸립니다.
  - `run --rm api alembic upgrade head` — 표를 만들고 최신으로 맞춥니다. 개발의 `banblit up`
    이 자동으로 하던 것을 배포에서는 손으로 합니다 — 데이터가 있는 곳에서 자동으로 도는
    마이그레이션은 되돌릴 자리가 없습니다.
- **주의점**
  - **80·443 이 열려 있어야 합니다.** Oracle Cloud 는 기본으로 막혀 있어 보안 목록(Security
    List)과 인스턴스 안 방화벽(`iptables`) 양쪽을 모두 열어야 합니다.
  - **Cloudflare 를 쓴다면** 이 이름만 프록시를 끄거나(DNS only), 켜 둘 것이면 SSL 모드를
    Full (strict) 로 둡니다. Flexible 로 두면 Cloudflare 가 서버에 http 로 붙어, 서버는
    자기가 http 로 서비스 중이라고 보고 로그인 쿠키를 붙이지 않습니다.
  - **첫 계정이 권한을 전부 받습니다**(`auth_service.py` 의 `_is_first_account`). 띄운
    직후에 관리자가 먼저 가입하십시오. 주소를 알리는 것은 그다음입니다.

### 11-2. 배포한 것을 새 판으로 올리기

```
git pull
docker compose -f docker-compose.yml build
docker compose -f docker-compose.yml run --rm api alembic upgrade head
docker compose -f docker-compose.yml up -d
```

- **실행 경로**: 서버의 저장소 루트
- **용도**: 코드를 최신으로 올립니다. 마이그레이션을 먼저 넣고 서비스를 바꿉니다.
- **주의점**
  - **마이그레이션이 먼저입니다.** 새 코드가 먼저 뜨면 아직 없는 열을 읽어 500 이 납니다
    (개발에서 실제로 겪었습니다 — `column members.department does not exist`).
  - `up -d` 는 바뀐 서비스만 다시 만듭니다. `db` 는 대개 그대로 남습니다.
  - 되돌려야 하면 마이그레이션도 함께 되돌려야 합니다(`4-2-1`). 데이터가 있는 곳에서는
    되돌리기가 값을 잃을 수 있으니, 되돌리기 전에 `11-4` 로 한 벌 떠 둡니다.

### 11-3. 앞단이 인증서를 받았는지 보기

```
docker compose -f docker-compose.yml logs caddy --since 5m
curl -sI https://in-six-strings.banblit.com | head -3
```

- **실행 경로**: 서버의 저장소 루트
- **용도**: 인증서 발급이 됐는지, https 로 실제 응답이 오는지 봅니다.
- **주의점**
  - `obtained certificate` 가 기록에 뜨면 성공입니다. 실패하면 대개 DNS 가 아직 이 서버를
    가리키지 않거나 80 번이 막혀 있는 것입니다 — 발급처가 80 번으로 확인하러 옵니다.
  - **실패를 반복하지 마십시오.** 같은 이름으로 짧은 시간에 여러 번 받으려 하면 발급처가
    한동안 거절합니다. 원인을 고친 뒤에 다시 띄웁니다.

### 11-4. 백업 확인하고 지금 한 벌 뜨기

```
ls -lh /srv/banblit/backups
docker compose -f docker-compose.yml logs backup --since 12h
docker compose -f docker-compose.yml exec -T db pg_dump --clean --if-exists -U banblit -d banblit | gzip > manual-$(date -u +%Y%m%dT%H%M%SZ).sql.gz
```

- **실행 경로**: 서버의 저장소 루트
- **용도**: 정기 백업이 실제로 쌓이고 있는지 보고, 구조를 바꾸기 직전처럼 필요할 때 손으로
  한 벌 뜹니다.
- **주의점**
  - `backup` 서비스는 기본 6시간마다 뜨고 14일치를 남깁니다(`BACKUP_INTERVAL_HOURS`,
    `BACKUP_KEEP_DAYS`). 데이터베이스와 게시판 첨부파일을 각각 뜹니다.
  - **뜨는 것만으로는 백업이 아닙니다.** 되살려 본 적 없는 백업은 백업이 아닙니다 —
    `11-5` 를 한 번은 해 보십시오.
  - 뜬 파일은 서버 안에 있습니다. 서버째 잃는 경우까지 막으려면 다른 곳으로 내려받는
    자리가 따로 있어야 합니다. 지금은 없습니다.

### 11-5. 백업으로 되살리기

```
gunzip -c /srv/banblit/backups/db-20260909T000000Z.sql.gz | docker compose -f docker-compose.yml exec -T db psql -U banblit -d banblit
docker run --rm -v banblit-attachments:/dst -v /srv/banblit/backups:/src alpine sh -c "tar -xzf /src/files-20260909T000000Z.tar.gz -C /dst"
```

- **실행 경로**: 서버의 저장소 루트
- **용도**: 뜬 파일로 데이터베이스와 첨부파일을 되돌립니다.
- **주의점**
  - **덮어씁니다.** 뜬 파일이 `--clean --if-exists` 로 만들어져 있어 지금 들어 있는 표를
    지우고 다시 만듭니다. 되살리기 전에 지금 상태를 한 벌 떠 두십시오.
  - 되살리는 동안 `api` 를 내려 두는 편이 안전합니다 — 표가 사라졌다 생기는 사이에 들어온
    요청이 무엇을 볼지 정해져 있지 않습니다.
  - 첨부파일 되살리기는 volume 에 직접 풉니다. 지금 들어 있는 같은 이름 파일을 덮습니다.

---

## 12. E2E 테스트

### 12-1. E2E 테스트 돌리기

```
docker compose run --rm e2e
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `frontend/e2e/` 의 Playwright 검사를 전부 돌립니다. 사람이 브라우저에서 하는
  일(달력 보기, 설정 고치기, 글쓰기·댓글·파일 첨부, 배정 다시 계산, 팀 명단 보기,
  팀 참가 신청과 승인, 알림 칸 보기)을 흉내내 화면·서버·저장소가 실제로 이어져
  도는지 확인합니다.
- **옵션**
  - `run --rm` — 일회성 컨테이너를 띄워 명령을 실행하고 끝나면 지웁니다.
  - `e2e` — `docker-compose.yml` 의 `e2e` 서비스. 공식 이미지 `mcr.microsoft.com/playwright:v1.62.1-noble`
    를 써서 브라우저를 따로 받지 않습니다. 컨테이너 안에서 `npm install` 로 `frontend/package.json`
    의 `@playwright/test`(버전을 이미지 태그와 똑같이 `1.62.1` 로 고정했습니다)를 설치한 뒤
    `npx playwright test` 를 돕니다.
  - `depends_on: web` 이 걸려 있어 `web` 서비스가 자동으로 함께 뜹니다. 다만 `web` 이
    응답할 수 있는 상태까지 기다려 주지는 않으므로(→ 주의점), 미리 `10-1` 로 띄워
    두고 화면이 실제로 열리는 것을 확인한 뒤 이 명령을 돌리는 편이 안전합니다.
- **주의점**
  - **`web` 을 막 띄웠거나 막 재시작했다면 먼저 준비될 때까지 기다려야 합니다.**
    컨테이너 안에서 매번 `npm install` 을 다시 돌기 때문에(`docker-compose.yml`
    의 `web.command`), 뜬 지 얼마 안 됐으면 5173 번이 아직 응답하지 않습니다.
    이 상태에서 `e2e` 를 돌리면 모든 검사가 `ECONNREFUSED` 로 한꺼번에 실패합니다.
    `10-1-1` 의 확인 명령으로 200 이 나오는 것을 보고 나서 돌립니다.
  - **이미지가 큽니다(브라우저 세 종 포함, 처음 받으면 1GB 가 넘습니다).** 처음 한 번만
    느리고, 그 뒤로는 로컬 이미지 캐시를 그대로 씁니다.
  - **`@playwright/test` 버전과 이미지 태그 버전이 어긋나면 안 됩니다.** 이미지 안의
    브라우저가 그 버전에 맞춰 미리 깔려 있어서입니다. `frontend/package.json` 의
    devDependency 버전을 올릴 때는 `docker-compose.yml` 의 `e2e.image` 태그도
    같은 숫자로 함께 고칩니다.
  - 패키지는 `web` 과 따로 `banblit-e2e-modules` 라는 이름 붙은 저장소에 둡니다.
    이미지 바탕(Ubuntu)이 `web`(Alpine)과 달라, 네이티브 바이너리가 섞이는 것을
    막으려고 나눴습니다.
  - 계산이 걸리는 검사(`frontend/e2e/assignment.spec.ts`)는 배정 다시 계산이
    끝날 때까지 기다립니다. 2026-09-04 실측으로 1초 안팎이라 20초면 넉넉하지만,
    컨테이너 부하가 크면 늘어날 수 있습니다.
  - 검사 중 `frontend/e2e/notices.spec.ts` 가 공지에 글을 하나 남깁니다. 지우는
    지우는 자리가 없어 돌릴 때마다(제목에 실행 시각을 붙여 구분은 되지만) 계속 쌓입니다.
  - 계정도 마찬가지로 쌓입니다 — `account.spec.ts` 와 `teams.spec.ts` 가 가입을
    확인하려고 매번 새 계정을 만듭니다. 다만 이제는 탈퇴 통로(`DELETE /me`)가 있어
    검사 끝에 지울 수 있습니다. 팀 명단은 검사 끝에 되돌려 놓으므로 다음 실행이 같은
    값을 봅니다.
  - **이 검사는 지금 깨져 있습니다.** 시드가 만들던 `e2e@banblit.test` 계정이
    없어졌습니다. 고치기 전에는 통과하지 않습니다.

### 12-2. 특정 테스트 파일만 돌리기

```
docker compose run --rm e2e npx playwright test e2e/assignment.spec.ts
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 파일 하나만 골라 돌립니다. `12-1` 은 매번 전체를 돌려 느릴 때 이쪽을 씁니다.
- **옵션**
  - `npx playwright test <경로>` — `e2e` 서비스의 기본 명령(`npm install && npx playwright test`)
    대신 뒤에 이어 붙인 명령을 그대로 실행합니다. 경로는 `frontend/` 기준 상대경로입니다.

### 12-3. 화면 쪽에서 E2E 테스트만 따로 린트·타입 검사하기

```
docker compose run --rm --no-deps web npm run lint:e2e
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `frontend/e2e/` 만 타입 인식 린트로 검사합니다.
- **주의점**
  - **`frontend/eslint.config.js` 는 이 저장소의 `config-protection` 훅이 에이전트의
    수정을 막습니다.** 그래서 `e2e/` 전용 설정을 `frontend/e2e/lint.config.js` 에
    따로 두고, `npm run lint`(기본 `eslint .`)에서는 `--ignore-pattern "e2e/**/*"`
    로 그 폴더를 빼는 대신 이 명령으로 따로 검사합니다. 두 설정 파일이 나뉜 것은
    선호가 아니라 이 제약 때문이다 — 한 파일로 합치려면 사람이 직접
    `frontend/eslint.config.js` 에 `files: ["e2e/**/*.ts"]` 블록을 더해야 합니다.
    이 걸러내는 값은 **겹따옴표라야 합니다.** 홑따옴표로 적으면 Windows 에서 따옴표가
    그대로 남아 아무 폴더도 안 걸러지고, `e2e/` 가 타입 정보 없이 린트되어 명령이
    통째로 실패합니다(`await-thenable` 규칙이 타입 정보를 요구합니다). 컨테이너 안
    리눅스에서는 홑따옴표도 되므로 이 실패는 호스트에서만 보입니다.
  - `npm run typecheck`(`tsc -b --noEmit`)은 `frontend/tsconfig.json` 의 `include`
    에 `e2e` 를 이미 넣어 두어 따로 명령을 안 만들어도 `e2e/` 까지 함께 검사합니다.

---

## 13. 자동 배정 서비스

기간에 저장된 연산 시각(`periods.first_run_at`·`second_run_at`)이 지나면 사람이 버튼을
누르지 않아도 배정을 돌리는 서비스입니다. `api` 와 같은 이미지를 쓰되 HTTP endpoint 를 거치지
않고 `backend/src/backend/jobs/auto_assign.py` 의 `assign_period` 를 직접 부릅니다.

### 13-1. 자동 배정 서비스 띄우기

```
$env:AUTO_ASSIGN_ENABLED = "true"; docker compose up -d auto-assign
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker-compose.yml` 의 `auto-assign` 서비스를 백그라운드로 띄웁니다. 정해진
  간격마다 깨어나, 오늘이 기간 안에 드는 집중 합주기간 중 연산 시각이 지났는데 아직
  안 돈 것을 찾아 계산하고 `assignment_runs` 표에 돈 시각을 남깁니다.
- **옵션**
  - `$env:AUTO_ASSIGN_ENABLED = "true"` — 켜고 끄는 스위치(PowerShell 문법). 개발용
    설정(`docker-compose.override.yml`)이 이 값을 기본 `false` 로 두므로, 개발 PC 에서
    눈으로 보려면 이렇게 켜서 띄웁니다. Git Bash 라면
    `AUTO_ASSIGN_ENABLED=true docker compose up -d auto-assign` 로 앞에 붙입니다.
    끌 때는 `"false"`(또는 `0`·`no`)를 줍니다 — 컨테이너가 한 줄 남기고 정상 종료합니다.
    배포용(`docker-compose.yml`)의 기본값은 `true` 다.
  - `AUTO_ASSIGN_INTERVAL_SECONDS` — 확인 간격(초). 배포 기본 60, 개발 기본 10.
    숫자가 아니거나 0 이하면 코드가 기본값 60 을 씁니다. 생략해도 됩니다.
  - `-d` — 백그라운드로 띄웁니다. 붙이지 않으면 터미널이 이 서비스의 기록으로 막힙니다.
- **주의점**
  - **호스트 포트를 열지 않습니다.** 이 서비스는 받는 통로가 없고 `db` 로만 나갑니다.
  - **자동 실행은 등록된 팀 전부와 합주실 전부를 대상으로 돕니다.** 사람이 버튼을 누를
    때와 달리 골라 줄 화면이 없어서입니다. 그래서 오늘이 기간 안에 드는 집중 합주기간이
    둘 이상이면 서로 같은 합주실·같은 시각을 잡으려다 하나는 실패로 기록됩니다.
  - **`docker compose up` 을 서비스 이름 없이 실행하면 이것까지 함께 뜹니다.** 개발
    기본값이 `false` 인 것은 그때 검사용 데이터를 건드리지 않게 하려는 것입니다.
  - `backend/pyproject.toml` 또는 `backend/uv.lock` 이 바뀐 뒤라면 `docker compose build dev`
    로 이미지를 먼저 다시 만듭니다 — 개발용 `auto-assign` 은 `dev` 이미지를 그대로 씁니다.

### 13-2. 자동 배정 기록 보기

```
docker compose logs auto-assign --tail 30
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 무엇을 돌렸는지, 어느 기간이 실패했는지 봅니다. 성공하면
  `자동 배정: AutoRun(period_id=..., run_on=..., slots=('first',), saved=True, error=None)`
  한 줄이, 실패하면 `자동 배정이 실패했습니다 (period=...)` 와 원인 추적이 남습니다.
- **옵션**
  - `--tail 30` — 마지막 30줄만 봅니다. 생략하면 기동 이후 전부를 출력합니다.

### 13-3. 어느 시각이 돌았는지 테이블로 확인하기

```
docker compose exec db psql -U banblit -d banblit -c "select * from assignment_runs;"
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `assignment_runs` 는 "이 기간의, 이 날짜의, 이 시각(`first`/`second`)은
  돌았다" 를 남기는 표입니다. 서비스는 이 표에 없는 시각만 돌리므로, 같은 시각이 두 번
  돌지 않는 근거가 여기 있습니다. `ran_at` 은 계산이 **끝난** 시각입니다.
- **옵션**
  - `-c "<질의>"` — `4-4` 와 동일. 질의 하나만 실행하고 빠져나옵니다.
- **주의점**
  - `(period_id, run_on, slot)` 에 중복 금지가 걸려 있어 같은 시각이 두 줄로 남지 않습니다.
  - 기간을 지우면 이 표의 줄도 함께 지워집니다(`ondelete='CASCADE'`).

### 13-4. 서비스 내리기

```
docker compose rm -sf auto-assign
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 자동 배정 서비스를 멈추고 컨테이너까지 지웁니다. `db` 는 그대로 둡니다.
- **옵션**
  - `-s` — 지우기 전에 먼저 멈춥니다. 없으면 도는 컨테이너는 지워지지 않습니다.
  - `-f` — "정말 지울까요" 를 묻지 않습니다. 없으면 대답을 기다리며 멈춰 섭니다.
- **주의점**
  - 멈추기만 할 거면 `docker compose stop auto-assign` 을 씁니다. 다음에 `up -d` 하면
    같은 컨테이너를 다시 씁니다 — 그때는 띄울 때 준 환경변수가 그대로 남아 있습니다.

---

## 14. 관리 스크립트

`banblit.sh` 하나가 아래 13개 절의 명령을 순서대로 묶어 실행합니다. 개별 `docker compose`
명령의 뜻과 주의점은 이 문서의 해당 절이 정본이고, 이 장은 묶음이 무엇을 어떤 순서로
부르는지를 적습니다.

윈도우와 리눅스 서버가 같은 파일을 씁니다. `banblit.ps1` 은 PowerShell 에서 `banblit up` 을
그대로 치기 위한 껍데기이고, Git Bash 로 `banblit.sh` 를 부르기만 합니다 — PowerShell 식
switch(`-Auto` 등)는 껍데기가 `--auto` 로 바꿔 넘기므로 쓰던 대로 치면 됩니다.

띄우는 것이 두 가지입니다. 어느 쪽인지는 돌고 있는 OS 로 정하고, `--dev`·`--deploy` 로
직접 고를 수 있습니다. 고른 쪽을 매번 첫 줄에 적습니다.

| 모드 | 언제 | 무엇이 뜨나 |
|---|---|---|
| `dev` | 윈도우(기본) | 개발용 override 가 얹혀 Vite 개발 서버와 api. 앞단·백업은 뜨지 않는다 |
| `deploy` | 그 밖(기본) | base 하나만. nginx·앞단(caddy)·정기 백업이 함께 뜨고 https 로 받는다 |

> `deploy` 는 아직 실제 서버에서 돌려 본 적이 없습니다. 서버를 받으면 여기에 실측을 적습니다.

서버에서는 갓 클론한 자리에 `./` 가 필요합니다 — 리눅스는 현재 폴더를 명령 검색 경로에
넣지 않기 때문입니다. `./banblit.sh up` 이 성공하면 `~/.bashrc` 에 `banblit` function 을
넣으므로, 그 뒤로는 윈도우와 똑같이 어느 경로에서나 `banblit up` 으로 씁니다.
표시 두 줄 사이에만 쓰므로 여러 번 실행해도 쌓이지 않고, 저장소를 옮기면 경로가 갱신됩니다.

### 14-1. 명령을 어느 경로에서나 쓰도록 등록하기

```
.\setup.ps1
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: PowerShell profile 에 `banblit` function 을 넣습니다. 등록하면 다른 폴더에서도
  `banblit up` 으로 쓸 수 있습니다. 등록하지 않아도 저장소 루트에서 `.\banblit.ps1 up` 으로 쓸 수 있습니다.
- **옵션**
  - `-Remove` — 등록한 function 을 profile 에서 지웁니다. 생략하면 등록합니다.
- **주의점**
  - alias 가 아니라 function 으로 넣습니다. alias 는 뒤따르는 인자를 넘기지 못하는 경우가 있습니다.
  - `# >>> banblit >>>` 와 `# <<< banblit <<<` 사이에만 쓰므로 여러 번 실행해도 쌓이지 않습니다.
  - 대상 profile 은 `$PROFILE.CurrentUserAllHosts` 다. 지금 열려 있는 창에도 바로 반영합니다.

### 14-2. 개발 환경을 한 번에 띄우기

```
banblit up
```

- **실행 경로**: 어디서나 (등록하지 않았으면 저장소 루트에서 `.\banblit.ps1 up`)
- **용도**: 아래를 순서대로 실행합니다.
  1. `banblit-backend:dev` 이미지가 `backend/pyproject.toml`·`uv.lock`·`Dockerfile` 보다
     오래되었으면 `1-1`(`docker compose build dev`)을 먼저 실행합니다.
  2. `4-2`(`alembic upgrade head`)로 마이그레이션을 맞춥니다.
  3. `3-1`·`10-1`로 `api` 와 `web` 을 띄웁니다.
  4. `/health` 와 5173 에 실제로 요청해 응답할 때까지 기다립니다.
  5. 가입된 계정이 있는지 세어 알려 줍니다.
  6. 브라우저로 화면을 엽니다.
- **옵션**
  - `-Auto` — `13-1`의 자동 배정 서비스까지 함께 띄웁니다. 생략하면 띄우지 않습니다.
    개발용 override 가 기본을 꺼짐으로 두기 때문에 이 switch 로만 켜집니다.
  - `-Build` — 이미지 나이와 무관하게 무조건 다시 만듭니다. 생략하면 나이를 보고 판단합니다.
  - `-NoBrowser` — 브라우저를 열지 않습니다. 생략하면 엽니다.
- **주의점**
  - 컨테이너가 `Up` 이어도 uvicorn 이 import 단계에서 죽어 있을 수 있으므로, `docker compose ps`
    가 아니라 실제 응답으로 확인합니다. API 는 120초, 화면은 420초까지 기다립니다.
  - 화면은 처음 띄울 때 컨테이너 안에서 `npm install` 이 돌아 몇 분 걸립니다.
  - 의존성을 추가하고 이미지를 다시 만들지 않으면 API 가 import 단계에서 죽습니다.
    1번 단계가 그것을 막습니다.

### 14-3. 검사 돌리기

```
banblit check
```

- **실행 경로**: 어디서나
- **용도**: `1-2`(`pytest -q`)와 `1-2-3`(`mypy`)을 차례로 돌립니다. 화면에는 통과 여부와
  실패한 항목만 내고, **전체 출력은 `.logs/pytest-<시각>.log`·`.logs/mypy-<시각>.log` 에 남깁니다.**
- **옵션**: 없습니다.
- **주의점**
  - 화면 출력을 줄이는 것이 목적입니다. 전체 출력이 필요하면 `.logs/` 의 파일을 보거나
    `1-2`·`1-2-3`을 직접 실행합니다.
  - `.logs/` 는 `.gitignore` 에 있습니다. 커밋되지 않습니다.
  - 하나라도 실패하면 종료 코드 1 로 끝납니다.

### 14-4. 무엇이 도는지 확인하기

```
banblit status
```

- **실행 경로**: 어디서나
- **용도**: `docker compose ps` 로 컨테이너 목록을 보이고, 8000 과 5173 에 실제로 요청해
  응답 여부를 확인합니다.
- **옵션**: 없습니다.
- **주의점**: 컨테이너가 `Up` 인 것과 앱이 응답하는 것은 다릅니다. 이 명령은 둘 다 봅니다.

### 14-5. 내리기

```
banblit down
```

- **실행 경로**: 어디서나
- **용도**: `3-3`으로 서비스를 내립니다. 데이터는 volume 에 남습니다.
- **옵션**
  - `-Volumes` — volume 까지 지웁니다. DB·첨부파일·테스트용 DB 가 전부 사라집니다.
    `yes` 를 직접 입력해야 실행됩니다. 생략하면 volume 을 남깁니다.

### 14-6. 그 밖의 명령

```
banblit logs api -Follow
banblit restart web
banblit migrate
banblit help
```

- **실행 경로**: 어디서나
- **용도**
  - `logs` — `3-1-2`. 최근 1분 기록을 봅니다. 대상을 적지 않으면 전부.
  - `restart` — 다시 띄웁니다. 대상을 적지 않으면 `api` 와 `web`.
  - `migrate` — `4-2`·`4-2-1`. 마이그레이션만 맞추고 현재 revision 을 냅니다.
  - `help` — 명령·service·switch 목록.
- **옵션**
  - 첫 번째 위치 인자가 명령, 두 번째가 대상 service 다. service 는
    `api` `web` `db` `auto-assign` 넷 중 하나이고, `logs` 와 `restart` 에서만 씁니다.
  - `-Follow` — `logs` 를 붙잡고 계속 봅니다. 생략하면 한 번 내고 끝납니다.
- **주의점**
  - 명령을 적지 않으면 `up` 이 기본값입니다.
