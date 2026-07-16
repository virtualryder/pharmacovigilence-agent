#!/usr/bin/env bash
# destroy_spine.sh — tear down the PV AgentCore governance spine (best-effort, idempotent).
set -uo pipefail
export AWS_PAGER=""
export MSYS_NO_PATHCONV=1   # stop Git-Bash mangling '/'-leading args (e.g. the SSM parameter name) so delete-parameter actually hits /pv-icsr/gateway-url
REGION="${AWS_REGION:-us-east-1}"
ACC="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"
echo "[destroy] region $REGION"
GW_ID="$(aws bedrock-agentcore-control list-gateways --region "$REGION" --query "items[?name=='pv-icsr-gw'].gatewayId | [0]" --output text 2>/dev/null)"
if [ -n "$GW_ID" ] && [ "$GW_ID" != "None" ]; then
  for t in $(aws bedrock-agentcore-control list-gateway-targets --gateway-identifier "$GW_ID" --region "$REGION" --query "items[].targetId" --output text 2>/dev/null); do
    aws bedrock-agentcore-control delete-gateway-target --gateway-identifier "$GW_ID" --target-id "$t" --region "$REGION" >/dev/null 2>&1 && echo "  deleted target $t"
  done
  sleep 5
  aws bedrock-agentcore-control delete-gateway --gateway-identifier "$GW_ID" --region "$REGION" >/dev/null 2>&1 && echo "  deleted gateway $GW_ID"
  sleep 5
fi
ENGINE_ID="$(aws bedrock-agentcore-control list-policy-engines --region "$REGION" --query "policyEngines[?name=='pv_icsr_authz'].policyEngineId | [0]" --output text 2>/dev/null)"
if [ -n "$ENGINE_ID" ] && [ "$ENGINE_ID" != "None" ]; then
  for p in $(aws bedrock-agentcore-control list-policies --policy-engine-id "$ENGINE_ID" --region "$REGION" --query "policies[].policyId" --output text 2>/dev/null); do
    aws bedrock-agentcore-control delete-policy --policy-engine-id "$ENGINE_ID" --policy-id "$p" --region "$REGION" >/dev/null 2>&1 && echo "  deleted policy $p"
  done
  sleep 3
  aws bedrock-agentcore-control delete-policy-engine --policy-engine-id "$ENGINE_ID" --region "$REGION" >/dev/null 2>&1 && echo "  deleted policy engine $ENGINE_ID"
fi
# Human sign-off gate: stop any paused executions, then delete the state machine.
SM_ARN="$(aws stepfunctions list-state-machines --region "$REGION" --query "stateMachines[?name=='pv-signoff'].stateMachineArn | [0]" --output text 2>/dev/null)"
if [ -n "$SM_ARN" ] && [ "$SM_ARN" != "None" ]; then
  for ex in $(aws stepfunctions list-executions --state-machine-arn "$SM_ARN" --status-filter RUNNING --region "$REGION" --query "executions[].executionArn" --output text 2>/dev/null); do
    aws stepfunctions stop-execution --execution-arn "$ex" --region "$REGION" >/dev/null 2>&1 || true
  done
  aws stepfunctions delete-state-machine --state-machine-arn "$SM_ARN" --region "$REGION" >/dev/null 2>&1 && echo "  deleted state machine pv-signoff"
fi
# Enumerate every pv-* tool Lambda dynamically so new tools (e.g. pv-assess-seriousness) are always
# torn down — no hardcoded list to keep in sync. The Runtime is an AgentCore runtime (pv_runtime_agent,
# underscores), not a pv-* Lambda, so it is never matched here.
for f in $(aws lambda list-functions --region "$REGION" --query "Functions[?starts_with(FunctionName, 'pv-')].FunctionName" --output text 2>/dev/null | tr -d '\r'); do
  aws lambda delete-function --function-name "$f" --region "$REGION" >/dev/null 2>&1 && echo "  deleted lambda $f"
done
aws dynamodb delete-table --table-name pv-pending-approvals --region "$REGION" >/dev/null 2>&1 && echo "  deleted pending-approvals table"
# WORM audit stores. DynamoDB drops cleanly. The S3 Object Lock bucket needs every version
# deleted WITH governance bypass (an admin can; the tool role is denied bypass) before removal.
aws dynamodb delete-table --table-name pv-audit --region "$REGION" >/dev/null 2>&1 && echo "  deleted audit ledger pv-audit"
GRID="$(aws bedrock list-guardrails --region "$REGION" --query "guardrails[?name=='pv-icsr-guardrail'].id | [0]" --output text 2>/dev/null)"
if [ -n "$GRID" ] && [ "$GRID" != "None" ]; then
  aws bedrock delete-guardrail --guardrail-identifier "$GRID" --region "$REGION" >/dev/null 2>&1 && echo "  deleted guardrail $GRID"
fi
BUCKET="pv-audit-worm-$ACC-$REGION"
if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1; then
  aws s3api list-object-versions --bucket "$BUCKET" --region "$REGION" \
    --query "[Versions[].[Key,VersionId],DeleteMarkers[].[Key,VersionId]][]" --output text 2>/dev/null | tr -d '\r' | \
  while read -r k v; do
    [ -n "$k" ] && [ "$k" != "None" ] && \
      aws s3api delete-object --bucket "$BUCKET" --key "$k" --version-id "$v" --bypass-governance-retention --region "$REGION" >/dev/null 2>&1
  done
  aws s3api delete-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1 && echo "  deleted WORM bucket $BUCKET"
fi
# NOTE: the Cognito identity stack is STABLE and intentionally left intact (run destroy_identity.sh to remove it).
aws ssm delete-parameter --name /pv-icsr/gateway-url --region "$REGION" >/dev/null 2>&1 && echo "  deleted SSM /pv-icsr/gateway-url"
aws iam delete-role-policy --role-name pv-agentcore-gw --policy-name pv-gw-perms >/dev/null 2>&1 || true
aws iam delete-role --role-name pv-agentcore-gw >/dev/null 2>&1 && echo "  deleted role pv-agentcore-gw"
aws iam delete-role-policy --role-name pv-tool-exec --policy-name pv-tool-nlp >/dev/null 2>&1 || true
aws iam detach-role-policy --role-name pv-tool-exec --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null 2>&1 || true
aws iam delete-role --role-name pv-tool-exec >/dev/null 2>&1 && echo "  deleted role pv-tool-exec"
aws iam delete-role-policy --role-name pv-signoff-exec --policy-name pv-signoff-perms >/dev/null 2>&1 || true
aws iam detach-role-policy --role-name pv-signoff-exec --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null 2>&1 || true
aws iam delete-role --role-name pv-signoff-exec >/dev/null 2>&1 && echo "  deleted role pv-signoff-exec"
aws iam delete-role-policy --role-name pv-signoff-sfn --policy-name pv-signoff-sfn-perms >/dev/null 2>&1 || true
aws iam delete-role --role-name pv-signoff-sfn >/dev/null 2>&1 && echo "  deleted role pv-signoff-sfn"
echo "[destroy] complete"
