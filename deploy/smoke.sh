#!/usr/bin/env bash
#
# 배포 구성의 reverse proxy 가 요청을 규칙대로 처리하는지 확인합니다.
#
#   인자 없음:    http://127.0.0.1:8080 을 확인합니다.
#   <주소>:       그 주소를 확인합니다.
#
# .github/workflows/checks.yml 의 deploy-images job 이 실행합니다. 실패한 항목이 1개 이상이면 1 로 종료합니다.

set -uo pipefail

BASE="${1:-http://127.0.0.1:8080}"
# 첨부파일 1개의 상한(300MiB)입니다. deploy/Caddyfile 의 request_body max_size, 화면의 MAX_ATTACHMENT_BYTES 와 같은 값을 기준으로 합니다.
LIMIT_BYTES=$(( 300 * 1024 * 1024 ))
failed=0

expect() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    printf '   ok    %s\n' "$name"
  else
    printf '   FAIL  %s — 기대값 %s, 실제값 %s\n' "$name" "$expected" "$actual"
    failed=1
  fi
}

status_of() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

index="$(curl -s "$BASE/")"
expect '/ 가 화면을 반환합니다' 'yes' "$(grep -q 'id="root"' <<<"$index" && echo yes || echo no)"
expect '화면 경로를 직접 요청해도 화면을 반환합니다' 'yes' \
  "$(curl -s "$BASE/scheduler" | grep -q 'id="root"' && echo yes || echo no)"
expect '존재하지 않는 /images/ 파일은 404 입니다' '404' "$(status_of "$BASE/images/missing.png")"

asset="$(grep -o '/assets/[^"]*\.js' <<<"$index" | head -n1)"
# header 를 변수에 먼저 담습니다. curl 출력을 grep -q 로 바로 넘기면 grep 이 먼저 끝나 pipefail 이 curl 의 SIGPIPE 를 실패로 반환합니다.
headers="$(curl -s -D - -o /dev/null "$BASE$asset")"
expect '/assets/ 파일은 1년 cache 입니다' 'yes' \
  "$(grep -qi '^cache-control:.*immutable' <<<"$headers" && echo yes || echo no)"

expect '/api 를 삭제하고 api 로 전달합니다' '200' "$(status_of "$BASE/api/health")"
upload_status() { head -c "$1" /dev/zero | status_of -X POST --data-binary @- "$BASE/api/posts/1/attachments"; }
# 상한과 같은 크기는 api 까지 전달되어 로그인 검사(401)를 받습니다.
expect '상한과 같은 크기의 첨부파일은 api 로 전달됩니다' 'yes' "$([ "$(upload_status "$LIMIT_BYTES")" != 413 ] && echo yes || echo no)"
expect '상한을 넘는 첨부파일은 413 입니다' '413' "$(upload_status $(( LIMIT_BYTES + 1 )))"
missing_headers="$(curl -s -D - -o /dev/null "$BASE/assets/missing.js")"
expect '존재하지 않는 /assets/ 파일은 cache 하지 않습니다' 'no' \
  "$(grep -qi '^cache-control:.*immutable' <<<"$missing_headers" && echo yes || echo no)"

exit "$failed"
