#!/usr/bin/env bash
# Re-point the Runtime's Cognito JWT authorizer at the CURRENT spine pool, then redeploy.
set -e
bash /c/Users/daryd/Projects-DR/pv-runtime/_configure.sh 2>&1 | tail -3
echo "=== relaunch ==="
bash /c/Users/daryd/Projects-DR/pv-runtime/_launch.sh 2>&1 | grep -Ei 'agent arn|deployment completed|launch_exit|error' | head -8
