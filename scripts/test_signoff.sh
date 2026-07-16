#!/usr/bin/env bash
# test_signoff.sh — prove the human sign-off gate (separation of duties) end to end.
set -uo pipefail
export AWS_PAGER=""
SELF="$(cd "$(dirname "$0")" && pwd)"; PROJ="$(cd "$SELF/.." && pwd)"
source "$PROJ/spine-state.env"
CLIENT="$PROJ/tools/mcp_client.py"
ICSR="ICSR-2026-0777"
pass=0; fail=0
ok(){ echo "  PASS | $1"; pass=$((pass+1)); }
no(){ echo "  FAIL | $1"; fail=$((fail+1)); }
# parse a JSON field from stdin (avoids MSYS mangling of JSON passed as an argv)
jget(){ tr -d '\r' | python -c "import sys,json;print(json.load(sys.stdin).get('$1',''))" 2>/dev/null; }
approve(){ # $1 approver -> prints lambda return JSON
  aws lambda invoke --function-name pv-approve --cli-binary-format raw-in-base64-out \
    --payload "{\"icsr_id\":\"$ICSR\",\"approver\":\"$1\"}" --region "$REGION" /tmp/_appr.json >/dev/null 2>&1
  cat /tmp/_appr.json; }

REV="$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=reviewer,PASSWORD=${PV_REVIEWER_PW:-ChangeMe-Reviewer1!}" --region "$REGION" \
  --query 'AuthenticationResult.AccessToken' --output text)"

echo "=== human sign-off gate (separation of duties) ==="
# 1. reviewer requests sign-off via the governed tool -> starts the workflow
RS="$(python "$CLIENT" "$GW_URL" "$REV" "request-signoff___request_signoff" "{\"icsr_id\":\"$ICSR\",\"requester\":\"reviewer\"}")"
echo "  request_signoff -> $RS"
# mcp_client truncates its printed result for readability, so grep the ARN out (it appears early)
# rather than json-parsing a possibly-cut-off object.
EXEC="$(printf '%s' "$RS" | tr -d '\r' | grep -o 'arn:aws:states:[A-Za-z0-9:_-]*' | head -1)"
[ -n "$EXEC" ] && ok "request_signoff started workflow ($EXEC)" || no "request_signoff did not start workflow"

# 2. wait for the pending approval token to be registered
for i in $(seq 1 15); do
  ST="$(aws dynamodb get-item --table-name pv-pending-approvals --key "{\"icsr_id\":{\"S\":\"$ICSR\"}}" --region "$REGION" --query "Item.status.S" --output text 2>/dev/null)"
  [ "$ST" = "PENDING" ] && break; sleep 2
done
[ "$ST" = "PENDING" ] && ok "workflow paused at human gate (PENDING)" || no "no pending approval appeared (status=$ST)"

# 3. NEGATIVE: the requester tries to approve their own submission -> denied (SoD)
SELF_APP="$(approve reviewer)"
echo "  self-approve -> $SELF_APP"
if [ "$(printf '%s' "$SELF_APP" | jget approved)" = "False" ] && echo "$SELF_APP" | grep -qi 'separation-of-duties'; then
  ok "self-approval blocked (separation of duties)"; else no "self-approval was NOT blocked -> $SELF_APP"; fi

# 4. execution must still be RUNNING (not finalized)
sleep 2
RUN="$(aws stepfunctions describe-execution --execution-arn "$EXEC" --region "$REGION" --query status --output text 2>/dev/null)"
[ "$RUN" = "RUNNING" ] && ok "still awaiting a valid approver (RUNNING)" || no "unexpected status after self-approve: $RUN"

# 5. POSITIVE: a DIFFERENT qualified person approves
APP="$(approve approver)"
echo "  approver-approve -> $APP"
[ "$(printf '%s' "$APP" | jget approved)" = "True" ] && ok "approved by a different qualified person" || no "valid approval failed -> $APP"

# 6. execution should finalize -> SUCCEEDED
for i in $(seq 1 15); do
  S="$(aws stepfunctions describe-execution --execution-arn "$EXEC" --region "$REGION" --query status --output text 2>/dev/null)"
  [ "$S" != "RUNNING" ] && break; sleep 2
done
[ "$S" = "SUCCEEDED" ] && ok "workflow finalized (SUCCEEDED)" || no "workflow did not succeed (status=$S)"

# 7. single-use: re-approving the consumed request is rejected
RE="$(approve approver)"
if [ "$(printf '%s' "$RE" | jget approved)" = "False" ]; then ok "re-approval rejected (single-use)"; else no "re-approval NOT rejected -> $RE"; fi

# 8. a COMMITTED audit record exists for this ICSR
CN="$(aws dynamodb scan --table-name pv-audit --region "$REGION" \
  --filter-expression "icsr_id = :i AND phase = :p" \
  --expression-attribute-values "{\":i\":{\"S\":\"$ICSR\"},\":p\":{\"S\":\"COMMITTED\"}}" \
  --select COUNT --query Count --output text 2>/dev/null)"
[ "$CN" -ge 1 ] 2>/dev/null && ok "COMMITTED audit record written ($CN)" || no "no COMMITTED audit record (count=$CN)"

echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] && echo "SIGNOFF TEST: PASS" || { echo "SIGNOFF TEST: FAIL"; exit 1; }
