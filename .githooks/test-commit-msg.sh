#!/usr/bin/env bash
# commit-msg 훅이 커밋 메시지를 올바르게 거부하고 통과시키는지 테스트합니다.
# 실행: bash .githooks/test-commit-msg.sh   (저장소 루트에서)

HOOK="$(dirname "$0")/commit-msg"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

passed=0
failed=0

# $1 은 테스트 이름, $2 는 메시지, $3 은 기대 결과(pass 또는 reject)입니다.
expect() {
    local name="$1" msg="$2" want="$3" got
    printf '%s' "$msg" > "$TMP/msg"
    if bash "$HOOK" "$TMP/msg" >/dev/null 2>&1; then got=pass; else got=reject; fi
    if [ "$got" = "$want" ]; then
        passed=$((passed + 1))
        return 0
    fi
    if [ "$want" = pass ]; then
        echo "실패: [$name] 통과해야 하는 메시지가 거부되었습니다"
    else
        echo "실패: [$name] 거부해야 하는 메시지가 통과되었습니다"
    fi
    echo "      메시지: $(printf '%s' "$msg" | head -1)"
    failed=$((failed + 1))
}

# ── 통과 ────────────────────────────────────────────────────
expect "허용 scope + 요약" \
    "scheduling: add auto-assignment core with OR-Tools" pass

expect "다른 허용 scope" \
    "docs: add base README" pass

expect "빈 줄 뒤에 본문이 있는 경우" \
    "infra: split dev and prod image stages

배포 Docker image 에는 테스트 도구가 포함되지 않습니다." pass

expect "요약에 콜론이 1개 더 있는 경우" \
    "backend: fix room capacity: off-by-one" pass

expect "주석 줄은 무시" \
    "test: add boundary cases
# 이 줄은 git 이 추가하는 주석이라 검사 대상이 아닙니다" pass

expect "Merge 커밋은 통과" \
    "Merge branch 'develop' into feature/rooms" pass

expect "Revert 커밋은 통과" \
    "Revert \"scheduling: add auto-assignment core\"" pass

# ── 거부 ────────────────────────────────────────────────────
expect "scope 가 없는 경우" \
    "Initial commit" reject

expect "목록에 없는 scope" \
    "unknown: do something" reject

expect "콜론 뒤에 공백이 없는 경우" \
    "scheduling:add auto-assignment core" reject

expect "요약이 비어 있는 경우" \
    "scheduling: " reject

expect "본문이 빈 줄 없이 이어진 경우" \
    "scheduling: add core
빈 줄 없이 본문이 이어집니다" reject

expect "메시지가 비어 있는 경우" \
    "" reject

expect "scope 에 대문자가 있는 경우" \
    "Scheduling: add core" reject

# ── 결과 ────────────────────────────────────────────────────
echo "----------------------------------------"
echo "통과 $passed / 실패 $failed"
[ "$failed" -eq 0 ]
