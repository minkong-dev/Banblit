# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# 1단계 · 공통 바탕 — 개발용·배포용이 함께 물려받는 층
#   파이썬 버전과 실행 의존성(OR-Tools)을 여기 한 곳에서만 고정한다.
#   두 단계가 이 층을 공유하므로 버전이 서로 어긋날 수 없다.
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

# 잠금 파일에 적힌 버전 그대로 설치한다. 소스는 아직 넣지 않는다.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

# ─────────────────────────────────────────────────────────────
# 2단계 · 개발용 — 테스트 도구가 포함된 층
#   소스는 이미지에 굽지 않고 바깥 폴더를 연결해서 쓴다.
#   PYTHONPATH로 연결된 소스를 찾게 한다.
# ─────────────────────────────────────────────────────────────
FROM base AS dev

ENV PYTHONPATH=/app/src

RUN uv sync --locked --no-install-project

CMD ["pytest"]

# ─────────────────────────────────────────────────────────────
# 3단계 · 배포용 — 실행에 필요한 것만 남긴 층
#   테스트 도구가 들어오지 않는다.
# ─────────────────────────────────────────────────────────────
FROM base AS prod

# pyproject.toml이 readme = "README.md"를 선언하므로 패키지 설치에 이 파일이 필요하다.
COPY README.md ./
COPY src ./src
RUN uv sync --locked --no-dev

EXPOSE 8000
CMD ["uvicorn", "backend.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
