#!/bin/sh
# 데이터베이스와 첨부파일을 백업해 host 폴더에 저장합니다.
#   인자 없음:        BACKUP_INTERVAL_HOURS 마다 반복합니다. docker-compose.yml 의 backup service 가 실행합니다.
#   once <파일이름>:  데이터베이스만 1회 백업하고 종료합니다. banblit.sh 가 migration 직전에 실행합니다.
# 복원 방법은 COMMAND.md 11장에 작성되어 있는 내용을 기준으로 합니다.

set -eu

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-6}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
# pg_dump 와 tar 1회의 제한 시간(초)입니다. 초과하면 실패로 처리하고 .part 파일을 삭제합니다.
STEP_TIMEOUT="${BACKUP_STEP_TIMEOUT:-1800}"
OUT=/backups
ATTACHMENTS=/attachments

mkdir -p "$OUT"

# 데이터베이스를 $1.sql.gz 로 저장합니다. 저장이 중단된 .part 파일은 삭제합니다.
# pg_dump 와 gzip 을 pipe 로 잇지 않습니다. sh 에는 pipefail 이 없어 pg_dump 실패가 gzip 성공에 가려집니다.
# --clean --if-exists 를 지정하면 복원할 때 빈 데이터베이스가 아니어도 덮어씁니다.
dump_db() {
    if timeout "$STEP_TIMEOUT" pg_dump --clean --if-exists -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$OUT/$1.sql.part" \
        && gzip -f "$OUT/$1.sql.part"; then
        mv "$OUT/$1.sql.part.gz" "$OUT/$1.sql.gz"
        echo "[backup] $1.sql.gz"
    else
        rm -f "$OUT/$1.sql.part" "$OUT/$1.sql.part.gz"
        echo "[backup] 데이터베이스 백업에 실패했습니다" >&2
        return 1
    fi
}

# 첨부파일 폴더를 $1.tar.gz 로 저장합니다. 데이터베이스에는 파일 이름만 있고 내용은 이 폴더에 있습니다.
dump_files() {
    [ -d "$ATTACHMENTS" ] || return 0
    if timeout "$STEP_TIMEOUT" tar -czf "$OUT/$1.tar.gz.part" -C "$ATTACHMENTS" .; then
        mv "$OUT/$1.tar.gz.part" "$OUT/$1.tar.gz"
        echo "[backup] $1.tar.gz"
    else
        rm -f "$OUT/$1.tar.gz.part"
        echo "[backup] 첨부파일 백업에 실패했습니다" >&2
        return 1
    fi
}

if [ "${1:-}" = "once" ]; then
    dump_db "${2:?백업 파일 이름이 필요합니다}"
    exit 0
fi

while true; do
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    dump_db "db-$stamp" || true
    dump_files "files-$stamp" || true

    # KEEP_DAYS 가 지난 백업을 삭제합니다.
    find "$OUT" -name 'db-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
    find "$OUT" -name 'files-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

    sleep "$((INTERVAL_HOURS * 3600))"
done
