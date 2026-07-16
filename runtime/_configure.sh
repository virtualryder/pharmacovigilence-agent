#!/usr/bin/env bash
# Configure the AgentCore Runtime with the Cognito JWT inbound authorizer (from the spine state).
SELF="$(cd "$(dirname "$0")" && pwd)"; cd "$SELF"; source "$SELF/_env.sh"
[ -f "$STATE" ] || { echo "spine-state.env not found ($STATE). Deploy the spine first (scripts/deploy_spine.sh) or set PV_SPINE_STATE."; exit 1; }
source "$STATE"   # DISCOVERY, CLIENT_ID, GW_URL, ...
ACJSON="{\"customJWTAuthorizer\":{\"discoveryUrl\":\"$DISCOVERY\",\"allowedClients\":[\"$CLIENT_ID\"]}}"
echo "authorizer: $ACJSON"
"$AC" configure -c -e agent.py -n pv_runtime_agent -rf requirements.txt -ecr auto --disable-memory -ac "$ACJSON" -rha Authorization 2>&1 | tail -40
echo "CONFIGURE_EXIT=${PIPESTATUS[0]}"
