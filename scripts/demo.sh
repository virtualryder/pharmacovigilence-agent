#!/usr/bin/env bash
# demo.sh — prove the governance model live: deny-by-default + the two compliance forbids.
set -uo pipefail
export AWS_PAGER=""
SELF="$(cd "$(dirname "$0")" && pwd)"; PROJ="$(cd "$SELF/.." && pwd)"
source "$PROJ/spine-state.env"
CLIENT="$PROJ/tools/mcp_client.py"
tok(){ aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH --client-id "$CLIENT_ID" \
        --auth-parameters "USERNAME=$1,PASSWORD=$2" --region "$REGION" \
        --query 'AuthenticationResult.AccessToken' --output text; }
REV="$(tok reviewer "${PV_REVIEWER_PW:-ChangeMe-Reviewer1!}")"
OUT="$(tok outsider "${PV_OUTSIDER_PW:-ChangeMe-Outsider1!}")"
# Fully-qualified tool ids (<target>___<tool>) so a denial returns the named-policy message
# even when the tool is hidden from the caller's tools/list.
T_OPENFDA="openfda-lookup___openfda_lookup"
T_MASK="mask-phi___mask_phi"
T_DRAFT="pv-core___draft_narrative"
T_AUDIT="write-audit___write_audit"
T_FINAL="pv-core___finalize_submission"
T_SERIOUS="assess-seriousness___assess_seriousness"
pass=0; fail=0
check(){ local got="${3%% *}"
  if [ "$got" = "$2" ]; then echo "  PASS | $1 -> $3"; pass=$((pass+1))
  else echo "  FAIL | $1 (expected $2) -> $3"; fail=$((fail+1)); fi; }
echo "=== deny-by-default (identity -> Cedar) ==="
check "reviewer  openfda_lookup"          ALLOW "$(python "$CLIENT" "$GW_URL" "$REV" "$T_OPENFDA" '{"drug":"lisinopril"}')"
check "outsider  openfda_lookup"          DENY  "$(python "$CLIENT" "$GW_URL" "$OUT" "$T_OPENFDA" '{"drug":"lisinopril"}')"
echo "=== real de-identification (mask_phi via Comprehend Medical, fail-closed) ==="
MASK_IN='{"case":"Patient John Smith, DOB 04/12/1972, MRN 55512345, reported acute kidney injury after taking lisinopril."}'
MASK_OUT="$(python "$CLIENT" "$GW_URL" "$REV" "$T_MASK" "$MASK_IN")"
check "reviewer  mask_phi"                 ALLOW "$MASK_OUT"
if echo "$MASK_OUT" | grep -q 'REDACTED' && ! echo "$MASK_OUT" | grep -q 'John Smith'; then
  echo "  PASS | mask_phi redacted PHI (name removed, redaction markers present)"; pass=$((pass+1))
else
  echo "  FAIL | mask_phi did NOT redact PHI -> $MASK_OUT"; fail=$((fail+1))
fi
echo "=== forbid: mask-before-model ==="
check "reviewer  draft (UN-masked)"       DENY  "$(python "$CLIENT" "$GW_URL" "$REV" "$T_DRAFT" '{"case":"x","deidentified":false}')"
DRAFT_IN='{"case":"Reporter: treating nephrologist. Patient [REDACTED:NAME], [REDACTED:AGE], started lisinopril 10mg daily for hypertension on [REDACTED:DATE]. Within ~2 weeks developed rhabdomyolysis and acute kidney injury; hospitalized, drug withdrawn, renal function recovering. Reporter assessed the event as serious and probably related.","deidentified":true}'
DRAFT_OUT="$(python "$CLIENT" "$GW_URL" "$REV" "$T_DRAFT" "$DRAFT_IN")"
check "reviewer  draft (de-identified)"   ALLOW "$DRAFT_OUT"
if echo "$DRAFT_OUT" | grep -qE '"chars": *[1-9]' && ! echo "$DRAFT_OUT" | grep -q '"error"'; then
  echo "  PASS | draft_narrative produced a real Bedrock narrative (no model error)"; pass=$((pass+1))
else
  echo "  FAIL | draft_narrative did not return a narrative -> $DRAFT_OUT"; fail=$((fail+1))
fi
if echo "$DRAFT_OUT" | grep -q '"guardrail_applied": *true'; then
  echo "  PASS | draft passed through the fail-closed Bedrock OUTPUT guardrail"; pass=$((pass+1))
else
  echo "  FAIL | output guardrail not applied to the draft -> $DRAFT_OUT"; fail=$((fail+1))
fi
echo "=== seriousness + reporting clock (assess_seriousness; mask-before enforced) ==="
check "reviewer  assess (UN-masked)"      DENY  "$(python "$CLIENT" "$GW_URL" "$REV" "$T_SERIOUS" '{"case":"x","deidentified":false}')"
SER_IN='{"case":"Patient [REDACTED:NAME], [REDACTED:AGE], developed rhabdomyolysis and acute kidney injury after lisinopril; hospitalized, drug withdrawn.","deidentified":true,"expectedness":"unlisted"}'
SER_OUT="$(python "$CLIENT" "$GW_URL" "$REV" "$T_SERIOUS" "$SER_IN")"
check "reviewer  assess (de-identified)"  ALLOW "$SER_OUT"
if echo "$SER_OUT" | grep -q '"serious": *true' && echo "$SER_OUT" | grep -q 'EXPEDITED'; then
  echo "  PASS | assess_seriousness returned serious=true + a reporting clock (expedited)"; pass=$((pass+1))
else
  echo "  FAIL | assess_seriousness did not return a determination -> $SER_OUT"; fail=$((fail+1))
fi
echo "=== immutable WORM audit (write_audit: append-only ledger + S3 Object Lock) ==="
# unique per run so the "1st write" is always fresh (stored:true); the immediate re-write below
# uses the SAME record to prove append-only (stored:false).
NONCE="$(date +%s)$RANDOM"
AUDIT_IN="{\"icsr_id\":\"ICSR-2026-0002\",\"action\":\"draft_narrative\",\"phase\":\"INTENT\",\"actor\":\"reviewer\",\"payload\":\"run-$NONCE\"}"
A1="$(python "$CLIENT" "$GW_URL" "$REV" "$T_AUDIT" "$AUDIT_IN")"
check "reviewer  write_audit (1st write)"  ALLOW "$A1"
if echo "$A1" | grep -q '"stored": *true' && echo "$A1" | grep -q '"worm": *true'; then
  echo "  PASS | audit written to append-only ledger AND WORM (Object Lock) bucket"; pass=$((pass+1))
else
  echo "  FAIL | audit not stored/worm -> $A1"; fail=$((fail+1))
fi
A2="$(python "$CLIENT" "$GW_URL" "$REV" "$T_AUDIT" "$AUDIT_IN")"
if echo "$A2" | grep -q '"stored": *false' && echo "$A2" | grep -qi 'append-only'; then
  echo "  PASS | re-writing the identical record is rejected (immutable / append-only)"; pass=$((pass+1))
else
  echo "  FAIL | duplicate audit write was not rejected -> $A2"; fail=$((fail+1))
fi
echo "=== forbid: no self-submit (separation of duties) ==="
check "reviewer  finalize_submission"     DENY  "$(python "$CLIENT" "$GW_URL" "$REV" "$T_FINAL" '{"icsr_id":"ICSR-2026-0002"}')"

echo "=== sanctioned submission ONLY via the human sign-off gate (Step Functions) ==="
SO_ICSR="ICSR-2026-0042"
soapprove(){ aws lambda invoke --function-name pv-approve --cli-binary-format raw-in-base64-out \
  --payload "{\"icsr_id\":\"$SO_ICSR\",\"approver\":\"$1\"}" --region "$REGION" /tmp/_soap.json >/dev/null 2>&1; cat /tmp/_soap.json; }
RSO="$(python "$CLIENT" "$GW_URL" "$REV" "request-signoff___request_signoff" "{\"icsr_id\":\"$SO_ICSR\",\"requester\":\"reviewer\"}")"
check "reviewer  request_signoff"          ALLOW "$RSO"
EXEC="$(printf '%s' "$RSO" | tr -d '\r' | grep -o 'arn:aws:states:[A-Za-z0-9:_-]*' | head -1)"
for i in $(seq 1 15); do ST="$(aws dynamodb get-item --table-name pv-pending-approvals --key "{\"icsr_id\":{\"S\":\"$SO_ICSR\"}}" --region "$REGION" --query "Item.status.S" --output text 2>/dev/null)"; [ "$ST" = "PENDING" ] && break; sleep 2; done
SELFA="$(soapprove reviewer)"
if echo "$SELFA" | grep -qi 'separation-of-duties'; then echo "  PASS | requester CANNOT self-approve (separation of duties)"; pass=$((pass+1)); else echo "  FAIL | self-approval not blocked -> $SELFA"; fail=$((fail+1)); fi
APPRA="$(soapprove approver)"
if echo "$APPRA" | grep -q '"approved": true'; then echo "  PASS | a DIFFERENT qualified person approves"; pass=$((pass+1)); else echo "  FAIL | valid approval failed -> $APPRA"; fail=$((fail+1)); fi
for i in $(seq 1 20); do S="$(aws stepfunctions describe-execution --execution-arn "$EXEC" --region "$REGION" --query status --output text 2>/dev/null)"; [ "$S" != "RUNNING" ] && break; sleep 2; done
if [ "$S" = "SUCCEEDED" ]; then echo "  PASS | submission finalized ONLY after approval (SUCCEEDED)"; pass=$((pass+1)); else echo "  FAIL | workflow did not finalize (status=$S)"; fail=$((fail+1)); fi
RESO="$(soapprove approver)"
if echo "$RESO" | grep -qi 'single-use\|already consumed'; then echo "  PASS | approval token is single-use"; pass=$((pass+1)); else echo "  FAIL | token reuse not blocked -> $RESO"; fail=$((fail+1)); fi

echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] && echo "GOVERNANCE DEMO: PASS" || { echo "GOVERNANCE DEMO: FAIL"; exit 1; }
