#!/usr/bin/env bash
# commit-msg 훅이 커밋 메시지를 올바르게 거부·통과시키는지 테스트합니다.
# 실행: bash .githooks/test-commit-msg.sh   (저장소 루트에서)

HOOK="$(dirname "$0")/commit-msg"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

passed=0
failed=0

# 통과해야 하는 메시지
expect_pass() {
    local name="$1" msg="$2"
    printf '%s' "$msg" > "$TMP/msg"
    if bash "$HOOK" "$TMP/msg" >/dev/null 2>&1; then
        passed=$((passed + 1))
    else
        echo "실패: [$name] 통과해야 하는 메시지가 거부되었습니다"
        echo "      메시지: $(printf '%s' "$msg" | head -1)"
        failed=$((failed + 1))
    fi
}

# 거부되어야 하는 메시지
expect_reject() {
    local name="$1" msg="$2"
    printf '%s' "$msg" > "$TMP/msg"
    if bash "$HOOK" "$TMP/msg" >/dev/null 2>&1; then
        echo "실패: [$name] 거부해야 하는 메시지가 통과되었습니다"
        echo "      메시지: $(printf '%s' "$msg" | head -1)"
        failed=$((failed + 1))
    else
        passed=$((passed + 1))
    fi
}

# ── 통과 ────────────────────────────────────────────────────
expect_pass "허용 scope + 요약" \
    "scheduling: add auto-assignment core with OR-Tools"

expect_pass "다른 허용 scope" \
    "docs: add base README"

expect_pass "빈 줄 뒤에 본문이 있는 경우" \
    "infra: split dev and prod image stages

배포 image 에는 테스트 도구가 포함되지 않습니다."

expect_pass "요약에 콜론이 1개 더 있는 경우" \
    "backend: fix room capacity: off-by-one"

expect_pass "주석 줄은 무시" \
    "test: add boundary cases
# 이 줄은 git 이 추가하는 주석이라 검사 대상이 아닙니다"

expect_pass "병합 커밋은 통과" \
    "Merge branch 'develop' into feature/rooms"

expect_pass "되돌리기 커밋은 통과" \
    "Revert \"scheduling: add auto-assignment core\""

# ── 거부 ────────────────────────────────────────────────────
expect_reject "scope 가 없는 경우" \
    "Initial commit"

expect_reject "목록에 없는 scope" \
    "unknown: do something"

expect_reject "콜론 뒤에 공백이 없는 경우" \
    "scheduling:add auto-assignment core"

expect_reject "요약이 비어 있는 경우" \
    "scheduling: "

expect_reject "본문이 빈 줄 없이 이어진 경우" \
    "scheduling: add core
빈 줄 없이 본문이 이어집니다"

expect_reject "메시지가 비어 있는 경우" \
    ""

expect_reject "scope 에 대문자가 있는 경우" \
    "Scheduling: add core"

# ── 결과 ────────────────────────────────────────────────────
echo "----------------------------------------"
echo "통과 $passed / 실패 $failed"
[ "$failed" -eq 0 ]
