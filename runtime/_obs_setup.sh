#!/usr/bin/env bash
# Grant the Runtime exec role ssm:GetParameter (dynamic gateway discovery) + best-effort Transaction Search.
SELF="$(cd "$(dirname "$0")" && pwd)"; cd "$SELF"; export MSYS_NO_PATHCONV=1; source "$SELF/_env.sh"
ACC="$(aws sts get-caller-identity --query Account --output text | tr -d '\r')"
ROLE="$(aws iam list-roles --query "Roles[?starts_with(RoleName,'AmazonBedrockAgentCoreSDKRuntime')].RoleName | [0]" --output text | tr -d '\r')"
echo "runtime exec role: $ROLE"
printf '%s' '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["ssm:GetParameter"],"Resource":"arn:aws:ssm:'"$REGION"':'"$ACC"':parameter'"$SSM_PREFIX"'/*"}]}' > ssm-pol.json
if [ -n "$ROLE" ] && [ "$ROLE" != "None" ]; then
  aws iam put-role-policy --role-name "$ROLE" --policy-name pv-runtime-ssm --policy-document file://ssm-pol.json --region "$REGION" && echo "  attached ssm:GetParameter to $ROLE"
fi
aws xray update-trace-segment-destination --destination CloudWatchLogs --region "$REGION" >/dev/null 2>&1 \
  && echo "  enabled Transaction Search (X-Ray segment dest = CloudWatchLogs)" \
  || echo "  (Transaction Search enable skipped; log-based observability still active)"
echo "OBS_SETUP_DONE"
