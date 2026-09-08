#!/bin/sh
# 데이터베이스와 첨부파일을 주기적으로 한 벌씩 떠서 host 폴더에 남긴다.
#
# 이것이 필요한 이유는 배포하면 데이터가 이름 붙은 volume 안에만 있기 때문이다.
# volume 은 컨테이너를 다시 만들어도 남지만, 서버가 죽거나 volume 을 지우면 함께 간다.
#
# 되살리는 방법은 COMMAND.md 가 정본이다.

set -eu

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-6}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
OUT=/backups
ATTACHMENTS=/attachments

mkdir -p "$OUT"

while true; do
    stamp=$(date -u +%Y%m%dT%H%M%SZ)

    # --clean --if-exists 를 붙여 두면 되살릴 때 빈 데이터베이스가 아니어도 덮어쓴다.
    if pg_dump --clean --if-exists -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        | gzip > "$OUT/db-$stamp.sql.gz.part"; then
        mv "$OUT/db-$stamp.sql.gz.part" "$OUT/db-$stamp.sql.gz"
        echo "[backup] db-$stamp.sql.gz"
    else
        # 반쯤 쓰다 만 파일을 남기지 않는다. 다음 주기에 다시 뜬다.
        rm -f "$OUT/db-$stamp.sql.gz.part"
        echo "[backup] 데이터베이스를 뜨지 못했습니다" >&2
    fi

    # 게시판 첨부파일. 데이터베이스에는 파일 이름만 있고 알맹이는 여기 있다.
    if [ -d "$ATTACHMENTS" ]; then
        if tar -czf "$OUT/files-$stamp.tar.gz.part" -C "$ATTACHMENTS" .; then
            mv "$OUT/files-$stamp.tar.gz.part" "$OUT/files-$stamp.tar.gz"
            echo "[backup] files-$stamp.tar.gz"
        else
            rm -f "$OUT/files-$stamp.tar.gz.part"
            echo "[backup] 첨부파일을 뜨지 못했습니다" >&2
        fi
    fi

    # 오래된 것을 지운다. 지우는 것은 뜨는 데 성공한 뒤에만 한다.
    find "$OUT" -name 'db-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
    find "$OUT" -name 'files-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

    sleep "$((INTERVAL_HOURS * 3600))"
done
