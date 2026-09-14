#!/bin/sh
# 서버를 업데이트하는 Shell Script 입니다.
#
# alembic 마이그레이션이 compose보다 먼저 실행되어야합니다. 순서에 주의 부탁드립니다.
# 업데이트된 코드베이스로 compose가 먼저 up 될 경우, 
# 데이터베이스 스키마가 코드베이스의 새 스키마 구조와 맞지않아서 status code 500을 반환합니다. 
#
# 마이그레이션을 진행 시점에 따라, 백업파일과 현재 데이터베이스가 최대 6시간 어긋나있을 수 있습니다. 
# 따라서 업데이트를 시작할 때, 데이터베이스 백업을 먼저 실행한 후 업데이트를 진행합니다.
#
# 실행: 프로젝트 루트디렉토리에서 `./deploy/deploy.sh`

set -eu

# main 함수 밖에는 명령어를 작성하지 않도록 주의 부탁드립니다.
# deploy.sh 의 명령어 중에는 git pull 이 있기 때문에, 
# 해당 명령어로 이 파일 자체의 내용이 업데이트 될 수도 있습니다. 
# main 함수는 여러 줄의 명령어를 한 세트로 실행 가능하도록 정의되었으므로,
# 반드시 모든 명령어는 main 함수 내에 작성해야 문제가 발생하지않습니다.

main() {
    cd "$(dirname "$0")/.."

    COMPOSE="docker compose -f docker-compose.yml"

    [ -f .env ] || {
        echo "[DEPLOY] .env 가 없습니다. 저장소 루트에서 실행하십시오." >&2
        exit 1
    }

    # .env 는 shell script 가 아니므로 source 하지 않고 값만 꺼냅니다.
    db_user=$(env_value POSTGRES_USER)
    db_name=$(env_value POSTGRES_DB)
    backup_dir=$(env_value BACKUP_DIR)
    backup_dir=${backup_dir:-./backups}

    echo "[DEPLOY] 1/5 github repository에서 pull을 진행합니다."
    git pull

    echo "[DEPLOY] 2/5 Docker image를 빌드합니다."
    $COMPOSE build

    echo "[DEPLOY] 3/5 업데이트 전 데이터베이스 백업을 진행합니다."
    # pg_dump 가 쓰는 exec 는 up 되어 있는 컨테이너에만 적용됩니다.
    $COMPOSE up -d db
    take_backup "$db_user" "$db_name" "$backup_dir"

    echo "[DEPLOY] 4/5 데이터베이스 마이그레이션을 진행합니다."
    $COMPOSE run --rm api alembic upgrade head

    echo "[DEPLOY] 5/5 Docker Compose를 진행하여 업데이트를 마무리합니다."
    $COMPOSE up -d

    echo "[DEPLOY] 업데이트가 완료되었습니다."
}

# .env 에서 데이터베이스 키를 읽습니다.
# 같은 키가 여러 번 정의되어 있을 경우 마지막 값을 최우선으로 사용합니다.
env_value() {
    sed -n "s/^$1=//p" .env | tail -n 1
}

# 백업 파일을 만들지 못하면 exit 1 로 스크립트를 종료하고,
# 이 아래의 alembic upgrade head 는 실행되지 않습니다. 
take_backup() {
    user=$1
    name=$2
    out=$3

    mkdir -p "$out"
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    raw="$out/pre-migrate-$stamp.sql"

    if ! $COMPOSE exec -T db pg_dump --clean --if-exists -U "$user" -d "$name" > "$raw"; then
        rm -f "$raw"
        echo "[DEPLOY] 백업을 실행하지 못했습니다. 데이터베이스 마이그레이션을 적용하지 않고 종료합니다." >&2
        exit 1
    fi

    gzip "$raw"
    echo "[DEPLOY] $raw.gz"
}

main "$@"
