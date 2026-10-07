#!/bin/sh
# 데이터베이스와 첨부파일을 주기적으로 백업해 host 폴더에 저장합니다.
# 복원 방법은 COMMAND.md 11장에 작성되어 있는 내용을 기준으로 합니다.

set -eu

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-6}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
OUT=/backups
ATTACHMENTS=/attachments

mkdir -p "$OUT"

while true; do
    stamp=$(date -u +%Y%m%dT%H%M%SZ)

    # --clean --if-exists 를 지정하면 복원할 때 빈 데이터베이스가 아니어도 덮어씁니다.
    if pg_dump --clean --if-exists -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        | gzip > "$OUT/db-$stamp.sql.gz.part"; then
        mv "$OUT/db-$stamp.sql.gz.part" "$OUT/db-$stamp.sql.gz"
        echo "[backup] db-$stamp.sql.gz"
    else
        # 저장이 중단된 .part 파일은 삭제합니다. 다음 주기에 다시 백업합니다.
        rm -f "$OUT/db-$stamp.sql.gz.part"
        echo "[backup] 데이터베이스 백업에 실패했습니다" >&2
    fi

    # 게시판 첨부파일입니다. 데이터베이스에는 파일 이름만 있고 내용은 이 폴더에 있습니다.
    if [ -d "$ATTACHMENTS" ]; then
        if tar -czf "$OUT/files-$stamp.tar.gz.part" -C "$ATTACHMENTS" .; then
            mv "$OUT/files-$stamp.tar.gz.part" "$OUT/files-$stamp.tar.gz"
            echo "[backup] files-$stamp.tar.gz"
        else
            rm -f "$OUT/files-$stamp.tar.gz.part"
            echo "[backup] 첨부파일 백업에 실패했습니다" >&2
        fi
    fi

    # KEEP_DAYS 가 지난 백업을 삭제합니다.
    find "$OUT" -name 'db-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
    find "$OUT" -name 'files-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

    sleep "$((INTERVAL_HOURS * 3600))"
done
