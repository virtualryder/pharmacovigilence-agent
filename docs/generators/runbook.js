const G = require("./guides.js");
const { H1, H2, H3, P, bold, code, bullet, num, codeBlock, callout, table, spacer, coverAndToc, makeDoc, Packer } = G;

const cover = coverAndToc(
  ["Pharmacovigilance Agent", "on Amazon Bedrock AgentCore"],
  "Solution Architect Deployment Runbook",
  "Step-by-step deployment of the governed pharmacovigilance (ICSR intake) accelerator into an AWS account — identity, governance spine, tools, and the Runtime agent. Region: us-east-1. Accelerator reference; not production-certified. Version 1.0 · 2026.",
  ["1. Overview", "2. Prerequisites", "3. What gets deployed", "4. Deployment procedure", "5. Configuration reference", "6. Validation checklist", "7. Teardown", "8. Windows / Git-Bash operational notes"]
);

const body = [
  H1("1. Overview"),
  P("This runbook stands up the governed pharmacovigilance (PV) agent in an AWS account. The deployment is split into three lifecycles that are deployed and torn down independently:"),
  bullet([bold("Identity stack "), "— a stable Amazon Cognito user pool, app client, and test users. Long-lived; not touched by spine redeploys."]),
  bullet([bold("Governance spine "), "— the Cedar policy engine, AgentCore Gateway, tool Lambdas, Bedrock Guardrail, WORM audit stores, and the Step Functions human sign-off gate. Reproducible; stood up and torn down as a unit."]),
  bullet([bold("Runtime agent "), "— the Strands PV agent, containerized and deployed to AgentCore Runtime with a Cognito JWT inbound authorizer."]),
  P("The whole spine deploys with one command, proves itself with a 17-check governance demo, and tears down with zero residual. The Runtime agent is decoupled: it discovers the gateway at runtime and validates against the stable pool, so spine redeploys never require touching it."),
  callout("Honesty boundary", [["This is an accelerator, not a production-certified system. Computer-system validation (CSV/CSA), IdP federation, connectors to live safety systems, licensed MedDRA/WHODrug dictionaries, and production authorization to operate (ATO) are customer responsibilities. See the Regulatory-Adherence Guide."]], G.colors.AMBER, "FBF3E7"),

  H1("2. Prerequisites"),
  H2("2.1 AWS account & access"),
  bullet([bold("An AWS account "), "with administrative credentials configured for the AWS CLI (", code("aws sts get-caller-identity"), " must succeed)."]),
  bullet([bold("Region "), "— us-east-1 (the reference deployment; Comprehend Medical, Bedrock models, and AgentCore are all available there)."]),
  bullet([bold("Model access "), "— enable the Anthropic Claude models in Amazon Bedrock (the drafting tool defaults to the ", code("us.anthropic.claude-sonnet-4-5"), " cross-region inference profile)."]),
  H2("2.2 Tooling"),
  table(["Tool", "Version / note"], [
    [code("aws"), "AWS CLI v2.30+ (validated on 2.33)"],
    [code("python3"), "3.12 (Lambda runtime is python3.12; the Runtime toolkit needs a 3.12 venv)"],
    [code("node"), "Node.js 18+ (only for local tooling)"],
    ["bash", "Any POSIX shell. On Windows, use Git-Bash (see §8)"],
    [code("agentcore"), "bedrock-agentcore-starter-toolkit (installed into the Runtime venv in Step 4)"],
  ], [2600, 7840]),
  H2("2.3 Project layout"),
  bullet([bold("pharmacovigilance agent/ "), "— the governance spine + tools. Key folders: ", code("scripts/"), " (IaC), ", code("tools/"), " (Lambda sources + MCP client), ", code("policies/"), " (Cedar)."]),
  bullet([bold("pv-runtime/ "), "— the Runtime agent (kept in a space-free path for the container toolchain): ", code("agent.py"), ", ", code("Dockerfile"), ", ", code("requirements.txt"), ", and the ", code("_configure/_launch/_invoke/_obs_setup"), " helper scripts."]),

  H1("3. What gets deployed"),
  table(["Component", "AWS resource(s)", "Lifecycle"], [
    [[bold("Identity")], "Cognito user pool pv-icsr, app client pv-gw, users reviewer / approver / outsider", "Stable"],
    [[bold("Policy engine")], "AgentCore Policy engine pv_icsr_authz (Cedar, deny-by-default)", "Spine"],
    [[bold("Gateway")], "AgentCore Gateway pv-icsr-gw (MCP, CUSTOM_JWT, ENFORCE)", "Spine"],
    [[bold("Tools")], "Lambdas: pv-openfda-lookup, pv-mask-phi, pv-core-tools, pv-write-audit, pv-request-signoff (+ 3 sign-off Lambdas)", "Spine"],
    [[bold("Guardrail")], "Bedrock Guardrail pv-icsr-guardrail (PII anonymize + prompt-attack)", "Spine"],
    [[bold("WORM audit")], "DynamoDB pv-audit (append-only) + S3 Object Lock bucket pv-audit-worm-<acct>-<region>", "Spine"],
    [[bold("Human gate")], "Step Functions pv-signoff + DynamoDB pv-pending-approvals", "Spine"],
    [[bold("Discovery")], "SSM parameter /pv-icsr/gateway-url", "Spine"],
    [[bold("Runtime")], "AgentCore Runtime pv_runtime_agent (ARM64 container via CodeBuild + ECR)", "Runtime"],
  ], [1700, 6300, 1440]),

  H1("4. Deployment procedure"),
  P([bold("Run the steps in order. "), "All commands assume you are in the ", code("pharmacovigilance agent/"), " directory unless noted, with the AWS CLI configured for us-east-1."]),

  H2("Step 0 — Confirm the environment"),
  ...codeBlock(["aws sts get-caller-identity          # confirms credentials", "aws configure get region             # should print us-east-1", "python3.12 --version                 # 3.12.x (the Runtime venv in Step 4 needs 3.12)"]),

  H2("Step 1 — Deploy the stable identity stack"),
  P(["Creates (or reuses) the Cognito pool, app client, groups, and the three test users; writes ", code("identity-state.env"), ". Idempotent and safe to re-run."]),
  ...codeBlock(["bash scripts/deploy_identity.sh"]),
  P([bold("Result: "), "pool ", code("pv-icsr"), ", client ", code("pv-gw"), ", users ", code("reviewer"), " / ", code("approver"), " (group ", code("pv_reviewer"), ") and ", code("outsider"), ". Discovery URL and IDs land in ", code("identity-state.env"), "."]),

  H2("Step 2 — Deploy the governance spine"),
  P(["One idempotent command builds the entire spine in the proven order: IAM roles → WORM stores → Guardrail → tool Lambdas → policy engine → Gateway (LOG_ONLY) → targets → Cedar policies → flip to ENFORCE → human-gate Step Functions → publish the gateway URL to SSM. It sources the stable identity and writes ", code("spine-state.env"), "."]),
  ...codeBlock(["bash scripts/deploy_spine.sh"]),
  callout("Run cycles serialized", [["Do not run two spine deploys concurrently — overlapping runs collide on the policy-engine name. Deploy takes roughly three to four minutes end to end."]], G.colors.TEAL),

  H2("Step 3 — Prove the governance (17 checks)"),
  P("Mints reviewer and outsider tokens and exercises the full governed workflow live, in ENFORCE mode. Expect 17 passed / 0 failed."),
  ...codeBlock(["bash scripts/demo.sh"]),
  P("The demo proves deny-by-default (reviewer ALLOW / outsider DENY), the mask-before-model and no-self-submit forbids (each denial names the exact Cedar policy), real PHI masking, a real Bedrock narrative through the Guardrail, the immutable WORM audit (write-once + duplicate rejection), and the human sign-off gate (separation of duties + single-use token)."),

  H2("Step 4 — Deploy the Runtime agent"),
  P(["From the ", code("pv-runtime/"), " directory. Create the Python 3.12 virtual environment and install the toolkit once. Use the ", code("setup_venv.sh"), " helper — it builds the venv with the correct per-OS layout (on Windows a venv exposes ", code("Scripts/"), ", not ", code("bin/"), ") and installs ", code("bedrock-agentcore"), ", ", code("bedrock-agentcore-starter-toolkit"), ", ", code("strands-agents"), ", and ", code("strands-agents-tools"), ":"]),
  ...codeBlock(["cd ../pv-runtime               # or the pv-runtime path", "bash setup_venv.sh            # py -3.12 venv + toolkit install (Windows-correct paths)"]),
  P(["Grant the Runtime execution role permission to read the gateway-URL parameter, configure the agent with the Cognito JWT inbound authorizer, and launch it (ARM64 build runs in CodeBuild — no local Docker needed):"]),
  ...codeBlock(["bash _obs_setup.sh             # grants ssm:GetParameter to the runtime role", "bash _configure.sh            # agentcore configure -- JWT authorizer from identity-state.env", "bash _launch.sh               # agentcore launch -- CodeBuild ARM64 -> Runtime"]),
  P([bold("Result: "), "an AgentCore Runtime ", code("pv_runtime_agent-<id>"), " with a Cognito JWT inbound authorizer, OpenTelemetry observability enabled, and the gateway URL discovered from SSM."]),

  H2("Step 5 — Invoke and verify"),
  P("Invoke as a reviewer (full governed workflow) and as an outsider (access denied):"),
  ...codeBlock(["bash _invoke.sh reviewer 'PvReviewer#2026!'", "bash _invoke.sh outsider 'PvOutsider#2026!'"]),
  P(["Expected: the reviewer returns a workflow summary (FAERS lookup, masked narrative, INTENT audit, PENDING_APPROVAL) and ", code("tools_available"), " that does not include ", code("finalize_submission"), " — Cedar hides the forbidden tool. The outsider returns ", code("ACCESS DENIED"), " with ", code("tools_available: []"), "."]),

  H1("5. Configuration reference"),
  table(["Setting", "Where", "Default / value"], [
    ["Region", "AWS_REGION env / CLI", "us-east-1"],
    ["Drafting model", [code("DRAFT_MODEL_ID"), { text: " env on pv-core-tools", size: 19 }], "us.anthropic.claude-sonnet-4-5-20250929-v1:0"],
    ["Guardrail", "pv-icsr-guardrail (created in deploy)", "PII=ANONYMIZE + PROMPT_ATTACK HIGH; version DRAFT"],
    ["Cognito users", "deploy_identity.sh", "reviewer / PvReviewer#2026!, approver / PvApprover#2026!, outsider / PvOutsider#2026!"],
    ["Gateway URL", "SSM /pv-icsr/gateway-url", "published each spine deploy; read by the Runtime agent"],
    ["Reviewer group", "Cedar permit condition", "cognito:groups contains pv_reviewer"],
    ["Audit stores", "deploy_spine.sh", "DynamoDB pv-audit + S3 pv-audit-worm-<acct>-<region> (Object Lock GOVERNANCE 1d)"],
  ], [2100, 3540, 4800]),
  callout("Change the passwords before any shared use", [["The default test-user passwords above are for a private evaluation account only. Rotate them (or federate a real IdP) before the environment is shared. See the Maintenance Guide."]], G.colors.AMBER, "FBF3E7"),

  H1("6. Validation checklist"),
  bullet([code("deploy_identity.sh"), " → identity-state.env written; pool visible in Cognito."]),
  bullet([code("deploy_spine.sh"), " → ends with ", code("[deploy] DONE"), " and a ", code("Gateway URL: … (mode ENFORCE)"), " line."]),
  bullet([code("demo.sh"), " → ", code("17 passed, 0 failed"), " / ", code("GOVERNANCE DEMO: PASS"), "."]),
  bullet(["SSM parameter ", code("/pv-icsr/gateway-url"), " exists and matches the live gateway."]),
  bullet(["Runtime invoke: reviewer → workflow summary; outsider → ACCESS DENIED."]),
  bullet(["CloudWatch log group ", code("/aws/bedrock-agentcore/runtimes/pv_runtime_agent-*-DEFAULT"), " shows per-step, identity-tagged logs."]),

  H1("7. Teardown"),
  P("The spine tears down with zero residual (including the Object-Lock bucket, which requires an admin governance-bypass the tool role does not have). Identity is preserved by design — remove it explicitly only when finished."),
  ...codeBlock(["bash scripts/destroy_spine.sh              # spine only; leaves identity + Runtime", "# optional, full cleanup:", "bash scripts/destroy_identity.sh           # removes the Cognito pool", "./.venv/Scripts/agentcore.exe destroy      # from pv-runtime/, removes the Runtime", "#   (on macOS/Linux: ./.venv/bin/agentcore destroy)"]),
  callout("Export evidence first", [["The WORM audit ledger and bucket are deleted by ", code("destroy_spine.sh"), ". Export any audit evidence you need to retain before tearing down. See the Maintenance Guide, §5."]], G.colors.TEAL),

  H1("8. Windows / Git-Bash operational notes"),
  P("The reference environment is Windows with Git-Bash driving the native AWS CLI. If you deploy from Windows, these matter (they are already handled inside the scripts, but explain surprising behavior):"),
  bullet([bold("Run scripts through Git-Bash: "), code("cmd /c C:\\PROGRA~1\\Git\\bin\\bash.exe -l scripts/deploy_spine.sh"), "."]),
  bullet([bold("Path conversion: "), "Git-Bash rewrites arguments that start with ", code("/"), " (e.g. SSM names, log-group names) into Windows paths. The scripts set ", code("MSYS_NO_PATHCONV=1"), " to prevent this."]),
  bullet([bold("Carriage returns: "), "the CLI ", code("--output text"), " picks up a trailing ", code("\\r"), "; the scripts pipe through ", code("tr -d '\\r'"), " where it matters."]),
  bullet([bold("file:// paramfiles: "), "the native CLI cannot resolve Git-Bash absolute paths, so the scripts keep paramfiles relative to the working directory."]),
  bullet([bold("AgentCore toolkit: "), "export ", code("PYTHONIOENCODING=utf-8"), " and ", code("AGENTCORE_SUPPRESS_RECOMMENDATION=1"), " (already set in the helper scripts) so the rich console output does not crash under the Windows codepage."]),
  bullet([bold("Helper-script paths: "), "the ", code("pv-runtime/"), " helpers (", code("setup_venv.sh"), ", ", code("_configure.sh"), ", ", code("_launch.sh"), ", ", code("_invoke.sh"), ") ", code("cd"), " to the reference path ", code("/c/Users/daryd/Projects-DR/pv-runtime"), " and source ", code("spine-state.env"), " by absolute path. If you clone the project to a different location, update those paths first."]),
  spacer(),
  P([{ text: "End of runbook. See the Regulatory-Adherence Guide for the control-to-requirement mapping and the Maintenance Guide for day-two operations.", italics: true, color: G.colors.MUTED }]),
];

const doc = makeDoc(cover, body, "PV AgentCore · SA Deployment Runbook");
Packer.toBuffer(doc).then((b) => { require("fs").writeFileSync("PV-AgentCore-SA-Runbook.docx", b); console.log("wrote runbook"); });
