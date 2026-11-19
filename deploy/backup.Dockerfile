# 정기 백업 전용 Docker image 입니다. db 와 같은 PostgreSQL Docker image 에 deploy/backup.sh 를 복사합니다.
# pg_dump 버전이 db 와 같아야 하므로 태그는 docker-compose.yml 의 db service 와 같은 값이어야 합니다.
# docker-compose.yml 의 backup service 가 build 합니다.
FROM postgres:17
COPY backup.sh /backup.sh
ENTRYPOINT ["/bin/sh", "/backup.sh"]
