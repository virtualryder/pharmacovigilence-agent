const G = require("./guides.js");
const { H1, H2, H3, P, bold, code, bullet, num, codeBlock, callout, table, spacer, coverAndToc, makeDoc, Packer } = G;

const cover = coverAndToc(
  ["Maintenance & Operations Guide"],
  "Pharmacovigilance Agent on Amazon Bedrock AgentCore",
  "Day-two operations for the governed PV accelerator — routine changes, the Runtime lifecycle, monitoring, audit-evidence handling, teardown/rebuild, and the known toolchain gotchas. Accelerator reference. Version 1.0 · 2026.",
  ["1. Operating model", "2. Routine operations", "3. The Runtime agent lifecycle", "4. Monitoring & observability", "5. Audit-evidence management", "6. Teardown & rebuild", "7. Troubleshooting & known gotchas", "8. Cost & housekeeping"]
);

const body = [
  H1("1. Operating model"),
  P("The deployment has three lifecycles, and keeping them straight is the key to safe operations:"),
  table(["Lifecycle", "What it contains", "Cadence"], [
    [[bold("Identity")], "Cognito pool, app client, users/groups", "Stable — changed rarely; survives spine redeploys"],
    [[bold("Governance spine")], "Cedar engine, Gateway, tools, Guardrail, WORM audit, human gate", "Reproducible — redeploy freely; zero-residual teardown"],
    [[bold("Runtime agent")], "Strands agent container on AgentCore Runtime", "Decoupled — survives spine redeploys untouched"],
  ], [1900, 5540, 3000]),
  callout("Why this matters", [["Because identity is stable and the Runtime discovers the gateway from SSM, you can rebuild the entire spine as often as you like without ever redeploying the Runtime or invalidating user tokens."]], G.colors.TEAL),

  H1("2. Routine operations"),
  H2("2.1 Refresh the spine"),
  P("The safest way to apply most spine changes is a clean rebuild. Destroy leaves identity intact; deploy reuses it."),
  ...codeBlock(["bash scripts/destroy_spine.sh", "bash scripts/deploy_spine.sh", "bash scripts/demo.sh          # smoke test: expect 17/17"]),
  P([bold("Note: "), "run cycles serialized — never two concurrent spine deploys."]),

  H2("2.2 Update a tool (Lambda)"),
  P(["Edit the source in ", code("tools/"), " (for example ", code("mask_phi.py"), " or ", code("core_tools.py"), "), then redeploy the spine, which repackages and updates every tool Lambda. For a fast single-tool iteration you can update just one function's code without a full rebuild:"]),
  ...codeBlock(["# fast path — update one Lambda's code in place:", "cd 'pharmacovigilance agent/tools'", "cp core_tools.py lambda_function.py", "python -c \"import zipfile;z=zipfile.ZipFile('f.zip','w');z.write('lambda_function.py');z.close()\"", "aws lambda update-function-code --function-name pv-core-tools \\", "    --zip-file fileb://f.zip --region us-east-1"]),
  callout("Environment variables survive a code update", [["update-function-code changes only the code, so env settings such as DRAFT_MODEL_ID and GUARDRAIL_ID persist. A full deploy re-applies them from scratch."]], G.colors.TEAL),

  H2("2.3 Change Cedar policies"),
  P(["Policies are authored in ", code("deploy_spine.sh"), " (section 7) and mirrored in ", code("policies/*.cedar"), ". To add or change a permit/forbid, edit the statement and redeploy. Two rules to remember:"]),
  bullet([bold("Policies validate against the tool schemas. "), "A policy that references a tool input must match the Gateway's tool definition — deploy the tools before the policies (the script already orders this)."]),
  bullet([bold("Use the LOG_ONLY → ENFORCE path. "), "The spine attaches the engine in LOG_ONLY, validates, then flips to ENFORCE. For risky policy changes, test in LOG_ONLY first."]),
  P([bold("Cedar reminders: "), code("cognito:groups"), " is a string tag — match with ", code("like \"*pv_reviewer*\""), "; scope resources to ", code("AgentCore::Gateway"), "; a blanket forbid needs ", code("--validation-mode IGNORE_ALL_FINDINGS"), "; ", code("create-policy"), " is asynchronous — poll ", code("get-policy"), "."]),

  H2("2.4 Adjust the Bedrock Guardrail"),
  P(["The output guardrail ", code("pv-icsr-guardrail"), " (PII anonymize + prompt-attack) is created on first deploy and reused by name thereafter. To change its policy, either update it in place or delete and let the next deploy recreate it:"]),
  ...codeBlock(["# change PII entities / filters, then:", "aws bedrock update-guardrail --guardrail-identifier <id> ... --region us-east-1", "# or force recreation on next deploy:", "aws bedrock delete-guardrail --guardrail-identifier <id> --region us-east-1"]),

  H2("2.5 Swap the drafting model"),
  P([code("draft_narrative"), " uses the model in ", code("DRAFT_MODEL_ID"), " (default ", code("us.anthropic.claude-sonnet-4-5-20250929-v1:0"), "). Point it at another enabled model or inference profile:"]),
  ...codeBlock(["aws lambda update-function-configuration --function-name pv-core-tools \\", "    --environment 'Variables={GUARDRAIL_ID=<id>,GUARDRAIL_VERSION=DRAFT,\\", "        DRAFT_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0}' --region us-east-1"]),
  P([bold("Gotcha: "), "some newer models reject ", code("temperature"), " and ", code("topP"), " together via Converse — the tool sends temperature only. Keep that in mind if you customize inference parameters."]),

  H2("2.6 Manage identity"),
  bullet([bold("Add or reset users: "), "re-run ", code("bash scripts/deploy_identity.sh"), " (idempotent), or use ", code("aws cognito-idp admin-set-user-password"), " to rotate a password."]),
  bullet([bold("Rotate the default passwords "), "before any shared use of the environment."]),
  bullet([bold("Production: "), "federate the customer's real identity provider and map workforce roles to the ", code("pv_reviewer"), " group / claim, rather than using the built-in test users."]),

  H1("3. The Runtime agent lifecycle"),
  bullet([bold("After an agent code change: "), "from ", code("pv-runtime/"), " run ", code("bash _launch.sh"), " (uses ", code("--auto-update-on-conflict"), ") — the container rebuilds in CodeBuild and the same Runtime ARN is updated."]),
  bullet([bold("After a spine redeploy: "), "do nothing. The gateway URL rotates, but the agent reads it from SSM ", code("/pv-icsr/gateway-url"), " at invoke time, and identity is stable — the Runtime keeps working."]),
  bullet([bold("Only if identity changes "), "(you rebuild the Cognito pool) re-point the Runtime: ", code("bash _repoint.sh"), " then ", code("bash _verify_rt.sh"), "."]),
  bullet([bold("Verify anytime: "), code("bash _invoke.sh reviewer"), " and ", code("bash _invoke.sh outsider $PV_OUTSIDER_PW"), "."]),

  H1("4. Monitoring & observability"),
  P("Observability is enabled on the Runtime (OpenTelemetry) and every governed step is logged with the acting identity."),
  bullet([bold("Runtime logs: "), code("aws logs tail /aws/bedrock-agentcore/runtimes/pv_runtime_agent-<id>-DEFAULT --since 1h"), " — per-step, identity-tagged, OTel-correlated (trace/span IDs)."]),
  bullet([bold("GenAI dashboard: "), "the CloudWatch GenAI Observability console surfaces agent/tool spans (requires CloudWatch Transaction Search enabled in the account)."]),
  bullet([bold("Spine smoke test: "), code("bash scripts/demo.sh"), " is the fastest health check — 17/17 means the whole governed path is intact."]),
  bullet([bold("Watch for: "), "repeated ", code("ACCESS DENIED"), " (identity/authorization drift), ", code("draft failed"), " (model access or inference-parameter issues), and guardrail blocks on drafting."]),

  H1("5. Audit-evidence management"),
  P(["The audit lives in two places: the append-only DynamoDB ledger ", code("pv-audit"), " (point-in-time recovery enabled) and the S3 Object Lock bucket ", code("pv-audit-worm-<acct>-<region>"), "."]),
  bullet([bold("Retention: "), "the reference bucket uses Object Lock in GOVERNANCE mode with a 1-day default retention for easy evaluation. For production, raise the retention period (and consider COMPLIANCE mode) to your record-retention policy."]),
  bullet([bold("Export before teardown: "), code("destroy_spine.sh"), " deletes the ledger and bucket. Export first — scan the DynamoDB table and sync the bucket to a retained location:"]),
  ...codeBlock(["aws dynamodb scan --table-name pv-audit --region us-east-1 > audit-ledger.json", "aws s3 sync s3://pv-audit-worm-<acct>-us-east-1 ./audit-evidence/"]),
  callout("Tamper-evidence is by construction", [["The tool role can write audit records but is denied delete, update, and Object-Lock bypass. Only an administrator with an explicit governance-bypass can remove locked objects — which is exactly what the teardown script does."]], G.colors.TEAL),

  H1("6. Teardown & rebuild"),
  bullet([bold("Spine only (keep identity + Runtime): "), code("bash scripts/destroy_spine.sh"), " — zero residual, including the Object-Lock bucket."]),
  bullet([bold("Clean refresh: "), "destroy then deploy (or the ", code("_cycle"), " launcher). Identity and the Runtime are unaffected."]),
  bullet([bold("Full removal: "), code("destroy_spine.sh"), ", then ", code("destroy_identity.sh"), ", then ", code("agentcore destroy"), " from ", code("pv-runtime/"), "."]),

  H1("7. Troubleshooting & known gotchas"),
  table(["Symptom", "Cause & fix"], [
    ["ConflictException on the policy engine at deploy", "Two spine deploys overlapped. Run serialized; a fresh destroy → deploy clears it."],
    ["Runtime invoke returns 424 / gateway not found", "SSM parameter missing or stale. Confirm /pv-icsr/gateway-url exists and matches the live gateway; the deploy sets MSYS_NO_PATHCONV=1 so the name isn't mangled on Windows."],
    ["SSM ParameterNotFound in the agent logs", "The put-parameter name was path-mangled by Git-Bash. Ensure MSYS_NO_PATHCONV=1 is exported (it is, at the top of deploy_spine.sh)."],
    ["'draft failed: ValidationException ... temperature and top_p'", "The model rejects both parameters together via Converse. Send temperature only."],
    ["agentcore configure/launch crashes with a Unicode or console error", "Windows codepage. Export PYTHONIOENCODING=utf-8, PYTHONUTF8=1, AGENTCORE_SUPPRESS_RECOMMENDATION=1 (set in the helper scripts)."],
    ["configure hangs or errors on a prompt", "prompt_toolkit needs a real console. Use create mode (-c) and pass the authorizer config (-ac) so no interactive prompt fires."],
    ["'Invalid version id' during bucket teardown", "Git-Bash trailing \\r on the version id. Pipe list output through tr -d '\\r' (handled in destroy_spine.sh)."],
    ["demo shows a tool ALLOW but no result field", "The MCP client truncates long output (~200 chars). Put short proof fields first in the tool response, or grep an early field."],
  ], [3100, 7340]),

  H1("8. Cost & housekeeping"),
  bullet([bold("Idle cost is low: "), "Lambdas, DynamoDB (on-demand), and the Gateway are pay-per-use; the largest steady item is the Runtime container and any provisioned observability."]),
  bullet([bold("Tear down between evaluations "), "to keep costs near zero — ", code("destroy_spine.sh"), " leaves only the stable identity and the (idle) Runtime."]),
  bullet([bold("CodeBuild & ECR: "), "each Runtime deploy pushes an image tag to ECR; prune old tags periodically."]),
  bullet([bold("Region: "), "keep all components in us-east-1 for the reference deployment — Comprehend Medical, the Bedrock models, and AgentCore are co-located there."]),
  spacer(),
  P([{ text: "End of maintenance guide. See the SA Deployment Runbook for first-time setup and the Regulatory-Adherence Guide for the control mapping.", italics: true, color: G.colors.MUTED }]),
];

const doc = makeDoc(cover, body, "PV AgentCore · Maintenance & Operations Guide");
Packer.toBuffer(doc).then((b) => { require("fs").writeFileSync("PV-AgentCore-Maintenance.docx", b); console.log("wrote maintenance"); });
