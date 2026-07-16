#!/usr/bin/env bash
# destroy_identity.sh — EXPLICIT teardown of the stable identity stack. The spine destroy does NOT
# touch identity; run this only when you truly want to remove the shared Cognito pool.
set -uo pipefail
export AWS_PAGER=""
REGION="${AWS_REGION:-us-east-1}"
SELF="$(cd "$(dirname "$0")" && pwd)"; PROJ="$(cd "$SELF/.." && pwd)"
POOL_ID="$(aws cognito-idp list-user-pools --max-results 60 --region "$REGION" --query "UserPools[?Name=='pv-icsr'].Id | [0]" --output text 2>/dev/null)"
if [ -n "$POOL_ID" ] && [ "$POOL_ID" != "None" ]; then
  aws cognito-idp update-user-pool --user-pool-id "$POOL_ID" --deletion-protection INACTIVE --region "$REGION" >/dev/null 2>&1 || true
  aws cognito-idp delete-user-pool --user-pool-id "$POOL_ID" --region "$REGION" >/dev/null 2>&1 && echo "  deleted stable cognito pool $POOL_ID"
fi
rm -f "$PROJ/identity-state.env"
echo "[identity] destroyed."
