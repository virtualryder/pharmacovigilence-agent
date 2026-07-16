#!/usr/bin/env bash
# deploy_identity.sh — STABLE, long-lived identity stack (its own lifecycle, NOT torn down by the
# spine cycle). Idempotent: reuse pool/client/users by name, create if missing. Writes identity-state.env.
# Keeping identity stable is what lets the AgentCore Runtime survive spine redeploys unchanged.
set -uo pipefail
export AWS_PAGER=""
REGION="${AWS_REGION:-us-east-1}"
SELF="$(cd "$(dirname "$0")" && pwd)"; PROJ="$(cd "$SELF/.." && pwd)"
STATE="$PROJ/identity-state.env"
log(){ echo "[identity] $*"; }

POOL_ID="$(aws cognito-idp list-user-pools --max-results 60 --region "$REGION" --query "UserPools[?Name=='pv-icsr'].Id | [0]" --output text)"
if [ "$POOL_ID" = "None" ] || [ -z "$POOL_ID" ]; then
  POOL_ID="$(aws cognito-idp create-user-pool --pool-name pv-icsr --region "$REGION" --query UserPool.Id --output text)"; log "created stable cognito pool $POOL_ID"
else
  log "reusing stable cognito pool $POOL_ID"
fi
CLIENT_ID="$(aws cognito-idp list-user-pool-clients --user-pool-id "$POOL_ID" --region "$REGION" --query "UserPoolClients[?ClientName=='pv-gw'].ClientId | [0]" --output text)"
if [ "$CLIENT_ID" = "None" ] || [ -z "$CLIENT_ID" ]; then
  CLIENT_ID="$(aws cognito-idp create-user-pool-client --user-pool-id "$POOL_ID" --client-name pv-gw --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH --region "$REGION" --query UserPoolClient.ClientId --output text)"; log "created app client"
fi
aws cognito-idp create-group --user-pool-id "$POOL_ID" --group-name pv_reviewer --region "$REGION" >/dev/null 2>&1 || true
for u in "reviewer:PvReviewer#2026!:yes" "approver:PvApprover#2026!:yes" "outsider:PvOutsider#2026!:no"; do
  un="${u%%:*}"; rest="${u#*:}"; pw="${rest%%:*}"; grp="${rest##*:}"
  aws cognito-idp admin-create-user --user-pool-id "$POOL_ID" --username "$un" --message-action SUPPRESS --region "$REGION" >/dev/null 2>&1 || true
  aws cognito-idp admin-set-user-password --user-pool-id "$POOL_ID" --username "$un" --password "$pw" --permanent --region "$REGION" >/dev/null 2>&1 || true
  [ "$grp" = "yes" ] && aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL_ID" --username "$un" --group-name pv_reviewer --region "$REGION" >/dev/null 2>&1 || true
done
DISCOVERY="https://cognito-idp.$REGION.amazonaws.com/$POOL_ID/.well-known/openid-configuration"
cat > "$STATE" <<EOF
REGION=$REGION
POOL_ID=$POOL_ID
CLIENT_ID=$CLIENT_ID
DISCOVERY=$DISCOVERY
EOF
log "identity ready. pool=$POOL_ID client=$CLIENT_ID -> $STATE"
