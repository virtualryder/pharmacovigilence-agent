#!/usr/bin/env bash
# deploy_spine.sh — stand up the PV AgentCore governance spine on a clean account.
# IAM roles + Cognito are create-or-reuse; Lambda + AgentCore resources are created fresh.
# Order (proven): engine -> gateway(LOG_ONLY) -> targets -> policies -> flip ENFORCE.
set -euo pipefail
export AWS_PAGER=""
export MSYS_NO_PATHCONV=1   # stop Git-Bash mangling '/'-leading args (e.g. the SSM parameter name)
REGION="${AWS_REGION:-us-east-1}"
ACC="$(aws sts get-caller-identity --query Account --output text)"
SELF="$(cd "$(dirname "$0")" && pwd)"; PROJ="$(cd "$SELF/.." && pwd)"
TOOLS="$PROJ/tools"; WORK="$SELF/.work"; STATE="$PROJ/spine-state.env"
rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK"
log(){ echo "[deploy] $*"; }

wait_active(){ # $1=describe cmd (prints status via query)  $2=target
  for i in $(seq 1 40); do
    s="$(eval "$1" 2>/dev/null || echo '')"
    [ "$s" = "$2" ] && return 0
    case "$s" in *FAILED*) echo "  !! $1 -> $s"; return 1;; esac
    sleep 4
  done; echo "  !! timeout: $1 -> $2"; return 1
}

# ---- guard ----
if [ -n "$(aws bedrock-agentcore-control list-gateways --region "$REGION" --query "items[?name=='pv-icsr-gw'].gatewayId" --output text)" ]; then
  echo "A gateway 'pv-icsr-gw' already exists. Run destroy_spine.sh first."; exit 1
fi

# ---- 1. IAM (create-or-reuse) ----
printf '%s' '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"bedrock-agentcore.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > gw-trust.json
printf '%s' '{"Version":"2012-10-17","Statement":[{"Sid":"AC","Effect":"Allow","Action":"bedrock-agentcore:*","Resource":"*"},{"Sid":"L","Effect":"Allow","Action":"lambda:InvokeFunction","Resource":"arn:aws:lambda:'"$REGION"':'"$ACC"':function:pv-*"}]}' > gw-perms.json
printf '%s' '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > lam-trust.json
aws iam get-role --role-name pv-agentcore-gw >/dev/null 2>&1 || { aws iam create-role --role-name pv-agentcore-gw --assume-role-policy-document file://gw-trust.json >/dev/null; log "created role pv-agentcore-gw"; }
aws iam put-role-policy --role-name pv-agentcore-gw --policy-name pv-gw-perms --policy-document file://gw-perms.json
GW_ROLE_ARN="arn:aws:iam::$ACC:role/pv-agentcore-gw"
if ! aws iam get-role --role-name pv-tool-exec >/dev/null 2>&1; then
  aws iam create-role --role-name pv-tool-exec --assume-role-policy-document file://lam-trust.json >/dev/null
  aws iam attach-role-policy --role-name pv-tool-exec --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  log "created role pv-tool-exec"
fi
TOOL_ROLE_ARN="arn:aws:iam::$ACC:role/pv-tool-exec"
# NLP de-identification perms for mask_phi (applied every deploy so role-reuse still gets them).
printf '%s' '{"Version":"2012-10-17","Statement":[{"Sid":"NLP","Effect":"Allow","Action":["comprehendmedical:DetectPHI","comprehend:DetectPiiEntities"],"Resource":"*"},{"Sid":"BedrockDraft","Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream","bedrock:ApplyGuardrail"],"Resource":"*"},{"Sid":"AuditLedgerAppend","Effect":"Allow","Action":["dynamodb:PutItem"],"Resource":"arn:aws:dynamodb:'"$REGION"':'"$ACC"':table/pv-audit"},{"Sid":"AuditWormPut","Effect":"Allow","Action":["s3:PutObject"],"Resource":"arn:aws:s3:::pv-audit-worm-'"$ACC"'-'"$REGION"'/*"},{"Sid":"SignoffStart","Effect":"Allow","Action":["states:StartExecution"],"Resource":"arn:aws:states:'"$REGION"':'"$ACC"':stateMachine:pv-signoff"},{"Sid":"AuditTamperDeny","Effect":"Deny","Action":["dynamodb:DeleteItem","dynamodb:UpdateItem","s3:DeleteObject","s3:DeleteObjectVersion","s3:BypassGovernanceRetention","s3:PutObjectRetention","s3:PutObjectLegalHold"],"Resource":"*"}]}' > tool-perms.json
aws iam put-role-policy --role-name pv-tool-exec --policy-name pv-tool-nlp --policy-document file://tool-perms.json
sleep 10  # IAM propagation

# ---- 2. Identity (STABLE, separate lifecycle — not created/destroyed by the spine cycle) ----
bash "$SELF/deploy_identity.sh"          # idempotent: ensures the shared pool/client/users exist
source "$PROJ/identity-state.env"        # -> POOL_ID, CLIENT_ID, DISCOVERY (stable across spine cycles)
log "using stable cognito pool=$POOL_ID client=$CLIENT_ID"

# ---- 2b. WORM audit stores: append-only DynamoDB ledger + S3 Object Lock bucket ----
if ! aws dynamodb describe-table --table-name pv-audit --region "$REGION" >/dev/null 2>&1; then
  aws dynamodb create-table --table-name pv-audit \
    --attribute-definitions AttributeName=audit_id,AttributeType=S \
    --key-schema AttributeName=audit_id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST --region "$REGION" >/dev/null
  aws dynamodb wait table-exists --table-name pv-audit --region "$REGION"
  aws dynamodb update-continuous-backups --table-name pv-audit \
    --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true --region "$REGION" >/dev/null 2>&1 || true
  log "created audit ledger pv-audit (append-only via conditional put + IAM deny)"
fi
BUCKET="pv-audit-worm-$ACC-$REGION"
if ! aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --object-lock-enabled-for-bucket >/dev/null
  aws s3api put-object-lock-configuration --bucket "$BUCKET" --region "$REGION" \
    --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"GOVERNANCE","Days":1}}}' >/dev/null
  aws s3api put-public-access-block --bucket "$BUCKET" --region "$REGION" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true >/dev/null 2>&1 || true
  log "created WORM bucket $BUCKET (S3 Object Lock GOVERNANCE 1d)"
fi

# ---- 2c. Bedrock Guardrail (fail-closed OUTPUT control on drafting) ----
GUARDRAIL_ID="$(aws bedrock list-guardrails --region "$REGION" --query "guardrails[?name=='pv-icsr-guardrail'].id | [0]" --output text 2>/dev/null)"
if [ "$GUARDRAIL_ID" = "None" ] || [ -z "$GUARDRAIL_ID" ]; then
  printf '%s' '{"piiEntitiesConfig":[{"type":"NAME","action":"ANONYMIZE"},{"type":"AGE","action":"ANONYMIZE"},{"type":"EMAIL","action":"ANONYMIZE"},{"type":"PHONE","action":"ANONYMIZE"},{"type":"US_SOCIAL_SECURITY_NUMBER","action":"ANONYMIZE"},{"type":"ADDRESS","action":"ANONYMIZE"}]}' > gr-pii.json
  printf '%s' '{"filtersConfig":[{"type":"PROMPT_ATTACK","inputStrength":"HIGH","outputStrength":"NONE"}]}' > gr-content.json
  GUARDRAIL_ID="$(aws bedrock create-guardrail --name pv-icsr-guardrail \
    --description "Fail-closed output control for PV ICSR drafting: PII anonymize + prompt-attack" \
    --blocked-input-messaging "Blocked by the PV ICSR guardrail." \
    --blocked-outputs-messaging "[Output withheld by the PV ICSR guardrail.]" \
    --sensitive-information-policy-config file://gr-pii.json \
    --content-policy-config file://gr-content.json \
    --region "$REGION" --query guardrailId --output text)"
  log "created guardrail pv-icsr-guardrail ($GUARDRAIL_ID)"
fi
for i in $(seq 1 20); do
  gs="$(aws bedrock get-guardrail --guardrail-identifier "$GUARDRAIL_ID" --region "$REGION" --query status --output text 2>/dev/null)"
  [ "$gs" = "READY" ] && break; sleep 3
done
log "guardrail $GUARDRAIL_ID $gs"

# ---- 3. Lambdas (create-or-update) ----
deploy_fn(){ # $1 fn-name  $2 src.py  [$3 role-arn (default TOOL_ROLE_ARN)]
  local role="${3:-$TOOL_ROLE_ARN}"
  cp "$TOOLS/$2" lambda_function.py
  python -c "import zipfile;z=zipfile.ZipFile('$1.zip','w',zipfile.ZIP_DEFLATED);z.write('lambda_function.py');z.close()"
  if aws lambda get-function --function-name "$1" --region "$REGION" >/dev/null 2>&1; then
    aws lambda update-function-code --function-name "$1" --zip-file "fileb://$1.zip" --region "$REGION" >/dev/null
  else
    aws lambda create-function --function-name "$1" --runtime python3.12 --role "$role" --handler lambda_function.handler --zip-file "fileb://$1.zip" --timeout 60 --region "$REGION" >/dev/null
  fi; log "lambda $1 ready"
}
deploy_fn pv-openfda-lookup openfda_lookup.py
deploy_fn pv-core-tools core_tools.py
deploy_fn pv-mask-phi mask_phi.py
deploy_fn pv-write-audit write_audit.py
deploy_fn pv-assess-seriousness assess_seriousness.py
# wire the guardrail into the drafting Lambda (env). Retry until the function is out of Pending.
for i in 1 2 3 4 5 6; do
  aws lambda update-function-configuration --function-name pv-core-tools \
    --environment "Variables={GUARDRAIL_ID=$GUARDRAIL_ID,GUARDRAIL_VERSION=DRAFT}" --region "$REGION" >/dev/null 2>&1 && break
  sleep 5
done
log "wired guardrail into pv-core-tools (GUARDRAIL_ID=$GUARDRAIL_ID)"

# ---- 3b. Human sign-off gate: pending table + roles + lambdas + Step Functions ----
if ! aws dynamodb describe-table --table-name pv-pending-approvals --region "$REGION" >/dev/null 2>&1; then
  aws dynamodb create-table --table-name pv-pending-approvals \
    --attribute-definitions AttributeName=icsr_id,AttributeType=S \
    --key-schema AttributeName=icsr_id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST --region "$REGION" >/dev/null
  aws dynamodb wait table-exists --table-name pv-pending-approvals --region "$REGION"
  log "created pending-approvals table"
fi
# role for the sign-off lambdas (register/approve/finalize)
if ! aws iam get-role --role-name pv-signoff-exec >/dev/null 2>&1; then
  aws iam create-role --role-name pv-signoff-exec --assume-role-policy-document file://lam-trust.json >/dev/null
  aws iam attach-role-policy --role-name pv-signoff-exec --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  log "created role pv-signoff-exec"
fi
SIGNOFF_ROLE_ARN="arn:aws:iam::$ACC:role/pv-signoff-exec"
printf '%s' '{"Version":"2012-10-17","Statement":[{"Sid":"Pending","Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem"],"Resource":"arn:aws:dynamodb:'"$REGION"':'"$ACC"':table/pv-pending-approvals"},{"Sid":"AuditPut","Effect":"Allow","Action":["dynamodb:PutItem"],"Resource":"arn:aws:dynamodb:'"$REGION"':'"$ACC"':table/pv-audit"},{"Sid":"TaskToken","Effect":"Allow","Action":["states:SendTaskSuccess","states:SendTaskFailure"],"Resource":"*"}]}' > signoff-perms.json
aws iam put-role-policy --role-name pv-signoff-exec --policy-name pv-signoff-perms --policy-document file://signoff-perms.json
# role for the state machine (invoke the two task lambdas)
printf '%s' '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"states.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > sfn-trust.json
if ! aws iam get-role --role-name pv-signoff-sfn >/dev/null 2>&1; then
  aws iam create-role --role-name pv-signoff-sfn --assume-role-policy-document file://sfn-trust.json >/dev/null
  log "created role pv-signoff-sfn"
fi
SFN_ROLE_ARN="arn:aws:iam::$ACC:role/pv-signoff-sfn"
printf '%s' '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["lambda:InvokeFunction"],"Resource":["arn:aws:lambda:'"$REGION"':'"$ACC"':function:pv-signoff-register","arn:aws:lambda:'"$REGION"':'"$ACC"':function:pv-finalize"]}]}' > sfn-perms.json
aws iam put-role-policy --role-name pv-signoff-sfn --policy-name pv-signoff-sfn-perms --policy-document file://sfn-perms.json
sleep 8  # IAM propagation for the new roles
deploy_fn pv-signoff-register signoff_register.py "$SIGNOFF_ROLE_ARN"
deploy_fn pv-approve          approve_signoff.py  "$SIGNOFF_ROLE_ARN"
deploy_fn pv-finalize         finalize_signoff.py "$SIGNOFF_ROLE_ARN"
deploy_fn pv-request-signoff  request_signoff.py
if ! aws stepfunctions list-state-machines --region "$REGION" --query "stateMachines[?name=='pv-signoff'].stateMachineArn | [0]" --output text | grep -q arn; then
  cp "$SELF/pv-signoff.asl.json" signoff.asl.json   # into $WORK (cwd) so native aws.exe resolves the relative file:// path
  aws stepfunctions create-state-machine --name pv-signoff --type STANDARD \
    --role-arn "$SFN_ROLE_ARN" --definition file://signoff.asl.json --region "$REGION" >/dev/null
  log "created state machine pv-signoff"
fi

# ---- 4. Policy Engine ----
ENGINE_ID="$(aws bedrock-agentcore-control create-policy-engine --name pv_icsr_authz --description "Deny-by-default Cedar authz for the PV ICSR agent" --region "$REGION" --query policyEngineId --output text)"
ENGINE_ARN="arn:aws:bedrock-agentcore:$REGION:$ACC:policy-engine/$ENGINE_ID"
wait_active "aws bedrock-agentcore-control get-policy-engine --policy-engine-id $ENGINE_ID --region $REGION --query status --output text" ACTIVE
log "policy engine $ENGINE_ID ACTIVE"

# ---- 5. Gateway (engine LOG_ONLY first) ----
printf '%s' '{"customJWTAuthorizer":{"discoveryUrl":"'"$DISCOVERY"'","allowedClients":["'"$CLIENT_ID"'"]}}' > authz.json
printf '%s' '{"arn":"'"$ENGINE_ARN"'","mode":"LOG_ONLY"}' > pe-log.json
GW_ID="$(aws bedrock-agentcore-control create-gateway --name pv-icsr-gw --role-arn "$GW_ROLE_ARN" --protocol-type MCP --authorizer-type CUSTOM_JWT --authorizer-configuration file://authz.json --policy-engine-configuration file://pe-log.json --description "PV ICSR governed tool gateway" --region "$REGION" --query gatewayId --output text)"
wait_active "aws bedrock-agentcore-control get-gateway --gateway-identifier $GW_ID --region $REGION --query status --output text" READY
GW_ARN="$(aws bedrock-agentcore-control get-gateway --gateway-identifier $GW_ID --region $REGION --query gatewayArn --output text)"
GW_URL="$(aws bedrock-agentcore-control get-gateway --gateway-identifier $GW_ID --region $REGION --query gatewayUrl --output text)"
log "gateway $GW_ID READY"
# Publish the (rotating) gateway URL to a STABLE SSM parameter so the Runtime agent discovers the
# current gateway dynamically — it never needs redeploying when the spine cycle rotates the gateway.
aws ssm put-parameter --name /pv-icsr/gateway-url --type String --overwrite --value "$GW_URL" --region "$REGION" >/dev/null 2>&1 \
  && log "published gateway URL to SSM /pv-icsr/gateway-url"

# ---- 6. Targets ----
printf '%s' '[{"credentialProviderType":"GATEWAY_IAM_ROLE"}]' > cred.json
printf '%s' '{"mcp":{"lambda":{"lambdaArn":"arn:aws:lambda:'"$REGION"':'"$ACC"':function:pv-openfda-lookup","toolSchema":{"inlinePayload":[{"name":"openfda_lookup","description":"Look up FAERS adverse-event summaries for a drug; no PHI.","inputSchema":{"type":"object","properties":{"drug":{"type":"string","description":"Drug name."}},"required":["drug"]}}]}}}}' > t-openfda.json
printf '%s' '{"mcp":{"lambda":{"lambdaArn":"arn:aws:lambda:'"$REGION"':'"$ACC"':function:pv-core-tools","toolSchema":{"inlinePayload":[{"name":"draft_narrative","description":"Draft a de-identified ICSR narrative; case must be masked first.","inputSchema":{"type":"object","properties":{"case":{"type":"string","description":"Assembled case JSON."},"deidentified":{"type":"boolean","description":"True if masked by mask_phi."}},"required":["case","deidentified"]}},{"name":"finalize_submission","description":"Submit an ICSR; agent must never call this directly.","inputSchema":{"type":"object","properties":{"icsr_id":{"type":"string","description":"ICSR id."}},"required":["icsr_id"]}}]}}}}' > t-core.json
printf '%s' '{"mcp":{"lambda":{"lambdaArn":"arn:aws:lambda:'"$REGION"':'"$ACC"':function:pv-mask-phi","toolSchema":{"inlinePayload":[{"name":"mask_phi","description":"Fail-closed PHI/PII de-identification of an assembled case; sets deidentified=true only if masking succeeded.","inputSchema":{"type":"object","properties":{"case":{"type":"string","description":"Assembled case text that may contain PHI."}},"required":["case"]}}]}}}}' > t-mask.json
printf '%s' '{"mcp":{"lambda":{"lambdaArn":"arn:aws:lambda:'"$REGION"':'"$ACC"':function:pv-write-audit","toolSchema":{"inlinePayload":[{"name":"write_audit","description":"Append a tamper-evident audit record (append-only ledger + WORM copy); returns stored=false if the exact record already exists.","inputSchema":{"type":"object","properties":{"icsr_id":{"type":"string","description":"ICSR id."},"action":{"type":"string","description":"Governed action being recorded."},"phase":{"type":"string","description":"INTENT or COMMITTED."},"actor":{"type":"string","description":"Who acted."},"payload":{"type":"string","description":"Evidence payload (JSON string)."}},"required":["icsr_id","action","phase"]}}]}}}}' > t-audit.json
printf '%s' '{"mcp":{"lambda":{"lambdaArn":"arn:aws:lambda:'"$REGION"':'"$ACC"':function:pv-request-signoff","toolSchema":{"inlinePayload":[{"name":"request_signoff","description":"Request human sign-off before ICSR submission; starts a separation-of-duties approval workflow. The agent can never finalize directly.","inputSchema":{"type":"object","properties":{"icsr_id":{"type":"string","description":"ICSR id."},"requester":{"type":"string","description":"The qualified person requesting submission."}},"required":["icsr_id","requester"]}}]}}}}' > t-signoff.json
printf '%s' '{"mcp":{"lambda":{"lambdaArn":"arn:aws:lambda:'"$REGION"':'"$ACC"':function:pv-assess-seriousness","toolSchema":{"inlinePayload":[{"name":"assess_seriousness","description":"Assess ICH E2B(R3) seriousness criteria and the regulatory reporting clock (expedited vs periodic) for a de-identified case; case must be masked first (deidentified=true).","inputSchema":{"type":"object","properties":{"case":{"type":"string","description":"De-identified (masked) case text or JSON."},"deidentified":{"type":"boolean","description":"True if masked by mask_phi."},"expectedness":{"type":"string","description":"listed | unlisted | unknown - listedness of the reaction for the suspect product."}},"required":["case","deidentified"]}}]}}}}' > t-seriousness.json
aws bedrock-agentcore-control create-gateway-target --gateway-identifier "$GW_ID" --name openfda-lookup --target-configuration file://t-openfda.json --credential-provider-configurations file://cred.json --region "$REGION" --query targetId --output text > /dev/null
aws bedrock-agentcore-control create-gateway-target --gateway-identifier "$GW_ID" --name mask-phi --target-configuration file://t-mask.json --credential-provider-configurations file://cred.json --region "$REGION" --query targetId --output text > /dev/null
aws bedrock-agentcore-control create-gateway-target --gateway-identifier "$GW_ID" --name write-audit --target-configuration file://t-audit.json --credential-provider-configurations file://cred.json --region "$REGION" --query targetId --output text > /dev/null
aws bedrock-agentcore-control create-gateway-target --gateway-identifier "$GW_ID" --name request-signoff --target-configuration file://t-signoff.json --credential-provider-configurations file://cred.json --region "$REGION" --query targetId --output text > /dev/null
aws bedrock-agentcore-control create-gateway-target --gateway-identifier "$GW_ID" --name assess-seriousness --target-configuration file://t-seriousness.json --credential-provider-configurations file://cred.json --region "$REGION" --query targetId --output text > /dev/null
TCORE="$(aws bedrock-agentcore-control create-gateway-target --gateway-identifier "$GW_ID" --name pv-core --target-configuration file://t-core.json --credential-provider-configurations file://cred.json --region "$REGION" --query targetId --output text)"
wait_active "aws bedrock-agentcore-control get-gateway-target --gateway-identifier $GW_ID --target-id $TCORE --region $REGION --query status --output text" READY
log "targets ready"

# ---- 7. Cedar policies (inject gateway ARN into the forbids) ----
mkpolicy(){ # $1 name  $2 statement  $3 validation-mode
  printf '%s' '{"cedar":{"statement":"'"$2"'"}}' > pol.json
  pid="$(aws bedrock-agentcore-control create-policy --policy-engine-id "$ENGINE_ID" --name "$1" --definition file://pol.json --validation-mode "$3" --region "$REGION" --query policyId --output text)"
  wait_active "aws bedrock-agentcore-control get-policy --policy-engine-id $ENGINE_ID --policy-id $pid --region $REGION --query status --output text" ACTIVE
  log "policy $1 ACTIVE"
}
mkpolicy pv_reviewer_permit 'permit(principal, action, resource is AgentCore::Gateway) when { principal.hasTag(\"cognito:groups\") && principal.getTag(\"cognito:groups\") like \"*pv_reviewer*\" };' FAIL_ON_ANY_FINDINGS
mkpolicy mask_before_draft 'forbid(principal, action == AgentCore::Action::\"pv-core___draft_narrative\", resource == AgentCore::Gateway::\"'"$GW_ARN"'\") unless { context.input.deidentified == true };' IGNORE_ALL_FINDINGS
mkpolicy mask_before_assess 'forbid(principal, action == AgentCore::Action::\"assess-seriousness___assess_seriousness\", resource == AgentCore::Gateway::\"'"$GW_ARN"'\") unless { context.input.deidentified == true };' IGNORE_ALL_FINDINGS
mkpolicy no_self_submit 'forbid(principal, action == AgentCore::Action::\"pv-core___finalize_submission\", resource == AgentCore::Gateway::\"'"$GW_ARN"'\");' IGNORE_ALL_FINDINGS

# ---- 8. Flip to ENFORCE ----
printf '%s' '{"arn":"'"$ENGINE_ARN"'","mode":"ENFORCE"}' > pe-enf.json
aws bedrock-agentcore-control update-gateway --gateway-identifier "$GW_ID" --name pv-icsr-gw --role-arn "$GW_ROLE_ARN" --protocol-type MCP --authorizer-type CUSTOM_JWT --authorizer-configuration file://authz.json --policy-engine-configuration file://pe-enf.json --region "$REGION" >/dev/null
wait_active "aws bedrock-agentcore-control get-gateway --gateway-identifier $GW_ID --region $REGION --query status --output text" READY
log "engine flipped to ENFORCE"

# ---- 9. state ----
cat > "$STATE" <<EOF
REGION=$REGION
ACCOUNT=$ACC
POOL_ID=$POOL_ID
CLIENT_ID=$CLIENT_ID
DISCOVERY=$DISCOVERY
ENGINE_ID=$ENGINE_ID
GW_ID=$GW_ID
GW_ARN=$GW_ARN
GW_URL=$GW_URL
EOF
log "DONE. State -> $STATE"
echo "Gateway URL: $GW_URL   (mode ENFORCE)"
