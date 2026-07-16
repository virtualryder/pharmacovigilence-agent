#!/usr/bin/env bash
export AWS_PAGER='' MSYS_NO_PATHCONV=1
REGION=us-east-1; ACC=864217980669
cd /c/Users/daryd/Projects-DR/pv-runtime
# 1) grant the Runtime exec role ssm:GetParameter for dynamic gateway discovery
ROLE="$(aws iam list-roles --query "Roles[?starts_with(RoleName,'AmazonBedrockAgentCoreSDKRuntime')].RoleName | [0]" --output text | tr -d '\r')"
echo "runtime exec role: $ROLE"
printf '%s' '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["ssm:GetParameter"],"Resource":"arn:aws:ssm:'"$REGION"':'"$ACC"':parameter/pv-icsr/*"}]}' > ssm-pol.json
if [ -n "$ROLE" ] && [ "$ROLE" != "None" ]; then
  aws iam put-role-policy --role-name "$ROLE" --policy-name pv-runtime-ssm --policy-document file://ssm-pol.json --region "$REGION" \
    && echo "  attached ssm:GetParameter to $ROLE"
fi
# 2) best-effort: enable CloudWatch Transaction Search so OTel spans surface in the GenAI trace UI
aws xray update-trace-segment-destination --destination CloudWatchLogs --region "$REGION" >/dev/null 2>&1 \
  && echo "  enabled Transaction Search (X-Ray segment dest = CloudWatchLogs)" \
  || echo "  (Transaction Search enable skipped — log-based observability still active)"
echo "OBS_SETUP_DONE"
