#!/usr/bin/env bash
# commit-msg 훅이 커밋 메시지를 제대로 걸러내는지 검사한다.
#
# 실행: bash .githooks/test-commit-msg.sh   (저장소 루트에서)

HOOK="$(dirname "$0")/commit-msg"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

passed=0
failed=0

# 메시지가 통과해야 하는 경우
expect_pass() {
    local name="$1" msg="$2"
    printf '%s' "$msg" > "$TMP/msg"
    if bash "$HOOK" "$TMP/msg" >/dev/null 2>&1; then
        passed=$((passed + 1))
    else
        echo "실패: [$name] 통과해야 하는데 거부됨"
        echo "      메시지: $(printf '%s' "$msg" | head -1)"
        failed=$((failed + 1))
    fi
}

# 메시지가 거부되어야 하는 경우
expect_reject() {
    local name="$1" msg="$2"
    printf '%s' "$msg" > "$TMP/msg"
    if bash "$HOOK" "$TMP/msg" >/dev/null 2>&1; then
        echo "실패: [$name] 거부해야 하는데 통과됨"
        echo "      메시지: $(printf '%s' "$msg" | head -1)"
        failed=$((failed + 1))
    else
        passed=$((passed + 1))
    fi
}

# ── 통과해야 하는 것 ────────────────────────────────────────
expect_pass "허용 scope + 요약" \
    "scheduling: add auto-assignment core with OR-Tools"

expect_pass "다른 허용 scope" \
    "docs: add base README"

expect_pass "빈 줄 뒤에 본문이 붙은 경우" \
    "infra: split dev and prod image stages

배포단에는 테스트 도구가 들어가지 않는다."

expect_pass "요약에 콜론이 한 번 더 들어간 경우" \
    "backend: fix room capacity: off-by-one"

expect_pass "주석 줄은 무시한다" \
    "test: add boundary cases
# 이 줄은 git이 붙이는 주석이라 검사 대상이 아니다"

expect_pass "병합 커밋은 그대로 통과시킨다" \
    "Merge branch 'develop' into feature/rooms"

expect_pass "되돌리기 커밋은 그대로 통과시킨다" \
    "Revert \"scheduling: add auto-assignment core\""

# ── 거부되어야 하는 것 ──────────────────────────────────────
expect_reject "scope가 아예 없는 경우" \
    "Initial commit"

expect_reject "목록에 없는 scope" \
    "unknown: do something"

expect_reject "콜론 뒤에 공백이 없는 경우" \
    "scheduling:add auto-assignment core"

expect_reject "요약이 비어 있는 경우" \
    "scheduling: "

expect_reject "본문이 빈 줄 없이 붙은 경우" \
    "scheduling: add core
빈 줄 없이 바로 본문이 왔다"

expect_reject "메시지가 통째로 비어 있는 경우" \
    ""

expect_reject "scope에 대문자가 섞인 경우" \
    "Scheduling: add core"

# ── 결과 ────────────────────────────────────────────────────
echo "----------------------------------------"
echo "통과 $passed / 실패 $failed"
[ "$failed" -eq 0 ]
