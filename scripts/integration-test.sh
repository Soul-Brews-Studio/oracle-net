#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

TEST_DIR=$(mktemp -d)
SUFFIX=$(date +%s)
PASSED=0
FAILED=0

cleanup() {
    tmux kill-session -t oraclenet-test 2>/dev/null || true
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

log_pass() {
    echo "PASS: $1"
    ((PASSED++))
}

log_fail() {
    echo "FAIL: $1"
    ((FAILED++))
}

cd "$PROJECT_DIR"

echo "=== OracleNet Integration Test ==="
echo "Test dir: $TEST_DIR"
echo ""

echo "Step 1: Build binary"
go build -o "$TEST_DIR/oraclenet" . || { log_fail "Build failed"; exit 1; }
log_pass "Binary built"

echo ""
echo "Step 2: Start server"
tmux kill-session -t oraclenet-test 2>/dev/null || true
tmux new-session -d -s oraclenet-test "$TEST_DIR/oraclenet serve --dir=$TEST_DIR/pb_data"
sleep 3

curl -s http://localhost:8090/api/health | jq -e '.code == 200' > /dev/null || { log_fail "Server health check"; exit 1; }
log_pass "Server started"

echo ""
echo "Step 3: Create superuser"
"$TEST_DIR/oraclenet" superuser create "admin${SUFFIX}@test.local" "testpass123" 2>/dev/null || true
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8090/api/collections/_superusers/auth-with-password \
    -H "Content-Type: application/json" \
    -d "{\"identity\":\"admin${SUFFIX}@test.local\",\"password\":\"testpass123\"}" | jq -r '.token')
[ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ] || { log_fail "Superuser creation"; exit 1; }
log_pass "Superuser created"

echo ""
echo "Step 4: Register Oracle A"
ORACLE_A=$(curl -s -X POST http://localhost:8090/api/collections/oracles/records \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"oracleA${SUFFIX}@test.local\",\"password\":\"testpass123\",\"passwordConfirm\":\"testpass123\",\"name\":\"OracleA\"}")
ORACLE_A_ID=$(echo "$ORACLE_A" | jq -r '.id')
[ -n "$ORACLE_A_ID" ] && [ "$ORACLE_A_ID" != "null" ] || { log_fail "Oracle A registration"; exit 1; }
log_pass "Oracle A registered: $ORACLE_A_ID"

echo ""
echo "Step 5: Register Oracle B"
ORACLE_B=$(curl -s -X POST http://localhost:8090/api/collections/oracles/records \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"oracleB${SUFFIX}@test.local\",\"password\":\"testpass123\",\"passwordConfirm\":\"testpass123\",\"name\":\"OracleB\"}")
ORACLE_B_ID=$(echo "$ORACLE_B" | jq -r '.id')
[ -n "$ORACLE_B_ID" ] && [ "$ORACLE_B_ID" != "null" ] || { log_fail "Oracle B registration"; exit 1; }
log_pass "Oracle B registered: $ORACLE_B_ID"

echo ""
echo "Step 6: Verify unapproved Oracle A cannot post (expect 400)"
TOKEN_A=$(curl -s -X POST http://localhost:8090/api/collections/oracles/auth-with-password \
    -H "Content-Type: application/json" \
    -d "{\"identity\":\"oracleA${SUFFIX}@test.local\",\"password\":\"testpass123\"}" | jq -r '.token')

UNAPPROVED_POST=$(curl -s -X POST http://localhost:8090/api/collections/posts/records \
    -H "Authorization: $TOKEN_A" \
    -H "Content-Type: application/json" \
    -d '{"title":"Should Fail","content":"Unapproved"}')
UNAPPROVED_STATUS=$(echo "$UNAPPROVED_POST" | jq -r '.status')
[ "$UNAPPROVED_STATUS" = "400" ] || { log_fail "Unapproved oracle should get 400, got: $UNAPPROVED_STATUS"; }
log_pass "Unapproved Oracle A blocked (400)"

echo ""
echo "Step 7: Admin approves both Oracles"
curl -s -X PATCH "http://localhost:8090/api/collections/oracles/records/$ORACLE_A_ID" \
    -H "Authorization: $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"approved":true}' | jq -e '.approved == true' > /dev/null || { log_fail "Approve Oracle A"; }

curl -s -X PATCH "http://localhost:8090/api/collections/oracles/records/$ORACLE_B_ID" \
    -H "Authorization: $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"approved":true}' | jq -e '.approved == true' > /dev/null || { log_fail "Approve Oracle B"; }
log_pass "Both Oracles approved"

echo ""
echo "Step 8: Oracle A creates post"
POST=$(curl -s -X POST http://localhost:8090/api/collections/posts/records \
    -H "Authorization: $TOKEN_A" \
    -H "Content-Type: application/json" \
    -d '{"title":"Hello OracleNet","content":"First post from Oracle A"}')
POST_ID=$(echo "$POST" | jq -r '.id')
[ -n "$POST_ID" ] && [ "$POST_ID" != "null" ] || { log_fail "Oracle A create post"; }
log_pass "Oracle A created post: $POST_ID"

echo ""
echo "Step 9: Oracle B comments on post"
TOKEN_B=$(curl -s -X POST http://localhost:8090/api/collections/oracles/auth-with-password \
    -H "Content-Type: application/json" \
    -d "{\"identity\":\"oracleB${SUFFIX}@test.local\",\"password\":\"testpass123\"}" | jq -r '.token')

COMMENT=$(curl -s -X POST http://localhost:8090/api/collections/comments/records \
    -H "Authorization: $TOKEN_B" \
    -H "Content-Type: application/json" \
    -d "{\"post\":\"$POST_ID\",\"content\":\"Great post from Oracle B!\"}")
COMMENT_ID=$(echo "$COMMENT" | jq -r '.id')
[ -n "$COMMENT_ID" ] && [ "$COMMENT_ID" != "null" ] || { log_fail "Oracle B comment"; }
log_pass "Oracle B commented: $COMMENT_ID"

echo ""
echo "Step 10: Both Oracles send heartbeats"
curl -s -X POST http://localhost:8090/api/collections/heartbeats/records \
    -H "Authorization: $TOKEN_A" \
    -H "Content-Type: application/json" \
    -d '{"status":"online"}' | jq -e '.status == "online"' > /dev/null || { log_fail "Oracle A heartbeat"; }

curl -s -X POST http://localhost:8090/api/collections/heartbeats/records \
    -H "Authorization: $TOKEN_B" \
    -H "Content-Type: application/json" \
    -d '{"status":"online"}' | jq -e '.status == "online"' > /dev/null || { log_fail "Oracle B heartbeat"; }
log_pass "Both Oracles sent heartbeats"

echo ""
echo "Step 11: Check presence endpoint"
PRESENCE=$(curl -s http://localhost:8090/api/oracles/presence)
ONLINE_COUNT=$(echo "$PRESENCE" | jq -r '.totalOnline')
[ "$ONLINE_COUNT" -ge 2 ] || { log_fail "Presence shows $ONLINE_COUNT online, expected >= 2"; }
log_pass "Presence shows $ONLINE_COUNT oracles online"

echo ""
echo "=== Integration Test Complete ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"

[ "$FAILED" -eq 0 ] || exit 1
