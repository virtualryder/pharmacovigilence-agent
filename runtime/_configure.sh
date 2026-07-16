#!/usr/bin/env bash
cd /c/Users/daryd/Projects-DR/pv-runtime
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1 AGENTCORE_SUPPRESS_RECOMMENDATION=1 COLUMNS=140 TERM=dumb
export AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1
# pull live Cognito pool/client from the spine state
source "/c/Users/daryd/Projects-DR/pharmacovigilance agent/spine-state.env"
AC="{\"customJWTAuthorizer\":{\"discoveryUrl\":\"$DISCOVERY\",\"allowedClients\":[\"$CLIENT_ID\"]}}"
echo "authorizer: $AC"
./.venv/Scripts/agentcore.exe configure -c \
  -e agent.py -n pv_runtime_agent -rf requirements.txt \
  -ecr auto --disable-memory \
  -ac "$AC" -rha Authorization 2>&1 | tail -40
echo "CONFIGURE_EXIT=${PIPESTATUS[0]}"
echo "=== .bedrock_agentcore.yaml ==="
cat .bedrock_agentcore.yaml 2>&1 | head -100
