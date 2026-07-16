#!/usr/bin/env bash
# Launch (build + deploy) the Runtime to AgentCore. ARM64 build runs in CodeBuild (no local Docker).
SELF="$(cd "$(dirname "$0")" && pwd)"; cd "$SELF"; source "$SELF/_env.sh"
[ -f "$STATE" ] || { echo "spine-state.env not found ($STATE)."; exit 1; }
source "$STATE"
MODEL_ID="${MODEL_ID:-us.anthropic.claude-sonnet-4-5-20250929-v1:0}"
echo "GATEWAY_URL=$GW_URL"
"$AC" launch --env GATEWAY_URL="$GW_URL" --env MODEL_ID="$MODEL_ID" --auto-update-on-conflict 2>&1
echo "LAUNCH_EXIT=${PIPESTATUS[0]}"
