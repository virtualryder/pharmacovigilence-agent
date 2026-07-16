#!/usr/bin/env bash
# Re-point the Runtime's JWT authorizer at the CURRENT spine pool, then redeploy. (Only needed if identity changes.)
set -e
SELF="$(cd "$(dirname "$0")" && pwd)"
bash "$SELF/_configure.sh" 2>&1 | tail -3
echo "=== relaunch ==="
bash "$SELF/_launch.sh" 2>&1 | grep -Ei 'agent arn|deployment completed|launch_exit|error' | head -8
