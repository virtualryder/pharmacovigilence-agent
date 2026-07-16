#!/usr/bin/env bash
# Invoke the Runtime as a given user. Usage: _invoke.sh [user] [password]
# Defaults: reviewer + $PV_REVIEWER_PW (override via args or env).
SELF="$(cd "$(dirname "$0")" && pwd)"; cd "$SELF"; export MSYS_NO_PATHCONV=1; source "$SELF/_env.sh"
[ -f "$STATE" ] || { echo "spine-state.env not found ($STATE)."; exit 1; }
source "$STATE"
USER_NAME="${1:-reviewer}"; PASS="${2:-$PV_REVIEWER_PW}"
TOKEN="$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH --client-id "$CLIENT_ID" \
  --auth-parameters "USERNAME=$USER_NAME,PASSWORD=$PASS" --region "$REGION" \
  --query 'AuthenticationResult.AccessToken' --output text | tr -d '\r')"
echo "invoking as $USER_NAME (token len ${#TOKEN})"
PAYLOAD="{\"access_token\":\"$TOKEN\",\"icsr_id\":\"ICSR-2026-0500\",\"requester\":\"$USER_NAME\"}"
"$AC" invoke --bearer-token "$TOKEN" "$PAYLOAD" 2>&1
echo "INVOKE_EXIT=${PIPESTATUS[0]}"
