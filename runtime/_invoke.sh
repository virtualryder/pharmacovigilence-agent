#!/usr/bin/env bash
cd /c/Users/daryd/Projects-DR/pv-runtime
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1 AGENTCORE_SUPPRESS_RECOMMENDATION=1 COLUMNS=160 TERM=dumb MSYS_NO_PATHCONV=1
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1
source "/c/Users/daryd/Projects-DR/pharmacovigilance agent/spine-state.env"
USER="${1:-reviewer}"; PASS="${2:-PvReviewer#2026!}"
TOKEN="$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=$USER,PASSWORD=$PASS" --region us-east-1 \
  --query 'AuthenticationResult.AccessToken' --output text)"
echo "invoking as $USER (token len ${#TOKEN})"
PAYLOAD="{\"access_token\":\"$TOKEN\",\"icsr_id\":\"ICSR-2026-0500\",\"requester\":\"$USER\"}"
./.venv/Scripts/agentcore.exe invoke --bearer-token "$TOKEN" "$PAYLOAD" 2>&1
echo "INVOKE_EXIT=${PIPESTATUS[0]}"
