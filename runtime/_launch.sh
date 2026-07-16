#!/usr/bin/env bash
cd /c/Users/daryd/Projects-DR/pv-runtime
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1 AGENTCORE_SUPPRESS_RECOMMENDATION=1 COLUMNS=140 TERM=dumb
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1
source "/c/Users/daryd/Projects-DR/pharmacovigilance agent/spine-state.env"
echo "GATEWAY_URL=$GW_URL"
./.venv/Scripts/agentcore.exe launch \
  --env GATEWAY_URL="$GW_URL" \
  --env MODEL_ID="us.anthropic.claude-sonnet-4-5-20250929-v1:0" \
  --auto-update-on-conflict 2>&1
echo "LAUNCH_EXIT=${PIPESTATUS[0]}"
