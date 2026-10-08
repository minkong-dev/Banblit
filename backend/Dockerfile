# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# 1단계 base — dev 와 prod 가 공유하는 stage 입니다.
#   Python 버전과 실행 의존성(OR-Tools)을 이 stage 에서만 지정합니다.
# ─────────────────────────────────────────────────────────────
FROM python:3.14-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/opt/dependency \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PATH="/opt/dependency/bin:$PATH"

COPY --from=ghcr.io/astral-sh/uv:0.11.23 /uv /usr/local/bin/uv

WORKDIR /app

# uv.lock 에 작성된 버전으로 설치합니다. 소스는 복사하지 않습니다.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev --no-install-project

# ─────────────────────────────────────────────────────────────
# 2단계 dev — 테스트 도구(pytest, mypy)가 포함된 stage 입니다.
#   소스는 Docker image 에 복사하지 않고 host 폴더를 volume 으로 연결합니다(docker-compose.override.yml).
# ─────────────────────────────────────────────────────────────
FROM base AS dev

ENV PYTHONPATH=/app/src

RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-install-project

CMD ["pytest"]

# ─────────────────────────────────────────────────────────────
# 3단계 prod — 실행에 필요한 파일만 포함하는 stage 입니다. 테스트 도구는 설치하지 않습니다.
# ─────────────────────────────────────────────────────────────
FROM base AS prod

# pyproject.toml 이 readme = "README.md" 를 선언하므로 패키지 설치에 이 파일이 필요합니다.
COPY README.md ./
COPY src ./src

# migration 파일을 복사합니다. 배포에는 dev service 가 존재하지 않으므로 api container 에서 alembic 을 실행합니다.
COPY alembic.ini ./
COPY migrations ./migrations

RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

EXPOSE 8000
CMD ["uvicorn", "backend.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
