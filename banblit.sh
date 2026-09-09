#!/usr/bin/env bash
#
# Banblit 을 한 번에 띄우고 내립니다. 윈도우(Git Bash)와 리눅스 서버가 같은 파일을 씁니다.
#
#   서버:     git clone <저장소> && cd Banblit && ./banblit.sh up
#   이 PC:    banblit up          (banblit.ps1 이 이 파일을 부릅니다)
#
# 뜨는 것이 두 가지입니다.
#
#   dev     — 개발용. 개발용 override 가 얹혀 Vite 개발 서버와 api 가 뜬다.
#             앞단(caddy)·백업은 뜨지 않고, 로그인 쿠키의 Secure 가 꺼진다.
#   deploy  — 배포용. base 하나만 쓴다. nginx·앞단·정기 백업이 함께 뜨고 https 로 받는다.
#
# 어느 쪽인지는 돌고 있는 OS 로 정합니다 — 윈도우는 dev, 그 밖은 deploy.
# --dev / --deploy 로 직접 고를 수 있고, 어느 쪽을 골랐는지 매번 화면에 적습니다.
#
# 개별 docker 명령의 뜻과 주의점은 COMMAND.md 가 정본입니다.

set -euo pipefail

cd "$(dirname "$0")"

# Git Bash 는 / 로 시작하는 인자를 윈도우 경로로 바꾼다. docker 에 넘길 값이
# 망가지므로 끈다. 리눅스에서는 아무 일도 하지 않는 변수다.
export MSYS_NO_PATHCONV=1

DEV_IMAGE='banblit-backend:dev'
# .env.example 에 적힌 개발용 비밀번호. 이 값 그대로 배포하면 DB 가 공개된 것과 같다.
SAMPLE_PASSWORD='banblit-dev-password'

DEV_WEB_URL='http://localhost:5173/'
DEV_API_HEALTH_URL='http://localhost:8000/health'

# 첫 기동은 container 안에서 npm install 이 돌아 몇 분 걸린다.
DEV_WEB_TIMEOUT=420
DEV_API_TIMEOUT=120
DEPLOY_TIMEOUT=180

step() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
note() { printf '   \033[90m%s\033[0m\n' "$1"; }
good() { printf '   \033[32m%s\033[0m\n' "$1"; }
fail() { printf '\033[31m!! %s\033[0m\n' "$1" >&2; }

# ── 어느 쪽을 띄울지 ──────────────────────────────────────────────────────────

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
  # 배포는 base 하나만 쓴다. -f 를 주면 docker compose 가 override 를 자동으로 얹지 않는다.
  COMPOSE=(docker compose -f docker-compose.yml)
else
  COMPOSE=(docker compose)
fi

# ── 공통 ─────────────────────────────────────────────────────────────────────

# docker compose 가 읽는 것과 같은 .env 에서 값을 꺼낸다. 이름을 코드에 박지 않기 위해서다.
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
    # 배포에서 api 는 host 에 포트를 열지 않는다. nginx 를 거쳐 확인한다 —
    # web·api·db 가 이어져 도는지까지 한 번에 본다.
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

# .env 가 없으면 견본을 복사한다. 개발용 기본값이라 dev 는 그대로 띄울 수 있다.
ensure_env() {
  [ -f .env ] && return 0
  cp .env.example .env
  good "만들었습니다 — .env.example 을 복사했습니다."
}

# 배포에 반드시 필요한 값이 채워졌는지 확인한다. 하나라도 비면 여기서 멈춘다 —
# 도메인이 비면 caddy 가 인증서를 못 받고, 견본 비밀번호 그대로면 DB 가 열린 것과 같다.
# 같은 주소로 인증서를 자주 요청하면 발급처가 한동안 거절하므로, 뜨기 전에 막는다.
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
    note "  .env 에서 바꾸십시오. 만들어 쓰려면:  openssl rand -base64 24"
    missing=1
  fi

  if [ -z "$(env_value SMTP_HOST)" ]; then
    note "SMTP_HOST 가 비어 있습니다 — 비밀번호 재설정·아이디 찾기 메일이 나가지 않습니다."
    note "  띄우는 것은 됩니다. 비밀번호를 잊은 사람이 되찾을 수 없을 뿐입니다."
  fi

  [ "$missing" -eq 0 ] || { fail ".env 를 채운 뒤 다시 실행하십시오."; exit 1; }
  good "$domain"
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

# 가입한 계정이 하나도 없으면 첫 가입자가 열한 개 권한을 전부 받는다
# (backend/src/backend/api/auth_service.py 의 _is_first_account).
# members 에는 명단만 올라 있고 가입한 적 없는 행도 있으므로 password_hash 로 가른다.
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
    note "가입된 계정이 없습니다. /signup 에서 만드는 첫 계정이 권한 열한 개를 전부 받습니다."
  else
    note "가입된 계정 $count 개"
  fi
}

# 리눅스는 현재 폴더를 명령 검색 경로에 넣지 않는다 — 아무 폴더에 들어갔다가 거기 있는
# 가짜 파일이 실행되는 것을 막으려는 기본 설정이다. 그래서 갓 클론한 자리에서는 ./ 가
# 필요하고, 그것을 없애려면 이름을 어딘가에 등록해야 한다.
#
# ~/.bashrc 에 function 으로 넣는다. alias 는 뒤따르는 인자를 넘기지 못하는 경우가 있다.
# 표시 두 줄 사이에만 쓰므로 여러 번 실행해도 쌓이지 않고, 저장소를 옮기면 경로가 갱신된다.
BASHRC_BEGIN='# >>> banblit >>>'
BASHRC_END='# <<< banblit <<<'

register_command() {
  # 윈도우에서는 setup.ps1 이 PowerShell profile 에 이미 넣는다. 여기서 또 넣지 않는다.
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; esac

  local rc="$HOME/.bashrc" here had
  here="$(pwd)"
  [ -f "$rc" ] || : > "$rc"
  had=0
  grep -qF "$BASHRC_BEGIN" "$rc" 2>/dev/null && had=1

  # 있던 것은 표시째로 걷어내고 다시 넣는다 — 저장소를 옮겼을 때 옛 경로가 남지 않는다.
  [ "$had" -eq 0 ] || sed -i "\|$BASHRC_BEGIN|,\|$BASHRC_END|d" "$rc"
  {
    printf '%s\n' "$BASHRC_BEGIN"
    printf 'banblit() { "%s/banblit.sh" "$@"; }\n' "$here"
    printf '%s\n' "$BASHRC_END"
  } >> "$rc"

  [ "$had" -eq 0 ] || return 0
  note "banblit 명령을 ~/.bashrc 에 넣었습니다. 다음 로그인부터 어느 경로에서나 'banblit up' 으로 씁니다."
  note "이 창에서 바로 쓰려면:  source ~/.bashrc"
  note "지우려면 ~/.bashrc 에서 '>>> banblit >>>' 부터 '<<< banblit <<<' 까지 지우십시오."
}

open_browser() {
  [ "$NO_BROWSER" -eq 0 ] || return 0
  # 윈도우에서만 연다. 서버에는 열 화면이 없다.
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) cmd.exe //c start "" "$1" >/dev/null 2>&1 || true ;;
  esac
}

# ── dev ──────────────────────────────────────────────────────────────────────

# dependency 를 추가하고 image 를 다시 만들지 않으면 uvicorn 이 import 단계에서 죽는다.
# python-multipart 가 빠져 실제로 죽은 적이 있다(COMMAND.md 1-1-1).
# lock 파일이 image 보다 새로우면 낡은 것으로 판단한다.
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
    note "dependency 나 Dockerfile 이 image 보다 새롭습니다. 바뀐 것이 없으면 layer cache 가 대신합니다."
    "${COMPOSE[@]}" build dev
  fi

  step "migration 을 최신으로 맞춥니다"
  note "db 가 healthy 가 될 때까지 기다린 뒤 alembic 이 실행됩니다."
  "${COMPOSE[@]}" run --rm dev alembic upgrade head

  local services=(api web)
  if [ "$AUTO" -eq 1 ]; then
    # 개발용 override 가 기본을 false 로 두므로 여기서 켠다 (COMMAND.md 13-1).
    export AUTO_ASSIGN_ENABLED=true
    services+=(auto-assign)
    note "자동 배정 service 를 함께 띄웁니다."
  fi

  step "service 를 띄웁니다 — ${services[*]}"
  "${COMPOSE[@]}" up -d "${services[@]}"

  step "응답을 기다립니다"
  wait_url "$DEV_API_HEALTH_URL" "$DEV_API_TIMEOUT" 'API (8000)' || {
    note "로그를 확인하십시오: ./banblit.sh logs api"
    note "import 단계에서 죽었다면 image 가 낡은 것입니다: ./banblit.sh up --build"
    exit 1
  }
  note "web 은 첫 기동에서 container 안 npm install 이 돌아 몇 분 걸립니다."
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

  step "image 를 만듭니다"
  note "처음에는 몇 분 걸립니다. 바뀐 것이 없으면 layer cache 가 대신합니다."
  "${COMPOSE[@]}" build

  step "데이터베이스를 띄우고 migration 을 맞춥니다"
  "${COMPOSE[@]}" up -d db
  # 배포용 image 안에 alembic.ini 와 migrations 가 함께 들어 있다(backend/Dockerfile).
  # --no-deps 는 이 한 번을 위해 web·caddy 까지 딸려 뜨는 것을 막는다.
  "${COMPOSE[@]}" run --rm --no-deps api alembic upgrade head

  step "나머지를 띄웁니다"
  "${COMPOSE[@]}" up -d

  step "응답을 기다립니다"
  wait_url "$(health_url)" "$DEPLOY_TIMEOUT" 'API' || {
    note "로그를 확인하십시오: ./banblit.sh logs api"
    exit 1
  }

  show_account_hint
  printf '\n   \033[32m화면 https://%s\033[0m\n\n' "$(env_value BANBLIT_DOMAIN)"
  note "인증서를 처음 받는 데 1 분쯤 더 걸릴 수 있습니다. 안 되면: ./banblit.sh logs caddy"
}

# ── 명령 ─────────────────────────────────────────────────────────────────────

cmd_up() {
  assert_ready
  ensure_env
  if [ "$MODE" = 'deploy' ]; then up_deploy; else up_dev; fi
  # 뜬 뒤에 등록한다. 띄우다 실패한 자리에 이름만 남기지 않으려는 것이다.
  register_command
}

cmd_down() {
  assert_ready
  if [ "$VOLUMES" -eq 1 ]; then
    step "service 를 내리고 volume 까지 지웁니다"
    fail "DB·첨부파일이 전부 사라집니다."
    printf '   정말 지웁니까? (yes 를 그대로 입력) '
    local answer
    read -r answer
    [ "$answer" = "yes" ] || { note "아무것도 하지 않았습니다."; return 0; }
    "${COMPOSE[@]}" down -v
    return 0
  fi
  step "service 를 내립니다. 데이터는 volume 에 남습니다"
  "${COMPOSE[@]}" down
}

cmd_restart() {
  assert_ready
  local targets=(api web)
  [ -z "$SERVICE" ] || targets=("$SERVICE")
  step "다시 띄웁니다 — ${targets[*]}"
  # docker compose restart 를 쓰지 않는다. 그것은 있던 container 를 껐다 켤 뿐이라
  # 환경변수는 만들 때 굳은 값 그대로다 — .env 를 고치고 restart 하면 조용히 옛 값으로 돈다.
  # up --force-recreate 는 container 를 다시 만들어 .env 를 다시 읽는다.
  "${COMPOSE[@]}" up -d --force-recreate "${targets[@]}"
}

cmd_logs() {
  assert_ready
  # --since 1m 이 없으면 이전 기동의 로그까지 섞여 나온다.
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
    "${COMPOSE[@]}" run --rm --no-deps api alembic upgrade head
    "${COMPOSE[@]}" run --rm --no-deps api alembic current
  else
    "${COMPOSE[@]}" run --rm dev alembic upgrade head
    "${COMPOSE[@]}" run --rm dev alembic current
  fi
}

# 전체 출력을 파일로 받고 화면에는 판정과 실패 항목만 낸다.
# pytest 한 번이 수백 줄을 내는데 필요한 것은 통과 여부와 실패한 이름뿐이다.
check_step() {
  local label="$1" log_path="$2" pattern="$3"; shift 3
  step "$label"
  local output code
  output="$("${COMPOSE[@]}" "$@" 2>&1)" && code=0 || code=$?
  printf '%s\n' "$output" > "$log_path"
  printf '%s\n' "$output" | grep -E "$pattern" | sed 's/^/   /' || true
  printf '%s\n' "$output" | grep -v '^[[:space:]]*$' | tail -n1 | sed 's/^/   /'
  if [ "$code" -eq 0 ]; then good "통과"; return 0; fi
  fail "실패 — 전체 출력은 $log_path"
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

banblit — 띄우고 내립니다. 윈도우와 리눅스 서버가 같은 파일을 씁니다

  ./banblit.sh [명령] [service] [switch]

명령
  up        image 확인, migration, 기동, 응답 대기 (기본값)
  down      service 를 내립니다. 데이터는 volume 에 남습니다
  restart   다시 띄웁니다. service 를 적지 않으면 api 와 web
  logs      최근 1분 로그를 봅니다
  status    무엇이 동작 중인지 보고, 정상 확인 주소에 실제로 요청해 봅니다
  migrate   migration 만 실행하고 현재 revision 을 출력합니다
  check     pytest 와 mypy 를 돌립니다(개발용에서만). 화면에는 판정과 실패 항목만,
            전체 출력은 .logs/ 에 남습니다
  help      이 도움말

service
  api  web  db  auto-assign  caddy        logs·restart 에서만 씁니다

switch
  --dev --deploy   어느 쪽을 띄울지 직접 고릅니다. 적지 않으면 윈도우는 dev, 그 밖은 deploy
  --auto           up 에서 자동 배정 service 를 켜서 함께 띄웁니다(dev)
  --build          up 에서 개발용 image 를 무조건 다시 만듭니다(dev)
  --no-browser     up 에서 browser 를 열지 않습니다(dev)
  --volumes  -v    down 에서 volume 까지 지웁니다. yes 를 직접 입력해야 실행됩니다
  --follow   -f    logs 를 붙잡고 계속 봅니다

개별 docker 명령의 뜻과 주의점은 COMMAND.md 가 정본입니다.

HELP
}

if [ "$COMMAND" != 'help' ]; then
  note "$MODE 로 진행합니다."
fi

case "$COMMAND" in
  up)      cmd_up ;;
  down)    cmd_down ;;
  restart) cmd_restart ;;
  logs)    cmd_logs ;;
  status)  cmd_status ;;
  migrate) cmd_migrate ;;
  check)   cmd_check ;;
  help)    cmd_help ;;
  *)       fail "모르는 명령입니다 — $COMMAND"; cmd_help; exit 1 ;;
esac
