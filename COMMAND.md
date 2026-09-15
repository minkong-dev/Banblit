# COMMAND

> 문서 버전: 1.13.0 draft

이 문서는 Banblit에서 실제로 실행하여 동작을 확인한 명령어만 담으며, 실행하지 않은 명령어는 기록하지 않습니다.

각 명령어는 **실행 경로 / 용도 / 옵션 의미 / 주의점** 순으로 기록합니다.

---

## 1. container — 개발용

### 1-1. 개발용 image 생성하기

```
docker compose build dev
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 개발용 container(Docker 가 격리해 실행하는 환경) image(container 를 생성하는 원본 파일)인 `banblit-backend:dev` 를 생성합니다. 파이썬 3.14, OR-Tools, pytest 가 설치된 환경이 이 image 에 포함됩니다.
- **옵션**
  - `build` — `docker-compose.yml`에 적힌 설정대로 image 를 생성합니다. 생성만 하고 실행하지 않습니다.
  - `dev` — 생성 대상 서비스 이름입니다. `docker-compose.yml`의 `services.dev`를 가리킵니다. 생략하면 정의된 모든 서비스의 image 를 생성합니다.
- **주의점**
  - 처음 실행하면 파이썬 기반 image 와 OR-Tools 를 인터넷에서 내려받으므로 몇 분 걸립니다. 두 번째 실행부터는 캐시가 있어 몇 초로 끝납니다.
  - `backend/pyproject.toml` 또는 `backend/uv.lock`이 변경되면 다시 실행해야 합니다. 소스 코드만 수정한 경우에는 image 를 다시 생성할 필요가 없습니다.

### 1-1-1. 의존성을 추가한 뒤 잠금 파일 갱신하기

```
docker compose run --rm --no-deps dev uv lock
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `backend/pyproject.toml`에 패키지를 추가·삭제한 뒤, 실제로 설치할 버전을 확정해 `backend/uv.lock`에 적습니다. image 는 `uv sync --locked`로 잠금 파일에 적힌 버전 그대로만 설치하므로, 이 단계를 건너뛰면 `1-1` 의 빌드가 "잠금 파일이 pyproject.toml과 맞지 않는다" 는 오류로 실패합니다.
- **옵션**
  - `--no-deps` — 잠금 파일 생성에는 PostgreSQL 이 필요 없으므로 `db` 서비스를 실행하지 않습니다.
  - `uv lock` — container 안에서 실행할 명령입니다. 호스트에는 파이썬 환경이 없어 `uv`를 사용할 수 없습니다. container 의 `/app`이 호스트 PC의 `backend/` 폴더와 연결돼 있어, 갱신된 잠금 파일이 그대로 호스트 PC에 남습니다.
- **주의점**
  - 이 명령 뒤에는 반드시 `1-1`(`docker compose build dev`)을 실행해야 새 패키지가 image 에 설치됩니다.

### 1-2. container 안에서 테스트 실행하기

```
docker compose run --rm dev pytest -q
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 개발용 container 를 실행해 container 안에서 테스트를 실행합니다. 이 명령이 이 프로젝트의 **기준 테스트 실행 방법**입니다.
- **옵션**
  - `run` — 서비스를 일회성으로 실행해 명령을 실행합니다. 명령이 끝나면 container 도 정지합니다.
  - `--rm` — 정지한 container 를 자동으로 삭제합니다. 생략하면 실행할 때마다 정지한 container 가 누적됩니다.
  - `dev` — 실행할 서비스 이름입니다.
  - `pytest` — container 안에서 실행할 명령입니다. image 의 기본 실행 명령도 `pytest` 라 생략할 수 있지만, 뒤에 옵션을 지정하려면 `pytest` 를 명시해야 합니다.
  - `-q` — 결과를 짧게 출력합니다(통과한 테스트를 점 1개로 표시). 생략하면 기본값인 보통 길이로 출력합니다.
- **자주 쓰는 변형**
  - `docker compose run --rm dev pytest -v` — 테스트 이름을 1개씩 모두 출력합니다. 어떤 시나리오를 검사하는지 확인할 때 사용합니다.
  - `docker compose run --rm dev pytest tests/unit/test_resolution.py` — 지정한 파일만 실행합니다.
- **주의점**
  - 호스트 PC의 `backend/` 폴더가 container 안에 연결돼 있어, 코드를 수정하면 image 를 다시 생성하지 않아도 바로 반영됩니다.

### 1-2-0. 테스트를 2개 이상 동시에 실행할 때 테스트 DB를 분리하기

```
docker compose run --rm -e TEST_DB_NAME=banblit_test_a dev pytest -q tests/integration/db/test_room_endpoints.py
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 서로 다른 파일을 동시에 검사할 때 사용합니다. 검사는 시작할 때 table(데이터베이스의 행·열 구조)을 전부 삭제하고 마이그레이션을 다시 적용하므로, 2개의 실행이 같은 DB를 사용하면 서로의 table 을 삭제합니다.
- **옵션**
  - `-e TEST_DB_NAME=banblit_test_a` — `docker compose run` 이 container 에 전달하는 환경변수입니다. `backend/tests/conftest.py` 가 이 값으로 검사 전용 DB 이름을 정합니다. **생략하면 `banblit_test`** 를 사용합니다. 이름은 제한이 없으며, 같은 이름의 DB 가 없으면 첫 실행에서 생성합니다.
- **주의점**
  - 테스트를 1개만 실행할 때는 지정하지 않습니다. DB 이름이 늘어날수록 `docker compose exec db psql` 로 확인할 때 어느 DB 가 어느 실행의 DB 인지 구분하기 어렵습니다.
  - 생성된 검사용 DB는 자동으로 삭제되지 않습니다. `1-4`의 `docker compose down -v` 로 데이터 volume(container 가 삭제돼도 유지되는 저장 공간)을 통째로 삭제할 때 함께 삭제됩니다.

### 1-2-1. 다른 서비스를 실행하지 않고 순수 계산 테스트만 실행하기

```
docker compose run --rm --no-deps dev pytest -q tests/unit
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 외부와 통신하지 않는 검사만 실행합니다. 실패 원인이 코드인지 환경인지 구분할 때 이 명령을 먼저 실행합니다.
- **옵션**
  - `--no-deps` — `docker-compose.yml`에서 `dev`가 의존하는 `db` 서비스를 실행하지 않습니다. 생략하면 PostgreSQL 이 먼저 실행되어, 외부 의존 없이 실행되는지를 확인하는 의미가 없어집니다.
  - `tests/unit` — 실행할 폴더를 지정합니다. 생략하면 `tests/` 전체가 실행되어 통합 검사까지 포함됩니다.
- **주의점**
  - 외부와 실제로 통신하는 검사는 `tests/integration/<의존 대상>/` 아래에 둡니다. 지금은 `tests/integration/db/` 1개뿐입니다.
  - 폴더 이름이 곧 marker(pytest 가 테스트를 분류하는 표시) 이름입니다. `backend/tests/conftest.py`의 `pytest_collection_modifyitems`가 폴더를 보고 자동으로 부여합니다. marker 이름 자체는 `backend/pyproject.toml`의 `[tool.pytest.ini_options]`에 등록돼 있습니다.
  - `tests/unit` 의 검사가 실제 DB fixture(`test_engine`·`db_session`·`api_client`)를 사용하면 수집 단계에서 중단됩니다. DB 가 실행 중인 동안 오류 메시지 없이 통과하는 경우를 막기 위해서입니다.
  - 2026-08-28 기준 전체 145개 중 `tests/unit` 이 91개, `tests/integration/db` 가 54개입니다.

### 1-2-2. DB 가 필요한 테스트만 실행하기

```
docker compose run --rm dev pytest -q tests/integration/db
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 실제 PostgreSQL 에 접속해야 실행되는 검사만 실행합니다.
- **주의점**
  - `--no-deps` 를 지정하면 안 됩니다. `db` 서비스가 실행 중이어야 합니다.
  - marker 로 선택하는 `-m db` 도 같은 결과를 출력합니다. 폴더 지정이 더 명확해 폴더 지정을 정본으로 사용합니다.

### 1-2-3. 타입 검사 실행하기

```
docker compose run --rm --no-deps dev mypy
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 표기한 타입과 실제로 전달되는 값이 일치하는지 검사합니다. `CLAUDE.md`가 모든 함수에 타입 표기를 요구하는데, 이 검사가 없으면 표기가 맞는지 확인하는 수단이 없습니다.
- **옵션**
  - `--no-deps` — 타입 검사는 코드를 읽기만 하므로 PostgreSQL 이 필요 없습니다.
  - `mypy` — 검사할 대상을 뒤에 적지 않습니다. `backend/pyproject.toml`의 `[tool.mypy]`에 `files = ["src", "tests"]`로 적혀 있어 `src` 와 `tests` 2개를 검사합니다.
- **주의점**
  - `disallow_untyped_defs`가 활성화되어 있습니다. 타입 표기가 없는 함수는 mypy 가 본문을 검사하지 않으므로, 타입 표기가 없는 함수 자체를 오류로 보고합니다.
  - 2026-08-28 기준 소스 44개 파일이 오류 없이 통과합니다.

### 1-3. 가장 느린 테스트 확인하기

```
docker compose run --rm dev pytest -q --durations=5
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 전체 테스트를 실행하면서, 실행 시간이 긴 테스트를 순서대로 출력합니다. 기간 자동 배정처럼 계산량이 실제 운영 규모에 가까운 테스트가 얼마나 걸리는지 확인할 때 사용합니다.
- **옵션**
  - `run --rm dev pytest -q` — `1-2`와 동일합니다. 개발용 container 를 일회성으로 실행해 테스트를 짧은 출력으로 실행합니다.
  - `--durations=5` — 테스트가 모두 끝난 뒤, 실행 시간이 긴 순서로 5개까지만 목록에 출력합니다. 숫자는 출력할 개수를 정하며, 생략하면 이 목록 자체가 출력되지 않습니다(`--durations=0`을 지정하면 전체 테스트를 모두 나열합니다).
- **주의점**: 시간 값은 실행하는 기계 성능에 좌우됩니다. 이 저장소 문서에 적힌 수치는 이 방법으로 측정한 실측값이며, 다른 환경에서는 달라질 수 있습니다.

### 1-4. container 안에 직접 접속하기

```
docker compose run --rm dev bash
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: container 내부를 직접 확인합니다. 설치된 패키지 확인이나 명령 시험에 사용합니다.
- **옵션**
  - `bash` — container 안에서 실행할 명령을 명령줄 셸로 지정합니다.
- **주의점**: 종료할 때는 `exit`를 입력합니다. `--rm`이 지정돼 있어 종료하는 순간 container 가 삭제되므로, container 안에서 연결된 폴더 밖에 생성한 파일은 삭제됩니다.

---

## 2. container — 배포용

### 2-1. 배포용 image 생성하기

```
docker build --target prod -t banblit-backend:prod backend/
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 실행에 필요한 패키지만 포함된 배포용 image 를 생성합니다. 테스트 도구는 포함되지 않습니다.
- **옵션**
  - `--target prod` — `Dockerfile`의 단계 중 `prod` 단계까지만 생성합니다. 생략하면 파일에 적힌 마지막 단계까지 생성합니다.
  - `-t banblit-backend:prod` — 생성한 image 에 지정할 이름과 tag(image 의 버전 표시)입니다. 생략하면 이름 없는 image 가 되어 나중에 찾기 어렵습니다.
  - `backend/` — `Dockerfile`과 복사 대상 파일들이 있는 폴더입니다. 이 폴더가 기준이 되므로 `backend/` 바깥 파일은 image 에 포함할 수 없습니다.
- **주의점**: 배포용 단계는 소스를 image 안에 복사합니다. 코드를 수정했으면 반드시 image 를 다시 생성해야 반영됩니다.

### 2-2. 배포용 image 동작 확인

```
docker run --rm -d -p 8001:8000 --name banblit-prod-check banblit-backend:prod
curl -s http://localhost:8001/health
docker stop banblit-prod-check
```

- **실행 경로**: 어디서든 무관 (단, 8001 포트가 사용 중이지 않아야 합니다)
- **용도**: 배포용 image 가 실제로 서버로 기동해 요청에 응답하는지 확인합니다. 배포용 `Dockerfile`의 실행 명령이 `uvicorn backend.api.app:app`으로 서버를 실행하도록 변경되면서, container 가 문구만 출력하고 종료되던 이전 방식(`python -c "..."`)은 더 이상 사용할 수 없습니다. 서버는 종료되지 않고 계속 실행되므로 포트를 열어 응답을 확인해야 합니다.
- **옵션**
  - `docker run` — image 로 container 를 새로 생성해 실행합니다.
  - `--rm` — container 가 정지하면 자동으로 삭제합니다.
  - `-d` — 백그라운드로 실행합니다. 생략하면 서버가 터미널을 점유해 다음 명령을 입력할 수 없습니다.
  - `-p 8001:8000` — 호스트 PC의 8001번 포트를 container 안의 8000번 포트에 연결합니다. 개발용 `api` 서비스(`3-1`)가 8000번을 사용하므로, 충돌하지 않게 8001번을 사용했습니다.
  - `--name banblit-prod-check` — container 에 이름을 지정합니다. 3행의 `docker stop`으로 정지시킬 때 이 이름으로 찾습니다. 생략하면 임의의 이름이 부여되어 찾기 번거롭습니다.
  - `curl -s http://localhost:8001/health` — 서버가 응답하는지 확인합니다. `-s`는 진행 표시를 숨깁니다. `{"status":"ok"}`가 출력되면 정상입니다.
  - `docker stop banblit-prod-check` — 이름으로 container 를 정지시킵니다. `--rm`이 지정돼 있으므로 정지 즉시 container 도 삭제됩니다.
- **주의점**: `-d` 없이 실행하면 터미널이 서버 로그로 점유되어 다음 명령을 입력할 수 없습니다. 확인이 끝나면 반드시 `docker stop`으로 정지해야 container 가 계속 실행 중인 채로 남지 않습니다.

### 2-3. 배포용에 테스트 도구가 없는지 확인

```
docker run --rm banblit-backend:prod python -c "import pytest"
```

- **실행 경로**: 어디서든 무관
- **용도**: 배포용 image 에 개발용 도구가 포함되지 않았는지 검사합니다.
- **옵션**
  - `python -c "..."` — container 안에서 따옴표 안의 파이썬 코드를 실행합니다.
- **주의점**: **이 명령은 실패해야 정상입니다.** `ModuleNotFoundError: No module named 'pytest'`가 출력되면 단계 분리가 정상입니다. 성공하면 배포용 image 에 테스트 도구가 포함된 상태이므로 `Dockerfile`을 점검해야 합니다.

---

## 3. 스케줄링 API 서버 — 로컬 기동

### 3-1. 개발용 API 서버 실행하기

```
docker compose up -d api
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker-compose.yml`의 `api` 서비스를 백그라운드로 실행해, `http://localhost:8000`에서 스케줄링 API(`GET /health`, `POST /assign`)를 호출할 수 있게 합니다. `api` 서비스는 개발용(`dev`) image 를 사용하고 `backend/` 폴더를 container 에 연결해, `--reload` 옵션으로 코드를 수정하면 서버가 자동으로 재시작합니다.
- **옵션**
  - `up` — 정의된 서비스를 생성하고(필요하면 image 를 빌드) 실행합니다.
  - `-d` — 백그라운드로 실행합니다. 생략하면 터미널이 서버 로그로 점유되어 다음 명령을 입력할 수 없습니다.
  - `api` — 실행할 대상 서비스 이름입니다. `docker-compose.yml`의 `services.api`를 가리킵니다. 생략하면 `docker-compose.yml`에 정의된 서비스가 모두 실행됩니다(`dev`는 기본 명령이 `pytest`라 곧바로 종료됩니다).
- **주의점**
  - 8000번 포트를 이미 다른 프로그램(다른 프로젝트의 container 등)이 사용하고 있으면 `port is already allocated` 오류로 실패합니다. 이 저장소와 무관한 container 가 8000번 포트를 사용하고 있다면, 임의로 정지하지 말고 `CLAUDE.md` 4-1에 따라 먼저 사용자에게 확인받습니다.
  - `backend/pyproject.toml` 또는 `backend/uv.lock`이 변경된 뒤라면 `docker compose build dev`로 image 를 먼저 다시 생성해야 새 패키지가 반영됩니다(`api` 서비스는 `dev` image 를 그대로 사용합니다).

### 3-1-1. 실행한 서버 정지하기

```
docker compose stop api
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `3-1`로 실행한 API 서버를 정지합니다. 8000번 포트를 해제합니다.
- **옵션**
  - `stop` — container 를 정지만 하고 삭제하지는 않습니다. 다음에 `up -d api`로 다시 실행하면 같은 container 를 사용합니다. 삭제하려면 `stop` 대신 `down`을 사용하지만, `down`은 `db`까지 함께 정지하므로 주의합니다.
  - `api` — 정지할 서비스 이름입니다. 생략하면 `db`를 포함한 모든 서비스가 정지합니다.

### 3-1-2. 서버 로그 보기

```
docker compose logs api --tail 30
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: API 서버가 남긴 로그를 확인합니다. 요청이 500이나 503으로 응답했을 때 원인을 이 로그에서 찾습니다.
- **옵션**
  - `--tail 30` — 마지막 30줄만 출력합니다. 생략하면 기동 이후 전체를 출력해 화면을 넘칩니다.

### 3-2. 서버 응답 확인

```
curl -s http://localhost:8000/health
```

- **실행 경로**: 어디서든 무관 (단, `3-1`로 `api` 서비스가 실행 중이어야 합니다)
- **용도**: 서버가 정상적으로 응답하는지 확인합니다. `{"status":"ok"}`가 출력되면 정상입니다.
- **옵션**
  - `-s` — 진행률 표시줄을 숨기고 응답 본문만 출력합니다.
- **주의점**: Git Bash에서 한글이 포함된 JSON 본문을 작은따옴표로 감싼 인라인 인자(`-d '...'`)로 `POST /assign`에 전달하면 인코딩이 깨져 `"There was an error parsing the body"`가 반환됩니다. 한글이 포함된 요청은 UTF-8로 저장한 파일을 `--data-binary @파일명`으로 전달해야 합니다.

### 3-3. 서버 정지하고 삭제하기

```
docker compose down
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker compose up`으로 실행한 서비스(container·네트워크)를 정지하고 삭제합니다.
- **옵션**: 옵션 없이 사용합니다. `docker-compose.yml`에 정의된 모든 서비스를 대상으로 정지하고 삭제합니다.
- **주의점**: 이 저장소가 실행한 서비스만 정지합니다. 다른 프로젝트의 container 에는 영향을 주지 않습니다.

### 3-4. 로그인·인증 흐름 확인 (cookie)

```
curl -s -i -X POST http://localhost:8000/signup -H "Content-Type: application/json" --data-binary @signup.json -c cookies.txt
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/me -b cookies.txt
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/logout -b cookies.txt
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/me -b cookies.txt
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `3-1`로 `api` 서비스가 실행 중이어야 합니다)
- **용도**: 로그인 session(서버가 로그인 상태를 기억하는 단위)이 **cookie(브라우저가 저장하고 요청마다 함께 보내는 값)**로 전달되는지를 4행으로 확인합니다. 가입해서 cookie 를 파일에 저장하고(1행), 저장한 cookie 만으로 `/me` 를 요청해 `200`을 받고(2행), 로그아웃한 뒤(3행) 같은 cookie 로 다시 요청해 `401`이 반환되는지 확인합니다(4행). 4행이 `200`이면 로그아웃이 session 을 취소하지 못한 상태입니다.
- **본문 파일**: 1행의 `signup.json`은 직접 생성합니다. 이름·이메일·비밀번호·포지션 4개 값이 필요하고, 포지션은 마이그레이션이 추가한 목록(보컬·기타·베이스·드럼·키보드)에서 선택합니다.

  ```json
  {"name": "홍길동", "email": "test@example.com", "password": "banblit-test-1", "positions": ["드럼"]}
  ```

- **옵션**
  - `-s` — 진행률 표시줄을 숨깁니다.
  - `-i` — 응답 **header(응답의 부가 정보 영역)까지 함께** 출력합니다. 생략하면 본문만 출력되어 `set-cookie` 2줄(`banblit_session`, `banblit_signed_in`)이 실제로 반환되는지 확인할 수 없습니다.
  - `-X POST` — 요청 방식을 지정합니다. 생략하면 `GET`입니다. 본문을 지정하면 `curl`이 자동으로 `POST`로 변경하지만, 읽는 사람을 위해 명시합니다.
  - `-H "Content-Type: application/json"` — 본문이 JSON이라고 알립니다. 생략하면 서버가 본문을 JSON으로 읽지 않아 `422`로 거절합니다.
  - `--data-binary @<파일>` — 파일 내용을 **변경하지 않고 그대로** 본문으로 전송합니다.
  - `-c <쿠키파일>` — 응답으로 받은 cookie 를 지정한 파일에 **저장합니다**. 생략하면 받은 cookie 를 버리므로 다음 행이 인증되지 않습니다.
  - `-b <쿠키파일>` — 저장한 cookie 를 요청에 **포함해 전송합니다**. 생략하면 cookie 없이 전송되므로 `/me`는 `401`을 반환합니다.
  - `-o /dev/null` — 본문을 버립니다. `-w "%{http_code}\n"` — 상태 코드만 1행으로 출력합니다. 2개를 함께 사용해 상태 코드만 확인합니다.
- **주의점**
  - **`4-2`의 마이그레이션이 먼저 적용돼 있어야 합니다.** session 을 저장하는 `sessions` table 이 없으면 가입 자체가 실패합니다.
  - 한글이 포함된 본문을 인라인(`-d '...'`)으로 전달하면 Git Bash에서 인코딩이 깨집니다. 그래서 `--data-binary @파일`을 사용합니다. 자세한 사유는 `3-2`의 주의점에 적어 두었습니다.
  - **cookie 파일은 로그인한 상태 그 자체입니다.** 확인이 끝나면 삭제하고, 저장소에 커밋하지 않습니다.
  - 같은 이메일로 1행을 2번 실행하면 `422`("이미 가입된 이메일입니다")가 반환됩니다. 다시 확인할 때는 이메일을 변경합니다.
  - 개발 구성은 `docker-compose.override.yml`이 `COOKIE_SECURE=false`로 덮어쓰므로 `http`로도 cookie 가 저장됩니다. 배포 구성(`11-1`)은 `docker-compose.yml`의 `COOKIE_SECURE=true`가 유지되어, `https`가 아니면 브라우저가 session cookie 를 저장하지 않습니다.
  - `token` 같은 필드를 응답 본문에서 찾지 않습니다. session 은 본문이 아니라 cookie 로만 전달됩니다. header 에 token(인증용 문자열)을 포함해 전송하던 이전 방식은 더 이상 동작하지 않습니다.


### 3-5. 게시판 첨부파일 업로드하고 내려받기

```
curl -s -b cookies.txt -X POST http://localhost:8000/posts/31/attachments -F "file=@score.pdf;type=application/pdf"
curl -s -b cookies.txt -D headers.txt -o got.pdf http://localhost:8000/attachments/1
cmp score.pdf got.pdf
docker compose exec api ls -l /var/lib/banblit/attachments
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `3-1`로 `api` 서비스가 실행 중이고 `3-4`로 저장한 `cookies.txt` 가 있어야 합니다)
- **용도**: 파일이 실제로 서버 디스크에 저장되고 그대로 다시 내려받아지는지 확인합니다. 1행이 게시글 31번에 파일을 첨부하고(201), 2행이 첨부한 파일을 내려받고, 3행이 보낸 파일과 받은 파일이 1바이트도 다르지 않은지 비교합니다(다르면 메시지를 출력하고, 같으면 아무것도 출력하지 않습니다). 4행은 container 안의 저장 폴더를 열어, 서버가 부여한 이름으로 파일 1개가 저장됐는지 확인합니다.
- **옵션**
  - `-F "file=@<파일>"` — `multipart/form-data` 로 파일을 전송합니다. 항목 이름 `file` 은 서버가 정한 이름이라 변경하면 422 를 반환합니다. `;type=` 을 생략하면 curl 이 확장자를 보고 종류를 정합니다. `;filename=` 을 추가하면 전송할 이름을 따로 지정할 수 있습니다.
  - `-D <파일>` — 응답 header 를 지정한 파일에 저장합니다. `content-disposition: attachment` 와 `x-content-type-options: nosniff` 가 포함됐는지 확인하는 데 사용합니다. 생략하면 header 를 확인할 수 없습니다.
  - `-o <파일>` — 내려받은 내용을 지정한 파일에 저장합니다. 생략하면 이진 파일이 터미널에 그대로 출력됩니다.
- **주의점**
  - **작성자 본인만 첨부하고 삭제할 수 있습니다.** 다른 계정의 cookie 로 1행을 전송하면 403 을 반환합니다. 팀 게시판 게시글이면 내려받기도 그 팀 소속 멤버만 할 수 있습니다.
  - **허용 목록에 없는 확장자는 422 로 거절됩니다.** 목록은 `backend/src/backend/services/attachment_service.py` 의 `ALLOWED_EXTENSIONS` 1곳에만 있습니다.
  - **Git Bash 에서 `;filename=` 에 한글을 적으면 이름이 깨져 저장됩니다.** 터미널이 UTF-8 로 전송하지 않기 때문입니다. 서버 문제가 아닙니다. 브라우저와 검사(`tests/integration/db/test_attachment_endpoints.py`)에서는 한글 이름이 그대로 저장됩니다.
  - **개발 구성에는 앞단 서버(nginx)가 없습니다.** 크기 상한(`client_max_body_size 300m`)은 배포 구성에서만 적용되므로, 개발에서 300MB 를 초과해 전송하면 그대로 통과합니다. 배포 구성으로 확인하려면 `11-1` 로 실행한 서버에서 확인합니다.
  - 저장 폴더는 `banblit-attachments` volume 입니다. `docker compose down` 으로 정지해도 유지되고, `down -v` 로만 삭제됩니다.

---

## 4. 데이터 저장소

### 4-1. DB container 만 따로 실행하기

```
docker compose up -d db
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker-compose.yml`의 `db` 서비스(PostgreSQL 17)만 백그라운드로 실행합니다. `dev`·`api` 서비스는 `depends_on: db (service_healthy)`로 `db` 서비스를 자동으로 함께 실행하므로, DB 내용을 직접 확인할 때(예: `4-4`의 `psql` 접속)만 이 명령을 따로 사용합니다.
- **옵션**
  - `up` — 정의된 서비스를 생성하고(필요하면 image 를 내려받고) 실행합니다.
  - `-d` — 백그라운드로 실행합니다. 생략하면 터미널이 로그로 점유됩니다.
  - `db` — 실행할 대상 서비스 이름입니다. 생략하면 `docker-compose.yml`에 정의된 서비스가 모두 실행됩니다.
- **주의점**
  - **호스트 포트를 열지 않았습니다.** 이 PC에는 다른 프로덕트의 PostgreSQL container 가 있어 5432 포트 충돌을 피하려고 `db` 서비스는 container 사이 내부망(`db:5432`)으로만 접속하도록 설정했습니다. 그래서 호스트 PC에 설치된 DB 도구(예: pgAdmin, DBeaver, `psql` 등)로 `localhost`에 바로 접속할 수 없습니다. 반드시 `4-4`처럼 `docker compose exec db`로 container 안에 접속해서 확인해야 합니다.
  - 데이터는 이름 있는 volume(`banblit-db-data`)에 보존됩니다. `docker compose down`으로 서비스를 정지해도 데이터는 유지되고, `docker compose down -v`처럼 volume 까지 삭제하는 명령을 사용할 때만 삭제됩니다.

### 4-2. 마이그레이션을 최신으로 맞추기

```
docker compose run --rm dev alembic upgrade head
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `backend/migrations/versions/`에 저장된 마이그레이션을 순서대로 적용해, DB 스키마를 가장 최신 정의(`backend/src/backend/db/models.py`)와 맞춥니다.
- **옵션**
  - `run --rm dev` — `1-2`와 동일합니다. 개발용 container 를 일회성으로 실행해 명령을 실행하고 끝나면 삭제합니다.
  - `alembic upgrade head` — alembic에게 "아직 적용되지 않은 마이그레이션을 전부, 가장 최신(head)까지 순서대로 적용하라"고 지시합니다.
- **주의점**
  - `dev` 서비스가 `db`에 `depends_on: service_healthy`로 의존하고 있어, 이 명령을 실행하면 `db` container 가 실행 중이 아니던 경우 자동으로 함께 실행되고 healthcheck를 통과한 뒤에 적용이 시작됩니다. 따로 `4-1`을 먼저 실행할 필요는 없습니다.
  - 접속 주소는 `backend/migrations/env.py`가 `config.attributes`에 명시된 값을 최우선하고, 없으면 `DATABASE_URL` 환경변수로 접속합니다. 이 명령으로 실행하면 container 환경변수인 `DATABASE_URL`(메인 `banblit` DB)이 그대로 사용됩니다. 테스트 전용 DB(`banblit_test`)는 pytest 실행 시 `backend/tests/conftest.py`가 별도로 처리합니다.

### 4-2-1. 마이그레이션을 1단계 되돌리기 / 현재 적용 위치 확인하기

```
docker compose run --rm dev alembic current
docker compose run --rm dev alembic heads
docker compose run --rm dev alembic downgrade -1
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `alembic current`는 지금 DB에 적용된 마이그레이션 번호를 출력합니다. `alembic heads`는 DB가 아니라 `backend/migrations/versions/` 파일들을 읽어 맨 끝 번호를 출력합니다. 새 마이그레이션을 생성하기 직전에 어떤 번호 뒤에 추가할지 확인하는 용도이고, 2줄 이상 출력되면 분기가 생긴 상태입니다. `alembic downgrade -1`은 가장 최근에 적용된 마이그레이션 1개의 `downgrade()`를 실행해 그 직전 상태로 되돌립니다.
- **옵션**
  - `-1` — 되돌릴 단계 수입니다. 숫자 대신 `alembic downgrade <revision>`처럼 되돌아갈 목적지 번호를 직접 적어도 됩니다. 생략하면 오류입니다. 어디까지 되돌릴지 반드시 적어야 합니다.
- **주의점**
  - **열을 삭제하는 `downgrade()`는 그 열의 값을 함께 삭제합니다.** 되돌린 뒤 다시 `upgrade`해도 삭제된 값은 복구되지 않습니다. 새 마이그레이션을 검증할 때만 사용하고, 값이 저장된 DB에서는 먼저 백업합니다.
  - permission set(권한 집합) 마이그레이션(`b7f1a92c4d31`)의 되돌리기는 `members.role`을 다시 생성하고, 항목이 전부 활성화된 permission set 을 가진 멤버를 `head_manager`로 되돌린 뒤 2개 table 을 삭제합니다. 이 왕복은 `backend/tests/integration/db/test_permission_migration.py`가 전용 DB에서 자동으로 확인합니다.

### 4-3. 모델 변경 후 마이그레이션 새로 만들기

```
docker compose run --rm dev alembic revision --autogenerate -m "<제목>"
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `backend/src/backend/db/models.py`를 수정한 뒤, 변경분을 현재 DB 스키마와 비교해 마이그레이션 파일을 자동으로 생성합니다. 파일은 `backend/migrations/versions/`에 생성됩니다.
- **옵션**
  - `revision` — 새 마이그레이션 파일 1개를 생성합니다.
  - `--autogenerate` — 현재 DB에 이미 적용된 스키마와 `models.py`가 정의한 목표 스키마를 비교해, 차이를 반영한 `upgrade()`/`downgrade()` 초안을 자동으로 작성합니다.
  - `-m "<제목>"` — 마이그레이션 파일 이름에 들어갈 설명입니다. 생략하면 제목 없는 파일이 되어 나중에 무슨 변경인지 알아보기 어렵습니다.
- **주의점**
  - **autogenerate는 `CheckConstraint`를 감지하지 못할 수 있습니다.** 실제로 `rooms`(정시 격자), `periods`(kind 목록), `assignments`(시간 역전 방지) table 의 `CheckConstraint`가 자동 생성된 초안에 빠졌던 적이 있어, 파일을 열어 직접 확인하고 빠졌으면 `op.create_check_constraint`로 추가해야 합니다.
  - 자동 생성된 파일은 초안일 뿐입니다. 실행하기 전에 반드시 내용을 읽고, 기본값 데이터를 추가해야 하는 경우(예: `positions` 기본 5종)는 `upgrade()` 끝에 `op.bulk_insert`를 직접 추가해야 합니다.
  - 생성만 하고 적용은 되지 않습니다. 적용하려면 `4-2`의 `alembic upgrade head`를 이어서 실행해야 합니다.

### 4-4. DB 내용을 직접 확인하기 (psql)

```
docker compose exec db psql -U banblit -d banblit
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `db` 서비스가 이미 실행 중이어야 합니다)
- **용도**: container 안의 PostgreSQL에 `psql` 클라이언트로 직접 접속해, table 내용을 확인합니다.
- **옵션**
  - `exec` — 이미 실행 중인 container 안에서 명령을 실행합니다. (`run`과 달리 새 container 를 생성하지 않습니다.)
  - `db` — 접속할 대상 서비스 이름입니다.
  - `psql -U banblit -d banblit` — `banblit` 사용자로 `banblit` 데이터베이스에 접속합니다. 사용자·DB 이름은 `.env`(`.env.example` 견본)의 `POSTGRES_USER`·`POSTGRES_DB` 값과 같아야 합니다.
- **주의점**
  - **호스트 포트를 열지 않았으므로, 이 방법 외에는 호스트 PC의 DB 도구로 직접 접속할 수 없습니다.** `db` 서비스가 `docker compose up -d db`나 `docker compose run --rm dev alembic ...` 등으로 이미 기동돼 있어야 하며, 실행 중이 아니면 `service "db" is not running` 오류가 발생합니다.
  - 종료할 때는 `\q`를 입력합니다.

---

### 4-4-1. 로그인 session table 을 확인하기

```
docker compose exec -T db psql -U banblit -d banblit -c "select member_id, left(token_hash,12), revoked_at is not null from sessions order by id desc limit 3;"
```

- **실행 경로**: 저장소 루트 (`Banblit/`, `db` 서비스가 이미 실행 중이어야 합니다)
- **용도**: 방금 생성한 로그인 session 이 실제로 DB에 저장됐는지, 로그아웃이 그 행에 취소 표시를 남겼는지 확인합니다. `3-4`를 실행한 직후에 확인하면 마지막 행의 마지막 칸이 `t`(취소됨)로 변경되어 있습니다.
- **옵션**
  - `exec` — 이미 실행 중인 container 안에서 명령을 실행합니다. (`4-4`와 같습니다.)
  - `-T` — 터미널을 연결하지 않습니다. 생략하면 터미널을 연결하려 하므로, 출력을 다른 명령으로 전달하거나 스크립트 안에서 실행할 때 오류가 발생합니다.
  - `-c "<질의>"` — 대화형으로 진입하지 않고 질의 1개만 실행하고 종료합니다. 생략하면 `4-4`처럼 `psql` 대화형 모드로 진입합니다.
  - `left(token_hash,12)` — session token 의 hash(원문을 복원할 수 없게 변환한 값) 앞 12글자만 출력합니다. **전체를 출력하지 않습니다.** 행을 구분하는 데는 앞 12글자로 충분합니다.
- **주의점**
  - **원문 token 은 이 table 에 없습니다.** 저장된 값은 복원할 수 없는 hash 뿐이라, 이 table 에 보이는 값으로는 로그인할 수 없습니다.
  - 만료된 session 행은 자동으로 삭제되지 않습니다. 누적된 행을 정리하려면 이 질의로 확인하고 직접 삭제합니다.

---

## 5. image 주고받기

### 5-1. image 를 파일 1개로 내보내기

```
docker save banblit-backend:dev -o banblit-backend-dev.tar
```

- **실행 경로**: 파일을 저장할 폴더
- **용도**: 개발 환경 전체를 파일 1개로 묶습니다. 받는 사람은 이 파일만 받으면 인터넷 설치 과정 없이 동일한 환경을 사용할 수 있습니다.
- **옵션**
  - `-o <파일이름>` — 내보낼 파일 이름입니다. 생략하면 터미널에 출력되므로 반드시 지정합니다.
- **주의점**: 파일 크기가 800MB를 넘습니다. 저장소에 커밋하지 않습니다.

### 5-2. 받은 파일을 image 로 복원하기

```
docker load -i banblit-backend-dev.tar
```

- **실행 경로**: 받은 파일이 있는 폴더
- **용도**: 내보낸 파일을 image 로 복원합니다. 복원한 뒤에는 `1-2`의 테스트 실행 명령을 그대로 사용할 수 있습니다.
- **옵션**
  - `-i <파일이름>` — 읽어들일 파일 이름입니다.

---

## 6. 로컬 가상환경 (참고용, 기준 아님)

container 도입 이전에 사용하던 방식입니다. **기준 실행 방법은 `1-2`의 container 실행입니다.**
container 빌드가 실패할 때의 대비책으로만 남겨 둡니다.

```
uv run pytest -q
```

- **실행 경로**: `backend/`
- **용도**: 호스트 PC에 생성한 가상환경에서 테스트를 실행합니다.
- **옵션**
  - `run` — 프로젝트 가상환경 안에서 뒤따르는 명령을 실행합니다. 가상환경이 없거나 패키지가 부족하면 먼저 설치하고 실행합니다.
  - `-q` — 결과를 짧게 출력합니다.
- **주의점**: 호스트 PC의 운영체제와 파이썬 설치 상태에 결과가 좌우됩니다. 다른 PC에서 같은 결과를 보장하지 않습니다.

---

## 7. 커밋 메시지 검사 훅

### 7-1. 훅 켜기

```
git config core.hooksPath .githooks
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 커밋 메시지 형식 검사를 켭니다. 저장소를 새로 받았을 때 **한 번만** 실행합니다.
- **옵션**
  - `core.hooksPath` — git이 훅 스크립트를 찾을 폴더를 지정하는 설정 이름입니다. 기본값은 `.git/hooks`이며, `.git/hooks` 폴더는 저장소에 커밋되지 않아 다른 PC와 공유되지 않습니다. `.githooks`로 변경하면 저장소에 함께 커밋되어 모든 PC 가 같은 검사를 사용합니다.
  - `.githooks` — 지정할 폴더 이름입니다.
- **주의점**: 이 설정은 저장소마다 따로 저장됩니다. 새로 복제한 저장소에서는 다시 실행해야 합니다.

### 7-2. 훅이 잘못된 메시지를 거부하는지 검사

```
bash .githooks/test-commit-msg.sh
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 훅이 통과시켜야 할 메시지와 거부해야 할 메시지를 각각 입력해 결과를 확인합니다. 훅을 수정했다면 반드시 실행합니다.
- **주의점**: 통과 14 / 실패 0이 출력되어야 정상입니다. 실제 커밋을 생성하지 않으므로 히스토리에 영향이 없습니다.

### 7-3. 통과하는 커밋 메시지 형식

```
<scope>: <요약>

<본문은 빈 줄 하나를 띄우고 쓴다>
```

- **허용 scope**: `scheduling` `docs` `infra` `backend` `frontend` `test` `chore`
- **거부되는 경우**: scope가 없거나 목록에 없을 때, 콜론 뒤에 공백이 없을 때, 요약이 비었을 때, 본문 앞에 빈 줄이 없을 때
- **그대로 통과하는 경우**: `Merge`·`Revert`로 시작하는 커밋(git이 자동 생성하는 형식이라 검사하지 않습니다)
- **주의점**: scope를 추가하려면 `.githooks/commit-msg`의 `SCOPES` 목록과 `CLAUDE.md` 7장을 함께 수정합니다.

---

## 8. 원격 저장소

### 8-1. 로컬 커밋을 원격에 올리기

```bash
git push origin develop
```

- **실행 경로**: 저장소 루트 (`C:\Users\joycompany\Desktop\Banblit`)
- **용도**: 로컬 `develop` 브랜치의 커밋을 GitHub(`minkong-dev/Banblit`)의 같은 이름 브랜치로 push 합니다. 성공하면 `이전해시..새해시  develop -> develop` 1행이 출력됩니다.
- **옵션별 의미**:
  - `origin` — push 할 원격 저장소 이름입니다. `git remote -v`로 확인할 수 있습니다.
  - `develop` — push 할 브랜치 이름입니다. 생략하면 현재 브랜치의 추적 대상 브랜치로 push 되지만, 대상이 명령에 드러나도록 매번 적습니다.
- **주의점**:
  - 이 PC의 시스템 자격증명이 github.com에 회사 계정을 전달하기 때문에, 이 저장소 전용 자격증명(minkong-dev)이 따로 설정되어 있습니다. 다른 PC에서 처음 받으면 다시 설정해야 합니다.
  - push 한 커밋은 다른 사람이 이미 받았을 수 있으므로 되돌리기 어렵습니다. 사용자가 push 를 지시했을 때만 실행합니다.

---

## 9. 삭제 금지 훅

### 9-1. 훅이 삭제 명령을 거부하는지 검사

```bash
rm trash/없는파일.txt
```

- **실행 경로**: 저장소 루트
- **용도**: `.claude/hooks/move-to-trash.ps1`이 삭제 명령을 실제로 거부하는지 확인합니다. **이 명령은 거부되어야 정상입니다.** "파일을 지우지 않습니다. 저장소 루트의 trash/ 로 옮기십시오."가 출력되면 훅이 동작하는 상태입니다.
- **옵션별 의미**: 옵션이 없습니다. 삭제 대상 경로 1개만 지정합니다. 실제로 없는 파일을 지정해, 훅이 거부하지 못했을 때도 아무 파일도 삭제되지 않게 합니다.
- **주의점**:
  - 거부 대상은 `rm` `del` `erase` `rmdir` `unlink` `Remove-Item` `ri` `rd` 8가지입니다. 명령 첫머리이거나 `;` `&` `|` 뒤에 올 때만 거부합니다. 파일 이름에 우연히 `rm`이 포함된 경우는 거부하지 않습니다.
  - 훅 설정은 `.claude/settings.json`에 있습니다. 이 파일을 수정하면 새 session 부터 반영됩니다.
  - 파일을 제거해야 할 때는 삭제하지 말고 이동합니다: `mv <파일> trash/<날짜>-<무엇을-치우는지>/`

---

## 10. 화면 앱

### 10-1. 화면 개발 서버 실행하기

```
docker compose up -d api web
docker compose logs web --since 1m
start http://localhost:5173/
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `web` 서비스(Vite 개발 서버)를 실행해 `http://localhost:5173` 에서 React 앱을 엽니다. 주소마다 다른 화면이 표시됩니다. `/` 랜딩, `/login` `/signup` `/find-id` `/find-password` `/reset-password` 계정 화면 5개, `/scheduler` 달력, `/admin` 배정 결과입니다.
- **옵션**
  - `up -d api web` — 화면과 API 를 함께 실행합니다. `web` 만 실행해도 `depends_on` 이 `api` 를 함께 실행하지만, 2개를 적어두면 무엇이 실행되어야 하는지가 명령에 드러납니다. `api` 는 다시 `db` 가 healthy 가 될 때까지 기다립니다.
  - `logs web --since 1m` — **최근 1분치 로그만** 출력합니다. 아래 주의점을 참고합니다.
  - `start <url>` — Windows에서 기본 브라우저로 주소를 엽니다.
- **주의점**
  - **처음 실행하면 container 안에서 `npm install` 이 실행됩니다.** 패키지는 호스트 폴더가 아니라 `banblit-web-modules` 라는 이름 있는 volume 에 저장됩니다(윈도우 폴더에 그대로 두면 파일이 많아 눈에 띄게 느려집니다). 설치가 끝나기 전에는 5173 이 응답하지 않습니다. `VITE ... ready in` 이 로그에 출력된 뒤에 엽니다.
  - **`docker compose logs web` 은 이전 기동의 로그까지 함께 출력합니다.** container 를 삭제하지 않고 `stop`/`start` 만 하면 로그가 누적된 채로 남습니다. `--since` 없이 확인하면 지난번 `ready` 를 이번 기동의 `ready` 로 잘못 읽습니다. 이번 기동 이후만 확인하려면 `--since 1m` 또는 `docker inspect banblit-web-1 --format '{{.State.StartedAt}}'` 로 얻은 시각을 `--since` 에 지정합니다.
  - **코드를 수정했는데 화면이 변경되지 않으면 개발 서버가 이전 코드를 제공하고 있는 상태입니다.** 윈도우 폴더를 container 에 연결하면 파일 변경 알림이 container 안까지 전달되지 않습니다. `frontend/vite.config.ts` 의 `server.watch.usePolling` 이 이 문제 때문에 활성화되어 있습니다. 그래도 반영되지 않으면 `docker compose restart web` 으로 다시 실행합니다. 이 증상을 코드 문제로 오진한 적이 2번 있습니다.
  - **화면은 5173, API 는 8000 에서 실행됩니다.** 브라우저는 화면을 받아온 origin(주소·포트 조합)과 다른 origin 으로의 요청을 차단하므로, 개발 서버가 정해진 경로만 API 로 대신 전달합니다. 전달하는 경로 목록은 `frontend/vite.config.ts` 의 `API_PATHS` 에 있습니다. API endpoint(API의 요청 주소 단위)를 추가하면 이 목록에도 함께 추가해야 합니다.
  - 달력에 데이터가 표시되려면 `4-2` 마이그레이션이 적용되어 있고 팀·기간·배정이 실제로 등록돼 있어야 합니다. 등록된 배정이 없으면 화면은 정상적으로 표시되고 "저장된 배정이 없습니다" 를 표시합니다.
  - 5173 번 포트를 다른 프로그램이 사용하고 있으면 실패합니다. 이 저장소와 무관한 container 가 5173 번 포트를 사용하고 있다면 임의로 정지하지 않습니다.

### 10-1-1. 화면이 실제로 응답하는지 확인하기

```
curl -s -o /dev/null -w "%{http_code}
" http://localhost:5173/scheduler
curl -s http://localhost:5173/periods/1/schedule
```

- **실행 경로**: 어디서든 무관 (단, `10-1` 로 `web` 이 실행 중이어야 합니다)
- **용도**: 브라우저를 열지 않고 2가지를 확인합니다. 1행은 주소를 직접 입력했을 때 화면이 응답하는지(`200`), 2행은 개발 서버가 API 로 요청을 전달하는지(시간표 JSON 이 반환되는지)를 확인합니다.
- **옵션**
  - `-s` — 진행률 표시를 끕니다. `-o /dev/null` 은 본문을 버리고 `-w "%{http_code}"` 로 상태 코드만 출력합니다.
- **주의점**
  - `000` 이 출력되면 서버가 아직 응답하지 않는 상태입니다. 대개 `npm install` 이 아직 실행 중입니다. `10-1` 의 로그 확인으로 돌아갑니다.
  - 이 확인은 화면이 **응답하는지**만 확인합니다. 화면이 설계대로 표시되는지는 브라우저로 직접 열어 확인해야 합니다.

### 10-2. 화면 테스트 실행하기

```
docker compose run --rm --no-deps web npm test
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 화면 쪽 검사를 실행합니다. 지금 검사하는 범위는 순수 계산과 입력 검증 5가지입니다. 서버 호출 wrapper(호출을 감싸 공통 처리를 추가하는 함수), 달력 칸 계산, slot(1시간 단위 시간 칸) 조각을 합주로 연결하는 계산, 계정 서식 입력 검사, 삭제 확인 문구의 조사 결정입니다. 통과하면 `Tests 229 passed` 가 출력됩니다. 화면을 실제로 렌더링하는 검사는 아직 없습니다.
- **옵션**
  - `run` — 일회용 container 를 생성해 명령 1개만 실행하고 종료합니다. 개발 서버를 실행한 채로도 따로 실행할 수 있습니다.
  - `--rm` — 종료되면 해당 container 를 삭제합니다. 생략하면 실행할 때마다 정지한 container 가 누적됩니다.
  - `--no-deps` — `depends_on` 에 지정된 `api`(그리고 `db`)를 함께 실행하지 않습니다. 화면 검사는 서버가 필요 없습니다. 생략하면 DB 까지 실행되어 느려집니다.
  - `npm test` — `frontend/package.json` 의 `test` 를 실행합니다. 내용은 `vitest run` 입니다. `run` 이 지정돼 있어 1번 실행하고 종료하며, 파일 변경을 감시하는 상태로 유지되지 않습니다.
- **주의점**
  - 패키지는 `10-1` 이 설치한 `banblit-web-modules` volume 을 그대로 사용합니다. 그래서 이 명령은 설치 없이 곧바로 실행됩니다.
  - 검사 파일은 `frontend/src/**/*.test.ts` 만 수집합니다. 범위는 `frontend/vite.config.ts` 의 `test.include` 가 정합니다.

### 10-2-1. 화면 테스트 파일 1개만 실행하기

```
docker compose run --rm --no-deps web npx vitest run src/lib/validate.test.ts src/lib/roster.test.ts
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 지금 수정하는 파일의 검사만 선택해 실행합니다. 실패하는 검사를 먼저 작성하고 실패를 확인할 때, 전체를 실행하지 않아도 됩니다.
- **옵션**
  - `run --rm --no-deps web` — `10-2` 와 같습니다.
  - `npx vitest run <파일...>` — `npm test` 대신 vitest 를 직접 실행합니다. `run` 은 1번 실행하고 종료하는 옵션이고, 뒤에 적은 경로는 `frontend/` 기준입니다. 경로 2개 이상을 띄어 적으면 적은 파일만 실행합니다. 경로는 부분 일치라 `validate` 만 적어도 `validate.test.ts` 가 수집됩니다.
- **주의점**
  - 수정한 코드가 다른 파일의 검사를 실패시킬 수 있으니, 구현이 끝나면 `10-2` 로 전체를 1번 실행합니다.

### 10-3. 화면 타입 검사 실행하기

```
docker compose run --rm --no-deps web npm run typecheck
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 화면 코드의 타입을 검사합니다. 아무것도 출력하지 않고 끝나면 통과입니다.
- **옵션**
  - `npm run typecheck` — `frontend/package.json` 의 `typecheck` 를 실행합니다. 내용은 `tsc -b --noEmit` 입니다. `-b` 는 `frontend/tsconfig.json` 이 가리키는 설정들을 순서대로 검사하고, `--noEmit` 은 결과 파일을 생성하지 않습니다.
  - `--rm --no-deps` — `10-2` 와 같은 이유입니다.
- **주의점**
  - `-b` 는 지난 검사 결과를 `frontend/tsconfig.tsbuildinfo` 에 저장해 두 번째 실행부터 빨라집니다. 이 파일은 저장소에 커밋되어 있습니다.

### 10-4. 화면 빌드하기

```
docker compose run --rm --no-deps web npm run build
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 배포용 화면 bundle(브라우저에 전달할 파일로 묶은 결과물)을 생성합니다. 결과는 `frontend/dist/` 에 저장됩니다.
- **옵션**
  - `npm run build` — `frontend/package.json` 의 `build` 를 실행합니다. 내용은 `tsc -b && vite build` 입니다. 타입 검사를 먼저 통과해야 bundle 생성으로 진행합니다.
  - `--rm --no-deps` — `10-2` 와 같은 이유입니다.
- **주의점**
  - **`frontend/dist/` 는 저장소에 커밋되어 있습니다.** 이 명령을 실행하면 `frontend/dist/` 안이 덮어써지므로, 커밋 전에 `git status` 로 무엇이 변경됐는지 확인합니다.
  - 이 bundle 을 실제로 제공하는 서버는 아직 없습니다. 개발 서버는 배포에 포함되지 않으므로, 배포에서는 정적 파일을 제공하는 다른 서버가 bundle 제공을 담당해야 합니다. 아직 정하지 않았습니다.

### 10-5. 화면 패키지 추가하기

```
docker compose run --rm --no-deps web npm install @radix-ui/colors
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 화면 코드가 쓸 npm 패키지를 추가합니다. `frontend/package.json` 의 `dependencies` 와 `frontend/package-lock.json` 이 함께 바뀌고, 패키지 파일은 `banblit-web-modules` volume 에 설치됩니다. 2026-09-15 에 팀 색 값(`@radix-ui/colors`)을 이 명령으로 추가했습니다.
- **옵션**
  - `run --rm` — 일회용 container 를 실행하고 끝나면 삭제합니다.
  - `--no-deps` — `api`·`db` 를 함께 실행하지 않습니다. 설치에는 서버가 필요 없습니다.
  - `web` — `docker-compose.override.yml` 의 `web` 서비스(`node:24-alpine`)입니다. 호스트에 Node 가 없어도 실행됩니다.
  - `npm install <패키지>` — 패키지를 설치하고 `package.json` 의 `dependencies` 에 추가합니다. 버전을 적지 않으면 최신 버전을 `^` 범위로 기록합니다. 테스트·빌드에만 쓰는 패키지면 `-D` 를 붙여 `devDependencies` 에 넣습니다.
- **주의점**
  - **새 의존성은 사용자 승인을 받은 뒤에만 추가합니다.** `CLAUDE.md` 의 파일 생성 방식(모드 1 의 5단계)이 정한 규칙입니다.
  - 출력에 `npm warn install-scripts ... esbuild@... (postinstall: node install.js)` 가 나올 수 있습니다. 설치 스크립트 승인 경고이며, 이 경고가 나와도 패키지 설치와 `package.json` 기록은 끝난 상태입니다.

---

## 11. 배포

`docker-compose.yml` 이 **배포용 정본**입니다. 개발에서는 `docker-compose.override.yml` 이
자동으로 적용되어 `docker-compose.yml` 의 설정을 덮어씁니다. 그래서 배포에서는 `-f docker-compose.yml` 로 override 를
제외하고 실행하고, 개발에서는 아무 옵션도 지정하지 않습니다.

배포에만 있는 서비스가 2개입니다. 앞단 `caddy` 와 정기 백업 `backup` 입니다. 개발 override 가
이 2개에 profile 을 지정해 두어 개발에서는 실행되지 않습니다.

| 서비스 | 배포 (`-f docker-compose.yml`) | 개발 (그냥 `docker compose`) |
|---|---|---|
| caddy | 실행. 443 을 받는 유일한 문 | 실행하지 않음 |
| web | 실행. 127.0.0.1 로만 열림 | 실행. vite, 5173 |
| api | 실행 | 실행 |
| db | 실행 | 실행 |
| auto-assign | 실행 | 실행(꺼짐) |
| backup | 실행 | 실행하지 않음 |

### 11-1. 서버에 처음 배포하기

```
git clone https://github.com/minkong-dev/Banblit.git
cd Banblit
cp .env.example .env
nano .env
docker compose -f docker-compose.yml up -d --build
docker compose -f docker-compose.yml run --rm api alembic upgrade head
```

- **실행 경로**: 서버의 저장소 루트
- **용도**: 클론한 저장소를 실제로 서비스하는 상태까지 실행합니다.
- **`.env` 에서 반드시 입력할 값**
  - `POSTGRES_PASSWORD` — 견본의 개발용 값을 그대로 두지 않습니다.
  - `BANBLIT_DOMAIN` — 이 이름으로 인증서를 받습니다. 이 이름이 **이미 이 서버를 가리키고
    있어야** 발급이 됩니다. 먼저 DNS 레코드를 등록하고 전파를 확인한 뒤에 실행합니다.
  - `BACKUP_DIR` — 백업을 저장할 host 폴더입니다. 데이터베이스 volume 과 **다른 디스크**에 두는
    것이 좋습니다. 같은 디스크에 두면 그 디스크가 고장날 때 백업도 함께 손실됩니다.
  - `SMTP_*` — 비우면 비밀번호 재설정 메일이 발송되지 않습니다. 비밀번호를 잊은 사용자가
    스스로 재설정할 방법이 없어집니다.
  - `APP_ORIGIN` — 메일에 포함할 링크의 접두사입니다. 비우면 `http://localhost:5173` 이 포함되어
    받는 사람이 열 수 없는 링크가 됩니다.
- **옵션**
  - `-f docker-compose.yml` — 개발용 override 를 제외하고 배포용만 사용합니다. **생략하면 개발
    설정이 적용되어 cookie 의 Secure 가 비활성화되고 caddy·backup 이 실행되지 않습니다.**
  - `--build` — 서버에서 image 를 직접 생성합니다. 처음에는 화면 bundle 생성까지 실행되어 몇 분 걸립니다.
  - `run --rm api alembic upgrade head` — table 을 생성하고 최신으로 맞춥니다. 개발의 `banblit up`
    이 자동으로 실행하던 마이그레이션을 배포에서는 직접 실행합니다. 데이터가 있는 DB 에서 자동으로 실행되는
    마이그레이션은 되돌릴 기회가 없습니다.
- **주의점**
  - **80·443 이 열려 있어야 합니다.** Oracle Cloud 는 기본으로 차단되어 있어 보안 목록(Security
    List)과 인스턴스 안 방화벽(`iptables`) 양쪽을 모두 열어야 합니다.
  - **Cloudflare 를 사용한다면** `BANBLIT_DOMAIN` 의 레코드만 프록시를 비활성화하거나(DNS only), 프록시를 유지할 것이면 SSL 모드를
    Full (strict) 로 설정합니다. Flexible 로 설정하면 Cloudflare 가 서버에 http 로 접속해, 서버는
    http 로 서비스 중이라고 판단하고 로그인 cookie 를 설정하지 않습니다.
  - **첫 계정이 권한을 전부 받습니다**(`auth_service.py` 의 `_is_first_account`). 실행한
    직후에 관리자가 먼저 가입하십시오. 주소 공지는 관리자 가입 다음입니다.

### 11-2. 배포한 서버를 새 버전으로 갱신하기

```
./banblit.sh update
```

- **실행 경로**: 서버의 저장소 루트
- **용도**: 코드를 가져오고 서비스를 새 버전으로 교체합니다. `git pull` 을 실행한 뒤
  `up` 과 같은 순서로 진행합니다 — `.env` 필수값 확인, image 생성, `db` 기동,
  **마이그레이션 직전 백업**, `alembic upgrade head`, 나머지 서비스 기동, 응답 대기.
- **주의점**
  - **마이그레이션이 서비스 교체보다 먼저입니다.** 새 코드가 먼저 실행되면 아직 없는 열을 읽어
    500 이 발생합니다(개발에서 실제로 발생했습니다. 오류는 `column members.department does not exist`
    였습니다). 스크립트가 이 순서를 고정합니다.
  - **백업이 마이그레이션 앞에 있습니다.** `backup` 서비스만 믿으면
    되돌릴 지점이 최대 6시간 어긋납니다. `BACKUP_DIR` 에 `pre-migrate-<시각>.sql.gz` 로 남고,
    백업에 실패하면 마이그레이션을 실행하지 않고 멈춥니다.
  - 마이그레이션만 따로 실행할 때(`./banblit.sh migrate`)도 같은 백업이 먼저 실행됩니다.
  - 되돌려야 하면 마이그레이션도 함께 되돌려야 합니다(`4-2-1`). `pre-migrate-*.sql.gz` 가
    되돌리기 직전 상태입니다.
  - 리눅스에서는 `--deploy` 를 적지 않아도 배포용으로 돕니다. 윈도우에서 배포용을 돌리려면
    `--deploy` 를 붙여야 합니다.
  - **아직 서버에서 실행해 확인하지 않았습니다.** 처음 실행할 때 각 단계가 기대대로 도는지
    확인하고, 차이가 있으면 이 절을 수정하십시오.

### 11-3. 앞단이 인증서를 받았는지 확인하기

```
docker compose -f docker-compose.yml logs caddy --since 5m
curl -sI https://in-six-strings.banblit.com | head -3
```

- **실행 경로**: 서버의 저장소 루트
- **용도**: 인증서가 발급됐는지, https 로 실제 응답이 반환되는지 확인합니다.
- **주의점**
  - `obtained certificate` 가 로그에 출력되면 성공입니다. 실패하면 대개 DNS 가 아직 이 서버를
    가리키지 않거나 80 번 포트가 차단된 상태입니다. 발급 기관이 80 번 포트로 소유를 확인합니다.
  - **실패를 반복하지 마십시오.** 같은 이름으로 짧은 시간에 반복해서 발급을 요청하면 발급 기관이
    한동안 거절합니다. 원인을 수정한 뒤에 다시 실행합니다.

### 11-4. 백업 확인하고 지금 백업 1벌 생성하기

```
ls -lh /srv/banblit/backups
docker compose -f docker-compose.yml logs backup --since 12h
docker compose -f docker-compose.yml exec -T db pg_dump --clean --if-exists -U banblit -d banblit | gzip > manual-$(date -u +%Y%m%dT%H%M%SZ).sql.gz
```

- **실행 경로**: 서버의 저장소 루트
- **용도**: 정기 백업이 실제로 누적되고 있는지 확인하고, 구조를 변경하기 직전처럼 필요할 때 직접
  백업 1벌을 생성합니다.
- **주의점**
  - `backup` 서비스는 기본 6시간마다 실행되고 14일치를 보관합니다(`BACKUP_INTERVAL_HOURS`,
    `BACKUP_KEEP_DAYS`). 데이터베이스와 게시판 첨부파일을 각각 백업합니다.
  - **생성하는 것만으로는 백업이 아닙니다.** 복원해 본 적 없는 백업은 백업이 아닙니다.
    `11-5` 를 1번은 실행해 보십시오.
  - 생성한 백업 파일은 서버 안에 있습니다. 서버 전체를 잃는 경우까지 대비하려면 다른 위치로 내려받는
    절차가 따로 있어야 합니다. 지금은 없습니다.

### 11-5. 백업으로 복원하기

```
gunzip -c /srv/banblit/backups/db-20260909T000000Z.sql.gz | docker compose -f docker-compose.yml exec -T db psql -U banblit -d banblit
docker run --rm -v banblit-attachments:/dst -v /srv/banblit/backups:/src alpine sh -c "tar -xzf /src/files-20260909T000000Z.tar.gz -C /dst"
```

- **실행 경로**: 서버의 저장소 루트
- **용도**: 백업 파일로 데이터베이스와 첨부파일을 복원합니다.
- **주의점**
  - **덮어씁니다.** 백업 파일이 `--clean --if-exists` 로 생성되어 있어 현재 table 을
    삭제하고 다시 생성합니다. 복원하기 전에 현재 상태를 1벌 백업해 두십시오.
  - 복원하는 동안 `api` 를 정지해 두는 편이 안전합니다. table 이 삭제됐다 생성되는 사이에 들어온
    요청이 어떤 값을 읽을지 정해져 있지 않습니다.
  - 첨부파일 복원은 volume 에 직접 압축을 풉니다. 현재 저장된 같은 이름 파일을 덮어씁니다.

---

## 12. E2E 테스트

### 12-1. E2E 테스트 실행하기

```
docker compose --profile e2e up -d --force-recreate --wait e2e-api
docker compose --profile e2e run --rm e2e
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `frontend/e2e/` 의 Playwright 검사 17개를 전부 실행합니다. 로그인·가입, 배정 다시
  계산과 조율안, 팀 게시판 권한·첨부, 공지 글·댓글, 달력·알림, 합주실 수정, 팀 명단을 브라우저로
  재현해 화면·서버·DB 가 연결되어 동작하는지 확인합니다. dev DB 는 건드리지 않습니다.
- **옵션**
  - `--profile e2e` — `docker-compose.override.yml` 에서 `profiles: ["e2e"]` 가 붙은 `e2e-api`·`e2e`
    서비스를 켭니다. 생략하면 두 서비스를 찾지 못합니다. 그래서 `docker compose up` 에는 뜨지 않습니다.
  - 첫 줄 `up -d --force-recreate --wait e2e-api`
    - `up -d` — 서비스를 백그라운드로 실행합니다.
    - `--force-recreate` — 이미 떠 있어도 container 를 새로 만듭니다. `e2e-api` 는 뜰 때마다
      `backend/scripts/reset_e2e_db.py` 로 `banblit_e2e` DB 를 비우고 `alembic upgrade head` 를
      적용하므로 이 옵션이 곧 DB 초기화입니다. 생략하면 떠 있는 container 를 그대로 두어 이전 실행의 데이터가 남습니다.
    - `--wait` — healthcheck(`/health` 가 200)가 통과할 때까지 기다린 뒤 끝납니다. 생략하면 서버가 뜨기 전에 둘째 줄이 시작될 수 있습니다.
  - 둘째 줄 `run --rm e2e` — 일회성 container 로 `npm install && npx playwright test` 를 실행하고
    끝나면 삭제합니다. 공식 image `mcr.microsoft.com/playwright:v1.62.1-noble` 를 사용해 브라우저를
    따로 내려받지 않습니다. `depends_on` 이 `e2e-api` 의 healthy 를 기다립니다.
- **동작 순서**
  1. `e2e-api`(dev image)가 `banblit_e2e` DB 를 비우고 migration 을 적용한 뒤 서버를 띄웁니다.
     DB 이름이 `_e2e` 로 끝나지 않으면 비우지 않고 멈춥니다.
  2. `e2e` 안에서 Playwright 가 Vite 개발 서버(`npm run dev`)를 띄웁니다(`frontend/playwright.config.ts`
     의 `webServer`). `/api` 요청은 `API_ORIGIN=http://e2e-api:8000` 으로 넘어갑니다. `web` 서비스는 쓰지 않습니다.
  3. `frontend/e2e/global-setup.ts` 가 계정 2개·합주실·팀 2개·집중 합주기간 2개(오늘은 배정 저장,
     내일은 조율안이 나오도록 불가능 시간 등록)를 만들고, 첫 가입자라 전체 권한을 받은 E2E 계정의
     로그인 cookie 를 `frontend/playwright/.auth/e2e-account.json` 에 저장합니다. 모든 검사가 이 로그인 상태로 시작합니다.
- **주의점**
  - **실행할 때마다 첫 줄부터 실행합니다.** 둘째 줄만 다시 실행하면 global-setup 이
    `POST /api/signup 가 422 로 실패했습니다: {"detail":"이미 가입된 이메일입니다"}` 로 멈춥니다(2026-09-15 확인).
    전체 권한은 첫 가입자만 받으므로 DB 가 비어 있어야 합니다.
  - 가입 rate limit 이 발신 IP 마다 1시간에 5번입니다. 한 번 실행에 global-setup 이 2번, `account.spec.ts`
    가 2번 씁니다. 서버 메모리에서 세므로 첫 줄로 `e2e-api` 를 다시 만들면 초기화됩니다.
  - **image 가 큽니다(브라우저 3종 포함, 처음 내려받으면 1GB 가 넘습니다).** 처음 1번만
    느리고, 두 번째부터는 로컬 image 캐시를 그대로 사용합니다.
  - **`@playwright/test` 버전과 image tag 버전이 다르면 안 됩니다.** image 안의
    브라우저가 tag 버전에 맞춰 미리 설치되어 있기 때문입니다. `frontend/package.json` 의
    devDependency 버전을 올릴 때는 `docker-compose.override.yml` 의 `e2e.image` tag 도
    같은 숫자로 함께 수정합니다.
  - 패키지는 `web` 과 따로 `banblit-e2e-modules` 라는 이름 있는 volume 에 저장합니다.
    image 의 기반 OS(Ubuntu)가 `web`(Alpine)과 달라, 네이티브 바이너리가 섞이는 문제를
    막으려고 분리했습니다.
  - 계산 시간이 필요한 검사(`frontend/e2e/assignment.spec.ts`)는 배정 다시 계산이
    끝날 때까지 기다립니다. 2026-09-04 실측으로 1초 안팎이라 20초면 충분하지만,
    container 부하가 크면 늘어날 수 있습니다.
  - 검사가 올린 첨부파일은 `e2e-api` container 안 `/tmp/banblit-e2e-attachments` 에 저장되어
    container 를 다시 만들면 사라집니다.

### 12-2. 특정 테스트 파일만 실행하기

```
docker compose --profile e2e up -d --force-recreate --wait e2e-api
docker compose --profile e2e run --rm e2e npx playwright test e2e/assignment.spec.ts
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 파일 1개만 선택해 실행합니다. `12-1` 은 매번 전체를 실행해 느릴 때 이 명령을 사용합니다.
- **옵션**
  - 첫 줄은 `12-1` 과 같습니다. 파일 1개만 실행할 때도 global-setup 이 먼저 돌므로 매번 필요합니다.
  - `npx playwright test <경로>` — `e2e` 서비스의 기본 명령(`npm install && npx playwright test`)
    대신 뒤에 적은 명령을 그대로 실행합니다. 경로는 `frontend/` 기준 상대경로입니다.
    `npm install` 을 건너뛰므로 `banblit-e2e-modules` volume 에 패키지가 이미 있어야 합니다(12-1 을 한 번 실행한 뒤).

### 12-3. 화면 쪽에서 E2E 테스트만 따로 린트·타입 검사하기

```
docker compose run --rm --no-deps web npm run lint:e2e
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `frontend/e2e/` 만 타입 인식 린트로 검사합니다.
- **주의점**
  - **`frontend/eslint.config.js` 는 이 저장소의 `config-protection` 훅이 에이전트의
    수정을 거부합니다.** 그래서 `e2e/` 전용 설정을 `frontend/e2e/lint.config.js` 에
    따로 두고, `npm run lint`(기본 `eslint .`)에서는 `--ignore-pattern "e2e/**/*"`
    로 `e2e/` 폴더를 제외하는 대신 이 명령으로 따로 검사합니다. 설정 파일 2개가 분리된 이유는
    선호가 아니라 이 제약 때문입니다. 1개 파일로 합치려면 사람이 직접
    `frontend/eslint.config.js` 에 `files: ["e2e/**/*.ts"]` 블록을 추가해야 합니다.
    이 제외 패턴 값은 **겹따옴표라야 합니다.** 홑따옴표로 적으면 Windows 에서 따옴표가
    그대로 남아 아무 폴더도 제외되지 않고, `e2e/` 가 타입 정보 없이 린트되어 명령이
    통째로 실패합니다(`await-thenable` 규칙이 타입 정보를 요구합니다). container 안
    리눅스에서는 홑따옴표도 동작하므로 이 실패는 호스트에서만 발생합니다.
  - `npm run typecheck`(`tsc -b --noEmit`)은 `frontend/tsconfig.json` 의 `include`
    에 `e2e` 가 이미 추가되어 있어 따로 명령을 생성하지 않아도 `e2e/` 까지 함께 검사합니다.

---

## 13. 자동 배정 서비스

기간에 저장된 연산 시각(`periods.first_run_at`·`second_run_at`)이 지나면 사람이 버튼을
누르지 않아도 배정을 실행하는 서비스입니다. `api` 와 같은 image 를 사용하되 HTTP endpoint 를 거치지
않고 `backend/src/backend/jobs/auto_assign.py` 의 `assign_period` 를 직접 호출합니다.

### 13-1. 자동 배정 서비스 실행하기

```
$env:AUTO_ASSIGN_ENABLED = "true"; docker compose up -d auto-assign
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `docker-compose.yml` 의 `auto-assign` 서비스를 백그라운드로 실행합니다. `AUTO_ASSIGN_INTERVAL_SECONDS`
  간격마다 실행되어, 오늘이 기간 안에 포함되는 집중 합주기간 중 연산 시각이 지났는데 아직
  실행되지 않은 기간을 찾아 계산하고 `assignment_runs` table 에 실행한 시각을 기록합니다.
- **옵션**
  - `$env:AUTO_ASSIGN_ENABLED = "true"` — 활성화 여부를 정하는 환경변수입니다(PowerShell 문법). 개발용
    설정(`docker-compose.override.yml`)이 이 값을 기본 `false` 로 두므로, 개발 PC 에서
    동작을 확인하려면 이렇게 `true` 로 지정해 실행합니다. Git Bash 라면
    `AUTO_ASSIGN_ENABLED=true docker compose up -d auto-assign` 처럼 명령 앞에 지정합니다.
    비활성화할 때는 `"false"`(또는 `0`·`no`)를 지정합니다. container 가 로그 1줄을 남기고 정상 종료합니다.
    배포용(`docker-compose.yml`)의 기본값은 `true` 입니다.
  - `AUTO_ASSIGN_INTERVAL_SECONDS` — 확인 간격(초)입니다. 배포 기본값 60, 개발 기본값 10 입니다.
    숫자가 아니거나 0 이하면 코드가 기본값 60 을 사용합니다. 생략할 수 있습니다.
  - `-d` — 백그라운드로 실행합니다. 생략하면 터미널이 이 서비스의 로그로 점유됩니다.
- **주의점**
  - **호스트 포트를 열지 않습니다.** 이 서비스는 요청을 받는 endpoint 가 없고 `db` 로만 접속합니다.
  - **자동 실행은 등록된 팀 전부와 합주실 전부를 대상으로 실행됩니다.** 사람이 버튼을 누를
    때와 달리 대상을 선택하는 화면이 없기 때문입니다. 그래서 오늘이 기간 안에 포함되는 집중 합주기간이
    2개 이상이면 서로 같은 합주실·같은 시각을 배정하려다 1개는 실패로 기록됩니다.
  - **`docker compose up` 을 서비스 이름 없이 실행하면 `auto-assign` 까지 함께 실행됩니다.** 개발
    기본값이 `false` 인 이유는 그때 검사용 데이터를 변경하지 않게 하기 위해서입니다.
  - `backend/pyproject.toml` 또는 `backend/uv.lock` 이 변경된 뒤라면 `docker compose build dev`
    로 image 를 먼저 다시 생성합니다. 개발용 `auto-assign` 은 `dev` image 를 그대로 사용합니다.

### 13-2. 자동 배정 로그 보기

```
docker compose logs auto-assign --tail 30
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 무엇을 실행했는지, 어느 기간이 실패했는지 확인합니다. 성공하면
  `자동 배정: AutoRun(period_id=..., run_on=..., slots=('first',), saved=True, error=None)`
  1줄이, 실패하면 `자동 배정이 실패했습니다 (period=...)` 와 traceback(오류 발생 위치 추적 정보)이 기록됩니다.
- **옵션**
  - `--tail 30` — 마지막 30줄만 출력합니다. 생략하면 기동 이후 전체를 출력합니다.

### 13-3. 어느 시각이 실행됐는지 table 로 확인하기

```
docker compose exec db psql -U banblit -d banblit -c "select * from assignment_runs;"
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: `assignment_runs` 는 "이 기간의, 이 날짜의, 이 시각(`first`/`second`)은
  실행됐다" 를 기록하는 table 입니다. 서비스는 이 table 에 없는 시각만 실행하므로, 같은 시각이 2번
  실행되지 않는 근거가 이 table 에 있습니다. `ran_at` 은 계산이 **끝난** 시각입니다.
- **옵션**
  - `-c "<질의>"` — `4-4` 와 동일합니다. 질의 1개만 실행하고 종료합니다.
- **주의점**
  - `(period_id, run_on, slot)` 에 unique 제약이 지정되어 있어 같은 시각이 2행으로 기록되지 않습니다.
  - 기간을 삭제하면 이 table 의 행도 함께 삭제됩니다(`ondelete='CASCADE'`).

### 13-4. 서비스 정지하고 삭제하기

```
docker compose rm -sf auto-assign
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: 자동 배정 서비스를 정지하고 container 까지 삭제합니다. `db` 는 그대로 둡니다.
- **옵션**
  - `-s` — 삭제하기 전에 먼저 정지합니다. 생략하면 실행 중인 container 는 삭제되지 않습니다.
  - `-f` — 삭제 확인 질문을 생략합니다. 생략하면 대답을 기다리며 중단됩니다.
- **주의점**
  - 정지만 할 경우 `docker compose stop auto-assign` 을 사용합니다. 다음에 `up -d` 하면
    같은 container 를 다시 사용합니다. 그때는 실행할 때 지정한 환경변수가 그대로 유지됩니다.

---

## 14. 관리 스크립트

`banblit.sh` 1개가 아래 13개 절의 명령을 순서대로 묶어 실행합니다. 개별 `docker compose`
명령의 뜻과 주의점은 이 문서의 해당 절이 정본이고, 이 장은 묶음이 무엇을 어떤 순서로
호출하는지를 적습니다.

윈도우와 리눅스 서버가 같은 파일을 사용합니다. `banblit.ps1` 은 PowerShell 에서 `banblit up` 을
그대로 입력하기 위한 wrapper 스크립트(다른 스크립트를 호출만 하는 스크립트)이고, Git Bash 로 `banblit.sh` 를 호출하기만 합니다. PowerShell 식
switch(`-Auto` 등)는 wrapper 스크립트가 `--auto` 로 변환해 전달하므로 기존 방식대로 입력하면 됩니다.

실행 모드가 2가지입니다. 어느 모드인지는 실행 중인 OS 로 정하고, `--dev`·`--deploy` 로
직접 선택할 수 있습니다. 선택한 모드를 매번 출력 첫 줄에 표시합니다.

| 모드 | 언제 | 무엇이 실행되는가 |
|---|---|---|
| `dev` | 윈도우(기본) | 개발용 override 가 적용되어 Vite 개발 서버와 api 가 실행됩니다. 앞단·백업은 실행되지 않습니다 |
| `deploy` | 윈도우 이외의 OS(기본) | base 1개만 적용됩니다. nginx·앞단(caddy)·정기 백업이 함께 실행되고 https 로 요청을 받습니다 |

> `deploy` 는 아직 실제 서버에서 실행해 본 적이 없습니다. 서버를 받으면 이 장에 실측값을 적습니다.

서버에서는 갓 클론한 상태에서 `./` 가 필요합니다. 리눅스는 현재 폴더를 명령 검색 경로에
포함하지 않기 때문입니다. `./banblit.sh up` 이 성공하면 `~/.bashrc` 에 `banblit` function 을
추가하므로, 성공 이후로는 윈도우와 똑같이 어느 경로에서나 `banblit up` 으로 사용합니다.
표시 2줄 사이에만 기록하므로 반복 실행해도 누적되지 않고, 저장소를 이동하면 경로가 갱신됩니다.

### 14-1. 명령을 어느 경로에서나 사용하도록 등록하기

```
.\setup.ps1
```

- **실행 경로**: 저장소 루트 (`Banblit/`)
- **용도**: PowerShell profile 에 `banblit` function 을 추가합니다. 등록하면 다른 폴더에서도
  `banblit up` 으로 사용할 수 있습니다. 등록하지 않아도 저장소 루트에서 `.\banblit.ps1 up` 으로 사용할 수 있습니다.
- **옵션**
  - `-Remove` — 등록한 function 을 profile 에서 삭제합니다. 생략하면 등록합니다.
- **주의점**
  - alias 가 아니라 function 으로 추가합니다. alias 는 뒤따르는 인자를 전달하지 못하는 경우가 있습니다.
  - `# >>> banblit >>>` 와 `# <<< banblit <<<` 사이에만 기록하므로 반복 실행해도 누적되지 않습니다.
  - 대상 profile 은 `$PROFILE.CurrentUserAllHosts` 입니다. 지금 열려 있는 창에도 바로 반영합니다.

### 14-2. 개발 환경을 명령 1개로 실행하기

```
banblit up
```

- **실행 경로**: 어디서나 (등록하지 않았으면 저장소 루트에서 `.\banblit.ps1 up`)
- **용도**: 아래를 순서대로 실행합니다.
  1. `banblit-backend:dev` image 가 `backend/pyproject.toml`·`uv.lock`·`Dockerfile` 보다
     오래되었으면 `1-1`(`docker compose build dev`)을 먼저 실행합니다.
  2. `4-2`(`alembic upgrade head`)로 마이그레이션을 맞춥니다.
  3. `3-1`·`10-1`로 `api` 와 `web` 을 실행합니다.
  4. `/health` 와 5173 에 실제로 요청해 응답할 때까지 기다립니다.
  5. 가입된 계정 수를 세어 출력합니다.
  6. 브라우저로 화면을 엽니다.
- **옵션**
  - `-Auto` — `13-1`의 자동 배정 서비스까지 함께 실행합니다. 생략하면 실행하지 않습니다.
    개발용 override 가 기본값을 `false` 로 두기 때문에 이 switch 로만 활성화됩니다.
  - `-Build` — image 의 생성 시각과 무관하게 무조건 다시 생성합니다. 생략하면 생성 시각을 비교해 판단합니다.
  - `-NoBrowser` — 브라우저를 열지 않습니다. 생략하면 엽니다.
- **주의점**
  - container 가 `Up` 이어도 uvicorn 이 import 단계에서 종료되어 있을 수 있으므로, `docker compose ps`
    가 아니라 실제 응답으로 확인합니다. API 는 120초, 화면은 420초까지 기다립니다.
  - 화면은 처음 실행할 때 container 안에서 `npm install` 이 실행되어 몇 분 걸립니다.
  - 의존성을 추가하고 image 를 다시 생성하지 않으면 API 가 import 단계에서 종료됩니다.
    1번 단계가 이 문제를 막습니다.

### 14-3. 검사 실행하기

```
banblit check
```

- **실행 경로**: 어디서나
- **용도**: `1-2`(`pytest -q`)와 `1-2-3`(`mypy`)을 차례로 실행합니다. 터미널에는 통과 여부와
  실패한 항목만 출력하고, **전체 출력은 `.logs/pytest-<시각>.log`·`.logs/mypy-<시각>.log` 에 저장합니다.**
- **옵션**: 없습니다.
- **주의점**
  - 터미널 출력을 줄이는 것이 목적입니다. 전체 출력이 필요하면 `.logs/` 의 파일을 확인하거나
    `1-2`·`1-2-3`을 직접 실행합니다.
  - `.logs/` 는 `.gitignore` 에 있습니다. 커밋되지 않습니다.
  - 1개라도 실패하면 종료 코드 1 로 종료합니다.

### 14-4. 무엇이 실행 중인지 확인하기

```
banblit status
```

- **실행 경로**: 어디서나
- **용도**: `docker compose ps` 로 container 목록을 출력하고, 8000 과 5173 에 실제로 요청해
  응답 여부를 확인합니다.
- **옵션**: 없습니다.
- **주의점**: container 가 `Up` 인 상태와 앱이 응답하는 상태는 다릅니다. 이 명령은 2가지를 모두 확인합니다.

### 14-5. 정지하기

```
banblit down
```

- **실행 경로**: 어디서나
- **용도**: `3-3`으로 서비스를 정지합니다. 데이터는 volume 에 유지됩니다.
- **옵션**
  - `-Volumes` — volume 까지 삭제합니다. DB·첨부파일·테스트용 DB 가 전부 삭제됩니다.
    `yes` 를 직접 입력해야 실행됩니다. 생략하면 volume 을 유지합니다.

### 14-6. 그 밖의 명령

```
banblit logs api -Follow
banblit restart web
banblit migrate
banblit help
```

- **실행 경로**: 어디서나
- **용도**
  - `logs` — `3-1-2` 와 같습니다. 최근 1분 로그를 출력합니다. 대상을 적지 않으면 전체 서비스의 로그를 출력합니다.
  - `restart` — 다시 실행합니다. 대상을 적지 않으면 `api` 와 `web` 을 다시 실행합니다.
  - `migrate` — `4-2`·`4-2-1` 과 같습니다. 마이그레이션만 적용하고 현재 revision 을 출력합니다.
  - `help` — 명령·service·switch 목록을 출력합니다.
- **옵션**
  - 첫 번째 위치 인자가 명령, 두 번째가 대상 service 입니다. service 는
    `api` `web` `db` `auto-assign` 4개 중 1개이고, `logs` 와 `restart` 에서만 사용합니다.
  - `-Follow` — `logs` 를 실시간으로 계속 출력합니다. 생략하면 1번 출력하고 종료합니다.
- **주의점**
  - 명령을 적지 않으면 `up` 이 기본값입니다.
