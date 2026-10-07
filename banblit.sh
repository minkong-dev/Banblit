#!/usr/bin/env bash
#
# Banblit 을 한 번에 실행하고 종료합니다. 윈도우(Git Bash)와 리눅스 서버가 같은 파일을 씁니다.
#
#   서버:     git clone <저장소> && cd Banblit && ./banblit.sh up
#   이 PC:    banblit up          (banblit.ps1 이 이 파일을 호출합니다)
#
# 실행 방식은 2가지입니다.
#
#   dev     — 개발용. docker-compose.override.yml 이 적용되어 Vite 개발 서버와 api 가 실행됩니다.
#             reverse proxy(caddy)·백업 service 는 실행되지 않고, 로그인 cookie 의 Secure 가 꺼집니다.
#   deploy  — 배포용. docker-compose.yml 1개만 씁니다. nginx·caddy·정기 백업이 함께 실행되고 https 로 받습니다.
#
# 어느 방식인지는 실행 중인 OS 로 결정합니다 — 윈도우는 dev, 그 밖은 deploy.
# --dev / --deploy 로 직접 지정할 수 있고, 어느 방식을 선택했는지 매번 화면에 출력합니다.
#
# 개별 docker 명령의 뜻과 주의점은 COMMAND.md 에 작성되어 있는 내용을 기준으로 합니다.

set -euo pipefail

cd "$(dirname "$0")"

# Git Bash 는 / 로 시작하는 인자를 윈도우 경로로 변환합니다. docker 에 전달할 값이
# 변형되므로 변환을 끕니다. 리눅스에서는 아무 동작도 하지 않는 변수입니다.
export MSYS_NO_PATHCONV=1

DEV_IMAGE='banblit-backend:dev'
# .env.example 에 작성된 개발용 비밀번호입니다. 이 값 그대로 배포하면 DB 가 공개된 것과 같습니다.
SAMPLE_PASSWORD='banblit-dev-password'

DEV_WEB_URL='http://localhost:5173/'
DEV_API_HEALTH_URL='http://localhost:8000/health'

# 첫 기동은 container 안에서 npm install 이 실행되어 몇 분 걸립니다.
DEV_WEB_TIMEOUT=420
DEV_API_TIMEOUT=120
DEPLOY_TIMEOUT=180

step() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
note() { printf '   \033[90m%s\033[0m\n' "$1"; }
good() { printf '   \033[32m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m!! %s\033[0m\n' "$1" >&2; }

# ── 실행 방식 결정 ───────────────────────────────────────────────────────────

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) MODE='dev' ;;
  *)                    MODE='deploy' ;;
esac

COMMAND=''
SERVICE=''
AUTO=0
BUILD=0
NO_BROWSER=0
FOLLOW=0
VOLUMES=0

for arg in "$@"; do
  case "$arg" in
    --dev)        MODE='dev' ;;
    --deploy)     MODE='deploy' ;;
    --auto)       AUTO=1 ;;
    --build)      BUILD=1 ;;
    --no-browser) NO_BROWSER=1 ;;
    --follow|-f)  FOLLOW=1 ;;
    --volumes|-v) VOLUMES=1 ;;
    -*)           fail "존재하지 않는 Option 입니다 — $arg"; exit 1 ;;
    *)
      if [ -z "$COMMAND" ]; then COMMAND="$arg"; else SERVICE="$arg"; fi ;;
  esac
done
COMMAND="${COMMAND:-up}"

if [ "$MODE" = 'deploy' ]; then
  # 배포는 docker-compose.yml 1개만 씁니다. -f 를 지정하면 docker compose 가 override 파일을 자동으로 적용하지 않습니다.
  COMPOSE=(docker compose -f docker-compose.yml)
else
  COMPOSE=(docker compose)
fi

# ── 공통 ─────────────────────────────────────────────────────────────────────

# docker compose 가 읽는 것과 같은 .env 에서 값을 읽습니다. 값을 이 파일에 직접 적지 않기 위해서입니다.
env_value() {
  [ -f .env ] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" .env \
    | tail -n1 | sed 's/[[:space:]]*$//; s/^"\(.*\)"$/\1/; s/^'"'"'\(.*\)'"'"'$/\1/'
}

web_port() {
  local port
  port="$(env_value WEB_PORT)"
  printf '%s' "${port:-8080}"
}

health_url() {
  if [ "$MODE" = 'deploy' ]; then
    # 배포에서 api 는 host 에 포트를 열지 않습니다. nginx 를 거쳐 확인합니다 —
    # web·api·db 가 연결되어 동작하는지까지 요청 1번으로 확인합니다.
    printf 'http://127.0.0.1:%s/api/health' "$(web_port)"
  else
    printf '%s' "$DEV_API_HEALTH_URL"
  fi
}

assert_ready() {
  command -v docker >/dev/null 2>&1 || {
    fail "저장소에서 Docker를 찾지 못했습니다."
    if [ "$MODE" = 'dev' ]; then
      note "Docker Desktop 을 설치한 후 다시 실행하십시오."
    else
      note "Docker를 설치한 후 다시 실행하십시오: curl -fsSL https://get.docker.com | sh"
    fi
    exit 1
  }
  docker info >/dev/null 2>&1 || {
    fail "Docker 엔진이 응답하지 않습니다."
    if [ "$MODE" = 'dev' ]; then
      note "Docker Desktop 을 실행한 후 다시 실행하십시오."
    else
      note "Docker의 응답 상태를 확인하십시오: sudo systemctl start docker"
      note "TIP - Docker에 sudo 실행 권한을 부여할 수 있습니다."
      note "sudo usermod -aG docker \$USER 입력 후 다시 로그인 하십시오"
    fi
    exit 1
  }
  command -v curl >/dev/null 2>&1 || {
    fail "curl 을 찾지 못했습니다. 설치 상태를 확인해주십시오."
    exit 1
  }
}

# .env 가 없으면 견본을 복사합니다. 개발용 기본값이라 dev 는 그대로 실행할 수 있습니다.
ensure_env() {
  [ -f .env ] && return 0
  cp .env.example .env
  good ".env.example 복사를 통해 .env 를 생성하는 데 성공했습니다."
}

# 배포에 반드시 필요한 값이 채워졌는지 확인합니다. 1개라도 비어 있으면 여기서 중단합니다 —
# 도메인이 비어 있으면 caddy 가 인증서를 받지 못하고, 견본 비밀번호 그대로면 DB 가 공개된 것과 같습니다.
# 같은 주소로 인증서를 자주 요청하면 발급처가 한동안 거절하므로, 실행 전에 차단합니다.
assert_deploy_env() {
  local missing=0 domain password
  domain="$(env_value BANBLIT_DOMAIN)"
  password="$(env_value POSTGRES_PASSWORD)"

  if [ -z "$domain" ]; then
    fail "BANBLIT_DOMAIN 값이 비어 있습니다."
    note "  .env 에 도메인 값을 작성해주십시오. "
    note "  해당 도메인이 현재 이 서버와 연동되어 있어야 인증서가 발급 됩니다."
    missing=1
  fi

  if [ -z "$password" ] || [ "$password" = "$SAMPLE_PASSWORD" ]; then
    fail "POSTGRES_PASSWORD 가 기본 값으로 지정되어있습니다."
    note "  .env 를 통해 변경하십시오. "
    missing=1
  fi

  if [ -z "$(env_value SMTP_HOST)" ]; then
    note "SMTP_HOST 가 비어 있습니다."
    note "SMTP 정보가 없을 경우 비밀번호 재설정 및 아이디 찾기 진행시,"
    note "재설정 메일이 정상적으로 발송되지 않습니다."
  fi

  [ "$missing" -eq 0 ] || { fail ".env 에서 해당 값을 작성한 후 다시 실행하십시오."; exit 1; }
  good "$domain"
}

# migration이 변경될 경우, 백업 지점이 반드시 필요합니다. 
# backup service 는 6시간마다 실행되므로 자동 백업만으로는 서버와 데이터 차이가 발생 할 수 있습니다. 
# 따라서, migration 직전 상태의 백업을 1회 더 진행합니다.
# 백업은 backup service 의 container 에서 실행합니다. host 의 backups 폴더는 해당 container 가
# root 로 생성한 것이므로, 로그인한 사용자가 직접 사용할 경우 Permission denied 가 발생합니다.
backup_db() {
  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"

  # 저장이 중단되면 .part 확장자로 저장되므로, 정상 백업파일과 구분이 가능합니다.
  "${COMPOSE[@]}" run --rm --no-deps -T -e "STAMP=$stamp" --entrypoint bash backup -c '
    set -euo pipefail
    out="/backups/pre-migrate-$STAMP.sql.gz"
    pg_dump --clean --if-exists -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$out.part"
    mv "$out.part" "$out"
  ' || {
    fail "백업에 실패했습니다. migration 을 실행하지 않습니다."
    exit 1
  }
  good "pre-migrate-$stamp.sql.gz"
}

# migration 을 적용하기 전에, 데이터베이스가 현재 가리키는 revision 의 파일이 저장소에 있는지 확인합니다.
#
# alembic 은 현재 revision 의 파일이 없으면 "Can't locate revision" 만 출력하고 중단합니다. 그 문구만
# 보면 무엇을 해야 하는지 알 수 없습니다. 2026-09-16 에 migration 36개를 1개로 합치면서 옛 파일을
# 삭제했는데, 그때 배포 데이터베이스가 옛 체인 중간에 있어 2026-09-19 배포가 이 지점에서 중단되었습니다.
#
# 합치기 전에 배포 데이터베이스를 먼저 head 로 올렸다면 발생하지 않았을 상황입니다. 다음에 같은 일이
# 발생했을 때 원인과 할 일이 바로 보이도록 여기서 먼저 검사합니다.
assert_revision_known() {
  local service="$1"
  if "${COMPOSE[@]}" run --rm --no-deps -T "$service" alembic current >/dev/null 2>&1; then
    return 0
  fi

  local current
  current="$("${COMPOSE[@]}" exec -T db sh -c \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select version_num from alembic_version"' \
    2>/dev/null | tr -d '\r' | head -1)"

  fail "데이터베이스가 가리키는 revision 을 저장소에서 찾지 못했습니다."
  note "migration 을 실행하지 않았습니다."
  note ""
  note "데이터베이스의 revision : ${current:-읽어오는 데 실패했습니다}"
  note "저장소의 migration     : $(ls backend/migrations/versions/*.py 2>/dev/null | wc -l) 개"
  note ""
  note "해당 revision의 파일이 backend/migrations/versions 에 존재하지 않습니다."
  note "파일이 삭제된 후에도 데이터베이스가 이전 revision 에 남아 있을 경우,"
  note "alembic이 적용 시작 지점을 찾지 못할 수 있습니다."
  exit 1
}

wait_url() {
  local url="$1" timeout="$2" label="$3" deadline
  deadline=$(( SECONDS + timeout ))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      good "$label READY"
      return 0
    fi
    sleep 3
  done
  fail "$label 의 응답 시간이 초과되었습니다. $timeout 초 이내에 응답하여야합니다."
  return 1
}

# 가입된 사용자가 없을 경우, 첫 사용자는 최고 권한을 부여받습니다.
# (backend/src/backend/services/auth_service.py 의 _is_first_account).
# members 컬럼에는 등록되어 있으나, 가입하지 않은 테스트 데이터도 존재하므로 password_hash를 통해 구분합니다.
show_account_hint() {
  local user database count
  user="$(env_value POSTGRES_USER)"
  database="$(env_value POSTGRES_DB)"
  [ -n "$user" ] && [ -n "$database" ] || return 0
  count="$("${COMPOSE[@]}" exec -T db psql -U "$user" -d "$database" -tAc \
    'select count(*) from members where password_hash is not null;' 2>/dev/null \
    | tr -d '[:space:]')" || return 0
  [ -n "$count" ] || return 0
  if [ "$count" = "0" ]; then
    note "서비스에 가입된 사용자 계정이 존재하지 않습니다."
  else
    note "가입된 사용자 계정 $count 건"
  fi
}

# 리눅스는 현재 디렉토리를 PATH에 포함하지 않습니다. 
# 따라서 clone 직후에는 지정자인 ./ 를 부여해 실행하고, 
# 이후 alias를 등록합니다. 
#
# ~/.bashrc 에 function 을 추가합니다.
# 재실행시 누적 적용되지는 않으나, 경로 이동시 새 PATH로 등록될 수 있습니다.
BASHRC_BEGIN='# >>> banblit >>>'
BASHRC_END='# <<< banblit <<<'

register_command() {
  # 윈도우는 setup.ps1 파일을 통해 alias를 진행합니다.
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; esac

  local rc="$HOME/.bashrc" here had
  here="$(pwd)"
  [ -f "$rc" ] || : > "$rc"
  had=0
  grep -qF "$BASHRC_BEGIN" "$rc" 2>/dev/null && had=1

  # 이미 등록되어 있는 경우, 삭제 후 다시 추가를 진행합니다.
  [ "$had" -eq 0 ] || sed -i "\|$BASHRC_BEGIN|,\|$BASHRC_END|d" "$rc"
  {
    printf '%s\n' "$BASHRC_BEGIN"
    printf 'banblit() { "%s/banblit.sh" "$@"; }\n' "$here"
    printf '%s\n' "$BASHRC_END"
  } >> "$rc"

  [ "$had" -eq 0 ] || return 0
  note "banblit alias를 ~/.bashrc 에 추가하는 데 성공하였습니다."
  note "alias를 제거하려면 ~/.bashrc 를 열고,"
  note ">>> banblit >>> 행 부터 <<< banblit <<< 행 까지 삭제하여 주십시오."
}

open_browser() {
  [ "$NO_BROWSER" -eq 0 ] || return 0
  # 헤드리스 서버이므로 Browser를 열지 않습니다.
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) cmd.exe //c start "" "$1" >/dev/null 2>&1 || true ;;
  esac
}

# ── dev ──────────────────────────────────────────────────────────────────────

# dependency 를 추가하고 Docker image 다시 빌드하지 않을 경우,  
# uvicorn 이 import 단계에서 종료됩니다.
# uv.lock 파일과 Docker image의 Dockerfile 내 의존성을 비교하여 판단합니다.
image_stale() {
  local created built_at file_at
  created="$(docker image inspect "$DEV_IMAGE" --format '{{.Created}}' 2>/dev/null || true)"
  [ -n "$created" ] || return 0
  built_at="$(date -d "$created" +%s 2>/dev/null || true)"
  [ -n "$built_at" ] || return 0
  local name
  for name in pyproject.toml uv.lock Dockerfile; do
    [ -f "backend/$name" ] || continue
    file_at="$(date -r "backend/$name" +%s 2>/dev/null || stat -c %Y "backend/$name" 2>/dev/null || true)"
    [ -n "$file_at" ] || continue
    [ "$file_at" -gt "$built_at" ] && return 0
  done
  return 1
}

up_dev() {
  if [ "$BUILD" -eq 1 ] || image_stale; then
    step "개발용 image 를 다시 build 합니다."
    note "변경된 의존성이 없을 경우, layer cache 를 사용하여 bulid 속도를 향상시킵니다."
    "${COMPOSE[@]}" build dev
  fi

  step "migration 을 최신으로 업데이트합니다."
  note "Database 가 정상 응답을 반환할 때까지 기다린 후 업데이트합니다."
  assert_revision_known dev
  "${COMPOSE[@]}" run --rm dev alembic upgrade head

  local services=(api web)
  if [ "$AUTO" -eq 1 ]; then
    # 개발용 override 가 기본값을 false 로 선언하므로, 해당 블록에서 실행합니다.
    export AUTO_ASSIGN_ENABLED=true
    services+=(auto-assign)
    note "스케줄링 엔진을 Load 합니다."
  fi

  step "service Container 를 실행합니다 — ${services[*]}"
  "${COMPOSE[@]}" up -d "${services[@]}"

  step "정상 응답이 올 때까지 대기합니다"
  wait_url "$DEV_API_HEALTH_URL" "$DEV_API_TIMEOUT" 'API (8000)' || {
    note "로그를 확인하십시오: ./banblit.sh logs api"
    note "import 단계에서 종료되었다면 Docker image의 의존성 업데이트가"
    note "필요할 수 있습니다."
    exit 1
  }
  note "web Container 는 Compose up 을 진행할 경우,"
  note "npm 의존성 설치로 몇 분 정도 소요될 수 있습니다."
  wait_url "$DEV_WEB_URL" "$DEV_WEB_TIMEOUT" 'web (5173)' || {
    note "로그를 확인하십시오: ./banblit.sh logs web"
    exit 1
  }

  show_account_hint
  printf '\n   \033[32m화면 %s\033[0m\n   \033[32mAPI  http://localhost:8000/docs\033[0m\n\n' "$DEV_WEB_URL"
  open_browser "$DEV_WEB_URL"
}

# ── deploy ───────────────────────────────────────────────────────────────────

up_deploy() {
  step ".env 를 Check 합니다"
  assert_deploy_env

  step "Docker image 를 Build 합니다"
  note "변경된 의존성이 없을 경우, layer cache 를 사용하여 bulid 속도를 향상시킵니다."
  "${COMPOSE[@]}" build

  step "Database Container 를 실행하고 migration 을 적용합니다"
  "${COMPOSE[@]}" up -d db
  backup_db
  # 배포용 Docker image 안에 alembic.ini 와 migrations 가 포함되어 있습니다.
  # --no-deps 옵션은 build가 web 및 caddy container를 재실행되지 않도록 하여 자원을 절약합니다.
  assert_revision_known api
  "${COMPOSE[@]}" run --rm --no-deps api alembic upgrade head

  step "아직 실행되지 않은 Container 를 모두 생성합니다"
  "${COMPOSE[@]}" up -d

  step "정상 응답이 올 때까지 대기합니다"
  wait_url "$(health_url)" "$DEPLOY_TIMEOUT" 'API' || {
    note "로그를 확인하십시오: ./banblit.sh logs api"
    exit 1
  }

  show_account_hint
  printf '\n   \033[32m화면 https://%s\033[0m\n\n' "$(env_value BANBLIT_DOMAIN)"
  note "인증서를 처음 받는 데 1분쯤 더 걸릴 수 있습니다. 받지 못하면: ./banblit.sh logs caddy"
}

# ── 명령 ─────────────────────────────────────────────────────────────────────

cmd_up() {
  assert_ready
  ensure_env
  if [ "$MODE" = 'deploy' ]; then up_deploy; else up_dev; fi
  register_command
}

# 서버 소스코드를 Github 최신 릴리즈로 갱신합니다.
cmd_update() {
  assert_ready
  step "Git pull을 실행하여 소스코드를 업데이트합니다"
  git pull
  cmd_up
}

cmd_down() {
  assert_ready
  if [ "$VOLUMES" -eq 1 ]; then
    step "Container 를 Down 하고 Container에 mount 된 volume을 삭제합니다"
    fail "Databas 의 데이터와 저장된 첨부파일이 전부 삭제됩니다."
    printf '   삭제를 진행하시려면 yes 를 입력하십시오 : '
    local answer
    read -r answer
    [ "$answer" = "yes" ] || { note "삭제를 중단하였습니다."; return 0; }
    "${COMPOSE[@]}" down -v
    return 0
  fi
  step "Compose down 을 진행합니다. Data 는 Container volume 에 저장됩니다"
  "${COMPOSE[@]}" down
}

cmd_restart() {
  assert_ready
  local targets=(api web)
  [ -z "$SERVICE" ] || targets=("$SERVICE")
  step "Container를 강제로 재실행합니다 — ${targets[*]}"
  # docker compose restart 를 쓰지 않습니다. 
  # restart 는 기존 container 의 중단 시점에서 다시 up 되므로, 
  # env 파일이 생성 시점의 값을 반영하고 있습니다.
  # up --force-recreate 를 통해 Container 를 강제로 재생성하여 업데이트를 반영합니다.
  "${COMPOSE[@]}" up -d --force-recreate "${targets[@]}"
}

cmd_logs() {
  assert_ready
  # --since 1m 옵션을 통해 이전 종료된 Compose 의 Log 가 출력되는 것을 방지합니다.
  local args=(logs --since 1m)
  [ "$FOLLOW" -eq 0 ] || args+=(-f)
  [ -z "$SERVICE" ] || args+=("$SERVICE")
  "${COMPOSE[@]}" "${args[@]}"
}

cmd_status() {
  assert_ready
  step "실행 중인 Container"
  "${COMPOSE[@]}" ps
  step "READY"
  local body
  if body="$(curl -fsS --max-time 5 "$(health_url)" 2>/dev/null)"; then
    note "API  $body"
  else
    note "API  응답 없음"
  fi
  if [ "$MODE" = 'dev' ]; then
    if curl -fsS --max-time 5 "$DEV_WEB_URL" >/dev/null 2>&1; then
      note "web Container is Ready"
    else
      note "web Container Up failed (timeout)"
    fi
  fi
}

cmd_migrate() {
  assert_ready
  ensure_env
  step "migration 을 최신으로 업데이트합니다."
  if [ "$MODE" = 'deploy' ]; then
    assert_deploy_env
    "${COMPOSE[@]}" up -d db
    backup_db
    assert_revision_known api
    "${COMPOSE[@]}" run --rm --no-deps api alembic upgrade head
    "${COMPOSE[@]}" run --rm --no-deps api alembic current
  else
    assert_revision_known dev
    "${COMPOSE[@]}" run --rm dev alembic upgrade head
    "${COMPOSE[@]}" run --rm dev alembic current
  fi
}

# pytest를 실행하여 테스트 결과를 반환받습니다.
check_step() {
  local label="$1" log_path="$2" pattern="$3"; shift 3
  step "$label"
  local output code
  output="$("${COMPOSE[@]}" "$@" 2>&1)" && code=0 || code=$?
  printf '%s\n' "$output" > "$log_path"
  printf '%s\n' "$output" | grep -E "$pattern" | sed 's/^/   /' || true
  printf '%s\n' "$output" | grep -v '^[[:space:]]*$' | tail -n1 | sed 's/^/   /'
  if [ "$code" -eq 0 ]; then good "테스트 통과"; return 0; fi
  fail "테스트 실패 — RAW log 를 확인하십시오.  ($log_path)"
  return 1
}

cmd_check() {
  [ "$MODE" = 'dev' ] || { fail "check 옵션은 개발용입니다. 배포용 Docker image에는 Test Tool 이 포함되어 있지 않습니다."; exit 1; }
  assert_ready
  ensure_env
  mkdir -p .logs
  local stamp ok=0
  stamp="$(date +%Y%m%d-%H%M%S)"
  check_step 'Test' ".logs/pytest-$stamp.log" '^(FAILED|ERROR)' run --rm dev pytest -q || ok=1
  check_step 'Type Check' ".logs/mypy-$stamp.log" ': error:' run --rm --no-deps dev mypy || ok=1
  printf '\n'
  [ "$ok" -eq 0 ] || { fail "Test check에 실패하였습니다."; exit 1; }
  good "All test is OK"
}

cmd_help() {
  cat <<'HELP'

banblit — 서비스를 실행하는 명령어 입니다.

  ./banblit.sh [COMMAND] [SERVICE] [OPTIONS]

COMMAND

  up        Product 를 기동합니다.
  update    Source Code 및 migration 을 업데이트합니다.
  down      Product 를 종료합니다.
  restart   대상을 재실행합니다.
  logs      최근 1분 이내에 출력된 로그를 출력합니다.
  status    Container 의 Heath check 를 진행합니다.
  migrate   migration 를 적용하고 현재 revision 을 출력합니다.
  check     [DEV] pytest 와 mypy 를 통해 Test를 실행합니다.
  help      도움말을 출력합니다.



SERVICE

  api  web  db  auto-assign  caddy        [DEBUG] logs·restart 옵션 실행시 대상으로 부여




OPTIONS

  --dev --deploy   실행 방식을 직접 지정합니다.
  --auto           [DEV] Compose up 을 진행할 때 스케줄링 엔진도 Load 합니다.
  --build          [DEV] Compose up 을 진행할 때 Docker image 를 새로 build 합니다.
  --no-browser     [DEV] Compose up 을 진행할 때 View 용 Browser를 실행하지 않습니다. 
  --volumes  -v    Compose down 을 진행할 때, mount 된 volume 을 삭제합니다.
  --follow   -f    logs 를 실시간으로. 출력합니다


HELP
}

if [ "$COMMAND" != 'help' ]; then
  note "$MODE 로 실행합니다."
fi

case "$COMMAND" in
  up)      cmd_up ;;
  update)  cmd_update ;;
  down)    cmd_down ;;
  restart) cmd_restart ;;
  logs)    cmd_logs ;;
  status)  cmd_status ;;
  migrate) cmd_migrate ;;
  check)   cmd_check ;;
  help)    cmd_help ;;
  *)       fail "존재하지 않는 명령어입니다 — $COMMAND"; cmd_help; exit 1 ;;
esac
