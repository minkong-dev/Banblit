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
    -*)           fail "모르는 switch 입니다 — $arg"; exit 1 ;;
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
    fail "docker 를 찾지 못했습니다."
    if [ "$MODE" = 'dev' ]; then
      note "Docker Desktop 을 설치한 뒤 다시 실행하십시오."
    else
      note "설치한 뒤 다시 실행하십시오: curl -fsSL https://get.docker.com | sh"
    fi
    exit 1
  }
  docker info >/dev/null 2>&1 || {
    fail "Docker 엔진이 응답하지 않습니다."
    if [ "$MODE" = 'dev' ]; then
      note "Docker Desktop 을 켠 뒤 다시 실행하십시오."
    else
      note "켜져 있는지 확인하십시오: sudo systemctl start docker"
      note "sudo 없이 쓰려면 한 번만: sudo usermod -aG docker \$USER 뒤 다시 로그인"
    fi
    exit 1
  }
  command -v curl >/dev/null 2>&1 || {
    fail "curl 을 찾지 못했습니다. 기동 뒤 응답 확인에 씁니다."
    exit 1
  }
}

# .env 가 없으면 견본을 복사합니다. 개발용 기본값이라 dev 는 그대로 실행할 수 있습니다.
ensure_env() {
  [ -f .env ] && return 0
  cp .env.example .env
  good ".env 를 생성했습니다 — .env.example 을 복사했습니다."
}

# 배포에 반드시 필요한 값이 채워졌는지 확인합니다. 1개라도 비어 있으면 여기서 중단합니다 —
# 도메인이 비어 있으면 caddy 가 인증서를 받지 못하고, 견본 비밀번호 그대로면 DB 가 공개된 것과 같습니다.
# 같은 주소로 인증서를 자주 요청하면 발급처가 한동안 거절하므로, 실행 전에 차단합니다.
assert_deploy_env() {
  local missing=0 domain password
  domain="$(env_value BANBLIT_DOMAIN)"
  password="$(env_value POSTGRES_PASSWORD)"

  if [ -z "$domain" ]; then
    fail "BANBLIT_DOMAIN 이 비어 있습니다. 이 이름으로 인증서를 받습니다."
    note "  .env 에 적으십시오:  BANBLIT_DOMAIN=insixstrings.banblit.com"
    note "  그 이름이 실제로 이 서버를 가리키고 있어야 발급이 됩니다."
    missing=1
  fi

  if [ -z "$password" ] || [ "$password" = "$SAMPLE_PASSWORD" ]; then
    fail "POSTGRES_PASSWORD 가 견본 값 그대로입니다."
    note "  .env 에서 변경하십시오. 생성하려면:  openssl rand -base64 24"
    missing=1
  fi

  if [ -z "$(env_value SMTP_HOST)" ]; then
    note "SMTP_HOST 가 비어 있습니다 — 비밀번호 재설정·아이디 찾기 메일이 발송되지 않습니다."
    note "  실행은 됩니다. 비밀번호를 잊은 사람이 재설정할 수 없을 뿐입니다."
  fi

  [ "$missing" -eq 0 ] || { fail ".env 를 채운 뒤 다시 실행하십시오."; exit 1; }
  good "$domain"
}

# migration 이 값을 삭제하면 되돌릴 지점이 필요합니다. backup service 는 6시간마다 실행되므로
# 그 백업만으로는 되돌릴 지점이 최대 6시간 어긋납니다. migration 직전 상태를 1벌 더 백업합니다.
#
# 백업은 backup service 의 container 에서 실행합니다. host 의 backups 폴더는 그 container 가
# root 로 생성한 것이라 로그인한 사용자가 직접 쓰면 Permission denied 가 발생합니다.
# 접속 정보도 그 service 의 환경변수에 이미 있습니다.
backup_db() {
  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"

  # 정기 백업과 같은 폴더에 같은 방식으로 저장합니다(deploy/backup.sh).
  # 저장이 끝나기 전에 중단되면 .part 로 남아 완료된 백업과 구분됩니다.
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
  note "migration 을 실행하지 않았습니다. 데이터는 그대로입니다."
  note ""
  note "데이터베이스의 revision : ${current:-읽지 못했습니다}"
  note "저장소의 migration     : $(ls backend/migrations/versions/*.py 2>/dev/null | wc -l) 개"
  note ""
  note "그 revision 의 파일이 backend/migrations/versions 에 없다는 뜻입니다. 파일이 삭제된 뒤에도"
  note "이 데이터베이스가 옛 revision 에 남아 있으면 alembic 은 적용 시작 지점을 찾을 수 없습니다."
  note "복구 절차는 COMMAND.md 11-6 에 있습니다."
  exit 1
}

wait_url() {
  local url="$1" timeout="$2" label="$3" deadline
  deadline=$(( SECONDS + timeout ))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      good "$label 준비됨"
      return 0
    fi
    sleep 3
  done
  fail "$label 이(가) $timeout 초 안에 응답하지 않았습니다."
  return 1
}

# 가입한 계정이 0개이면 첫 가입자가 권한 항목 전부를 받습니다
# (backend/src/backend/services/auth_service.py 의 _is_first_account).
# members 에는 명단만 등록되고 가입한 적 없는 행도 있으므로 password_hash 로 구분합니다.
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
    note "가입된 계정이 없습니다. /signup 에서 생성하는 첫 계정이 권한 항목 전부를 받습니다."
  else
    note "가입된 계정 $count 개"
  fi
}

# 리눅스는 현재 폴더를 명령 검색 경로(PATH)에 포함하지 않습니다 — 어느 폴더에 들어갔을 때 그 폴더의
# 같은 이름 파일이 실행되는 것을 막는 기본 설정입니다. 그래서 clone 직후에는 ./ 가
# 필요하고, ./ 없이 실행하려면 명령 이름을 등록해야 합니다.
#
# ~/.bashrc 에 function 으로 추가합니다. alias 는 뒤따르는 인자를 전달하지 못하는 경우가 있습니다.
# 표시 2줄 사이에만 쓰므로 여러 번 실행해도 누적되지 않고, 저장소를 이동하면 경로가 갱신됩니다.
BASHRC_BEGIN='# >>> banblit >>>'
BASHRC_END='# <<< banblit <<<'

register_command() {
  # 윈도우에서는 setup.ps1 이 PowerShell profile 에 이미 추가합니다. 여기서 다시 추가하지 않습니다.
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; esac

  local rc="$HOME/.bashrc" here had
  here="$(pwd)"
  [ -f "$rc" ] || : > "$rc"
  had=0
  grep -qF "$BASHRC_BEGIN" "$rc" 2>/dev/null && had=1

  # 이미 등록된 블록은 표시 줄까지 삭제하고 다시 추가합니다 — 저장소를 이동했을 때 옛 경로가 남지 않습니다.
  [ "$had" -eq 0 ] || sed -i "\|$BASHRC_BEGIN|,\|$BASHRC_END|d" "$rc"
  {
    printf '%s\n' "$BASHRC_BEGIN"
    printf 'banblit() { "%s/banblit.sh" "$@"; }\n' "$here"
    printf '%s\n' "$BASHRC_END"
  } >> "$rc"

  [ "$had" -eq 0 ] || return 0
  note "banblit 명령을 ~/.bashrc 에 추가했습니다. 다음 로그인부터 어느 경로에서나 'banblit up' 으로 실행합니다."
  note "이 창에서 바로 쓰려면:  source ~/.bashrc"
  note "삭제하려면 ~/.bashrc 에서 '>>> banblit >>>' 부터 '<<< banblit <<<' 까지 삭제하십시오."
}

open_browser() {
  [ "$NO_BROWSER" -eq 0 ] || return 0
  # 윈도우에서만 엽니다. 서버에는 열 화면이 없습니다.
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) cmd.exe //c start "" "$1" >/dev/null 2>&1 || true ;;
  esac
}

# ── dev ──────────────────────────────────────────────────────────────────────

# dependency 를 추가하고 image 를 다시 만들지 않으면 uvicorn 이 import 단계에서 종료됩니다.
# python-multipart 가 빠져 실제로 종료된 적이 있습니다(COMMAND.md 1-1-1).
# lock 파일이 image 보다 새로우면 image 가 오래된 것으로 판단합니다.
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
    step "개발용 image 를 다시 만듭니다"
    note "dependency 나 Dockerfile 이 image 보다 새롭습니다. 변경된 것이 없으면 layer cache 를 씁니다."
    "${COMPOSE[@]}" build dev
  fi

  step "migration 을 최신으로 맞춥니다"
  note "db 가 healthy 가 될 때까지 기다린 뒤 alembic 이 실행됩니다."
  assert_revision_known dev
  "${COMPOSE[@]}" run --rm dev alembic upgrade head

  local services=(api web)
  if [ "$AUTO" -eq 1 ]; then
    # 개발용 override 가 기본값을 false 로 두므로 여기서 켭니다 (COMMAND.md 13-1).
    export AUTO_ASSIGN_ENABLED=true
    services+=(auto-assign)
    note "자동 배정 service 를 함께 실행합니다."
  fi

  step "service 를 실행합니다 — ${services[*]}"
  "${COMPOSE[@]}" up -d "${services[@]}"

  step "응답을 기다립니다"
  wait_url "$DEV_API_HEALTH_URL" "$DEV_API_TIMEOUT" 'API (8000)' || {
    note "로그를 확인하십시오: ./banblit.sh logs api"
    note "import 단계에서 종료되었다면 image 가 오래된 것입니다: ./banblit.sh up --build"
    exit 1
  }
  note "web 은 첫 기동에서 container 안 npm install 이 실행되어 몇 분 걸립니다."
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
  step ".env 를 확인합니다"
  assert_deploy_env

  step "image 를 생성합니다"
  note "처음에는 몇 분 걸립니다. 변경된 것이 없으면 layer cache 를 씁니다."
  "${COMPOSE[@]}" build

  step "데이터베이스를 실행하고 migration 을 적용합니다"
  "${COMPOSE[@]}" up -d db
  backup_db
  # 배포용 image 안에 alembic.ini 와 migrations 가 함께 있습니다(backend/Dockerfile).
  # --no-deps 는 이 1회 실행 때문에 web·caddy 까지 함께 실행되는 것을 막습니다.
  assert_revision_known api
  "${COMPOSE[@]}" run --rm --no-deps api alembic upgrade head

  step "나머지 service 를 실행합니다"
  "${COMPOSE[@]}" up -d

  step "응답을 기다립니다"
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
  # 실행이 끝난 뒤에 등록합니다. 실행에 실패한 경로에 명령 이름만 남기지 않기 위해서입니다.
  register_command
}

# 서버를 새 버전으로 갱신합니다. git pull 이 이 파일 자체를 변경하지만, bash 는 함수를
# 정의할 때 본문을 전부 읽어 두므로 실행 중에 변경되어도 어긋나지 않습니다.
cmd_update() {
  assert_ready
  step "코드를 가져옵니다"
  git pull
  cmd_up
}

cmd_down() {
  assert_ready
  if [ "$VOLUMES" -eq 1 ]; then
    step "service 를 종료하고 volume 까지 삭제합니다"
    fail "DB·첨부파일이 전부 삭제됩니다."
    printf '   정말 삭제합니까? (yes 를 그대로 입력) '
    local answer
    read -r answer
    [ "$answer" = "yes" ] || { note "아무것도 하지 않았습니다."; return 0; }
    "${COMPOSE[@]}" down -v
    return 0
  fi
  step "service 를 종료합니다. 데이터는 volume 에 남습니다"
  "${COMPOSE[@]}" down
}

cmd_restart() {
  assert_ready
  local targets=(api web)
  [ -z "$SERVICE" ] || targets=("$SERVICE")
  step "다시 실행합니다 — ${targets[*]}"
  # docker compose restart 를 쓰지 않습니다. restart 는 기존 container 를 껐다 켤 뿐이라
  # 환경변수가 생성 시점의 값 그대로입니다 — .env 를 수정하고 restart 하면 error 없이 옛 값으로 동작합니다.
  # up --force-recreate 는 container 를 다시 생성해 .env 를 다시 읽습니다.
  "${COMPOSE[@]}" up -d --force-recreate "${targets[@]}"
}

cmd_logs() {
  assert_ready
  # --since 1m 이 없으면 이전 기동의 로그까지 섞여 출력됩니다.
  local args=(logs --since 1m)
  [ "$FOLLOW" -eq 0 ] || args+=(-f)
  [ -z "$SERVICE" ] || args+=("$SERVICE")
  "${COMPOSE[@]}" "${args[@]}"
}

cmd_status() {
  assert_ready
  step "동작 중인 container"
  "${COMPOSE[@]}" ps
  step "응답"
  local body
  if body="$(curl -fsS --max-time 5 "$(health_url)" 2>/dev/null)"; then
    note "API  $body"
  else
    note "API  응답 없음"
  fi
  if [ "$MODE" = 'dev' ]; then
    if curl -fsS --max-time 5 "$DEV_WEB_URL" >/dev/null 2>&1; then
      note "web  응답함"
    else
      note "web  응답 없음"
    fi
  fi
}

cmd_migrate() {
  assert_ready
  ensure_env
  step "migration 을 최신으로 맞춥니다"
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

# 전체 출력을 파일에 저장하고 화면에는 판정과 실패 항목만 출력합니다.
# pytest 1회가 수백 줄을 출력하는데 필요한 것은 통과 여부와 실패한 테스트 이름뿐입니다.
check_step() {
  local label="$1" log_path="$2" pattern="$3"; shift 3
  step "$label"
  local output code
  output="$("${COMPOSE[@]}" "$@" 2>&1)" && code=0 || code=$?
  printf '%s\n' "$output" > "$log_path"
  printf '%s\n' "$output" | grep -E "$pattern" | sed 's/^/   /' || true
  printf '%s\n' "$output" | grep -v '^[[:space:]]*$' | tail -n1 | sed 's/^/   /'
  if [ "$code" -eq 0 ]; then good "통과"; return 0; fi
  fail "실패 — 전체 출력은 $log_path 에 있습니다"
  return 1
}

cmd_check() {
  [ "$MODE" = 'dev' ] || { fail "check 는 개발용입니다. 배포용 image 에는 검사 도구가 없습니다."; exit 1; }
  assert_ready
  ensure_env
  mkdir -p .logs
  local stamp ok=0
  stamp="$(date +%Y%m%d-%H%M%S)"
  check_step '테스트' ".logs/pytest-$stamp.log" '^(FAILED|ERROR)' run --rm dev pytest -q || ok=1
  check_step '타입 검사' ".logs/mypy-$stamp.log" ': error:' run --rm --no-deps dev mypy || ok=1
  printf '\n'
  [ "$ok" -eq 0 ] || { fail "check 가 실패했습니다. 위 항목을 보십시오."; exit 1; }
  good "전부 통과"
}

cmd_help() {
  cat <<'HELP'

banblit — 실행하고 종료합니다. 윈도우와 리눅스 서버가 같은 파일을 씁니다

  ./banblit.sh [명령] [service] [switch]

명령
  up        image 확인, migration, 실행, 응답 대기 (기본값)
  update    git pull 로 코드를 받은 뒤 up 을 실행합니다. 서버 갱신은 이 명령 1개로 끝납니다
  down      service 를 종료합니다. 데이터는 volume 에 남습니다
  restart   다시 실행합니다. service 를 적지 않으면 api 와 web
  logs      최근 1분 로그를 출력합니다
  status    동작 중인 container 를 출력하고, 상태 확인 주소에 실제로 요청합니다
  migrate   migration 만 적용하고 현재 revision 을 출력합니다
  check     pytest 와 mypy 를 실행합니다(개발용에서만). 화면에는 판정과 실패 항목만,
            전체 출력은 .logs/ 에 저장합니다
  help      이 도움말

service
  api  web  db  auto-assign  caddy        logs·restart 에서만 씁니다

switch
  --dev --deploy   실행 방식을 직접 지정합니다. 적지 않으면 윈도우는 dev, 그 밖은 deploy
  --auto           up 에서 자동 배정 service 를 켜서 함께 실행합니다(dev)
  --build          up 에서 개발용 image 를 무조건 다시 생성합니다(dev)
  --no-browser     up 에서 browser 를 열지 않습니다(dev)
  --volumes  -v    down 에서 volume 까지 삭제합니다. yes 를 직접 입력해야 실행됩니다
  --follow   -f    logs 를 계속 출력합니다

개별 docker 명령의 뜻과 주의점은 COMMAND.md 에 작성되어 있는 내용을 기준으로 합니다.

HELP
}

if [ "$COMMAND" != 'help' ]; then
  note "$MODE 로 진행합니다."
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
  *)       fail "모르는 명령입니다 — $COMMAND"; cmd_help; exit 1 ;;
esac
