# PV AgentCore-Native Build — State & Grounded Notes

*Living build log for the AgentCore-native pharmacovigilance agent. Keep this current; it's the single source of truth for what exists on the account and the exact build order. Last update: 2026-07-15.*

## Decisions (locked)
- **Max-native** on AgentCore: agent on Runtime, tools via Gateway (MCP), identity via Identity (Cognito JWT), deny-by-default authz via **AgentCore Policy (Cedar)**.
- **Keep** the human sign-off (separation-of-duties) gate — Step Functions `waitForTaskToken` — before ICSR commit. AgentCore has no native human gate.
- **Replace** the Python `platform_core.policy_engine` with Cedar policies as the single source of truth.

## Account state (us-east-1, acct 111122223333)
| Resource | Status | Id / ARN |
|---|---|---|
| AgentCore Policy Engine | ACTIVE | `pv_icsr_authz-dhawn7kis8` |
| IAM gateway role (+inline perms `pv-gw-perms`) | created | `arn:aws:iam::111122223333:role/pv-agentcore-gw` |
| Cognito user pool (JWT issuer) | created | pool `us-east-1_OCn75aBxM` · client `4mgvf5pjap427hhq1b785fra8t` · users `reviewer` (grp pv_reviewer) / `outsider` |
| AgentCore Gateway (MCP, CUSTOM_JWT, engine **ENFORCE**) | READY | `pv-icsr-gw-fnq8n59ipa` · `https://pv-icsr-gw-fnq8n59ipa.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp` |
| Gateway targets | 2 live (3 tools) | `openfda-lookup` (MMAURQ7LI4)→`pv-openfda-lookup`; `pv-core` (0P2KRV6R95)→`pv-core-tools` exposing `draft_narrative`+`finalize_submission`. Tool ids `<target>___<tool>`. 4 more tools pending. |
| Cedar policies (on engine) | 3 live | permit `pv_reviewer_permit-u43vydu28z`; forbid `mask_before_draft-4qjr57e72r` (draft unless `context.input.deidentified==true`); forbid `no_self_submit-cqf7d6fh84` (never `finalize_submission`). |
| **DENY-BY-DEFAULT + BOTH FORBIDS PROVEN (ENFORCE, 2026-07-15)** | ✅ | reviewer→openfda ALLOW; outsider→openfda DENY (default-deny); reviewer→draft(deid=false) DENY (`mask_before_draft`), draft(deid=true) ALLOW, finalize DENY (`no_self_submit`). Denial message names the firing policy. Proof scripts: `_mcp_call.py`, `_forbid_proof.py`. |

## ✅ Reproducible IaC — VALIDATED (2026-07-15)
The whole governance spine is captured as one-command IaC-as-scripts and the clean cycle is **green from scratch**:
- `scripts/deploy_spine.sh` — idempotent stand-up: engine → IAM/Cognito → gateway (LOG_ONLY) → targets → 3 Cedar policies → flip **ENFORCE**. Writes `spine-state.env`.
- `scripts/demo.sh` — one-command allow/deny + both-forbids proof (mints reviewer+outsider tokens, calls via `tools/mcp_client.py` with full tool ids).
- `scripts/destroy_spine.sh` — best-effort zero-residual teardown.
- `_cycle.sh` (launcher) — destroy → deploy → demo → `_cycle.log`.
- **Confirmed run 2026-07-15 12:37–12:39:** DESTROY clean → DEPLOY_EXIT=0 (engine `pv_icsr_authz-3rs9ixkwl1`, gw `pv-icsr-gw-mqlz1dynw6`) → **DEMO 5 passed / 0 failed**, denials verbatim naming `mask_before_draft-*` and `no_self_submit-*`.
- Bugs fixed to get here: destroy `list-policy-engines` query field (`policyEngines[?name==].policyEngineId`); deploy `t-core.json` printf missing closing brace. Earlier ConflictException was a **race from two overlapping `_cycle.sh` runs**, not a script bug — run serialized.
- NOTE: live resource IDs rotate every cycle; `spine-state.env` holds the current ones. The Account-state IDs table above may lag a cycle — trust `spine-state.env`.

## ✅ First REAL tool body — mask_phi (fail-closed PHI de-id) — LIVE-PROVEN (2026-07-15)
`tools/mask_phi.py` replaces the stub: real **Comprehend Medical `DetectPHI`** (mandatory, fail-closed) + best-effort **Comprehend `DetectPiiEntities`** backstop on the already-masked text. Contract: `{case}` -> `{deidentified:true, masked_case, entities_masked}` on success, or `{deidentified:false, masked_case:null, error}` on any detection failure (**no un-masked text ever emitted** — that's the fail-closed guarantee; `deidentified` is the flag Cedar's `mask_before_draft` gates on).
- Deployed as Lambda `pv-mask-phi` + Gateway target `mask-phi` (tool id `mask-phi___mask_phi`). Tool-exec role got inline policy `pv-tool-nlp` (comprehendmedical:DetectPHI + comprehend:DetectPiiEntities). All in `deploy_spine.sh` / cleaned by `destroy_spine.sh`.
- **Confirmed live (ENFORCE) 2026-07-15 ~13:29, demo now 7/7:** `mask_phi("Patient John Smith, DOB 04/12/1972, MRN 55512345, ...acute kidney injury after lisinopril")` -> `Patient [REDACTED:NAME], DOB [REDACTED:DATE], MRN [REDACTED:ID], reported acute kidney injury after taking lisinopril.` (phi_entities=3; clinical signal preserved). demo asserts name removed + REDACTED markers present.
- Reviewer permitted to call mask_phi via the broad `pv_reviewer_permit` (no new policy needed). Chain: mask_phi -> deidentified=true -> draft ALLOW; skip masking -> draft DENY.
- Real bodies now: mask_phi ✅, draft_narrative ✅, write_audit ✅. Still stubbed: `openfda_lookup` (deterministic stub), `assemble_case`, `code_meddra_whodrug`. `finalize_submission` stays deny-only (human gate owns it).

## ✅ Second REAL tool body — draft_narrative on Bedrock — LIVE-PROVEN (2026-07-15)
`tools/core_tools.py` draft branch now calls **Bedrock Converse** (model env `DRAFT_MODEL_ID`, default `us.anthropic.claude-sonnet-4-5-20250929-v1:0` — an ACTIVE cross-region inference profile in the account). CIOMS-style system prompt instructs: preserve `[REDACTED:...]` tokens verbatim, invent nothing, cover reporter/patient/suspect-drug/event/timeline/outcome/causality. Belt-and-suspenders: refuses to draft unless `deidentified is True` (Cedar already blocks, this is defense-in-depth). On model error it returns `{error, drafted_by:null}` — never fabricates.
- IAM: tool-exec inline `pv-tool-nlp` now also grants `bedrock:InvokeModel(+Stream)` (Resource `*`; scope for prod). Lambda timeout raised 15s→60s for drafting.
- **Proven live (ENFORCE) 2026-07-15, demo now 8/8:** masked case → `{"narrative":"This case was reported by a treating nephrologist and concerns a [REDACTED:AGE] patient, [REDACTED:NAME], who experienced rhabdomyolysis and acute kidney injury following treatment with lisinopril...","drafted_by":"us.anthropic.claude-sonnet-4-5...","chars":N}`. Model preserved the redaction tokens.
- GOTCHA: Sonnet 4.5 via Converse rejects `temperature`+`topP` together ("cannot both be specified") → send temperature only. demo now asserts the draft returns `"narrative"` and NOT `"error"` (so an allowed-but-errored tool can't hide behind a green authz check).
- Available models in acct (us-east-1): claude-3-haiku / claude-3-sonnet ON_DEMAND (bare id); claude-sonnet-4/4-5/4-6/5 + haiku-4-5 via `us.`/`global.` INFERENCE_PROFILE ids.

## ✅ Third REAL tool body — write_audit + immutable WORM audit — LIVE-PROVEN (2026-07-15)
`tools/write_audit.py` appends a tamper-evident record to TWO write-once stores; the tool's exec role can PutItem/PutObject but is **explicitly DENIED** DeleteItem/UpdateItem/DeleteObject/BypassGovernanceRetention — the principal that writes evidence cannot alter or destroy it.
- **Append-only DynamoDB ledger `pv-audit`** (authoritative): `audit_id` = SHA-256 of the logical record (icsr_id/action/phase/actor/deidentified/payload, excluding timestamp); conditional `PutItem(attribute_not_exists(audit_id))` makes it un-overwritable. Replaying the same logical event collides → `{stored:false, reason:"append-only..."}` = the immutability proof. PITR enabled.
- **S3 Object Lock bucket `pv-audit-worm-<acct>-<region>`** (WORM copy): created with `--object-lock-enabled-for-bucket` + default retention `GOVERNANCE 1d` + public-access-block. Each record also written as an immutable object.
- Lambda `pv-write-audit`, Gateway target `write-audit` (tool `write-audit___write_audit`). Bucket/table names derived in-Lambda from acct+region (no env needed). Reviewer allowed via broad `pv_reviewer_permit`.
- **Proven live (ENFORCE) 2026-07-15, demo now 11/11:** 1st write → `{"stored":true,"worm":true,"audit_id":"eb1bec62...","table":"pv-audit","bucket":"pv-audit-worm-111122223333-us-east-1","key":"ICSR-2026-0002/..."}`; identical re-write → rejected append-only.
- **Zero-residual teardown validated:** destroy purges the Object Lock bucket by deleting every version with `--bypass-governance-retention` (admin can; tool role can't), then delete-bucket, then delete-table. GOTCHA: Git-Bash on Windows appends `\r` to `--output text` version ids ("Invalid version id specified") → pipe list through `tr -d '\r'` before the delete loop. Full cycle now: 11/11 green + zero residual incl. WORM bucket + ledger.

## ✅ Human sign-off gate (separation of duties) — LIVE-PROVEN (2026-07-15); demo now 16/16
The 3rd build-alongside control (AgentCore has no native human gate). `finalize` NEVER runs inline; the sanctioned path is: `request_signoff` (governed tool) → Step Functions `pv-signoff` pauses at `waitForTaskToken` → a DIFFERENT qualified person approves out-of-band with a single-use token → privileged `pv-finalize` runs → COMMITTED audited. `write_audit` INTENT at request.
- **Lambdas:** `pv-request-signoff` (gateway tool `request-signoff___request_signoff`; role pv-tool-exec + states:StartExecution; writes INTENT audit; StartExecution); `pv-signoff-register` (waitForTaskToken target; persists token to `pv-pending-approvals`); `pv-approve` (OUT-OF-BAND human action, NOT a gateway tool; enforces approver≠requester + single-use via conditional PENDING→CONSUMED; SendTaskSuccess); `pv-finalize` (privileged submit + COMMITTED audit). Last three on role `pv-signoff-exec`.
- **State machine `pv-signoff`** (STANDARD): AwaitApproval (`arn:aws:states:::lambda:invoke.waitForTaskToken`) → Finalize (`lambda:invoke`). Role `pv-signoff-sfn` (invoke register+finalize). ASL `scripts/pv-signoff.asl.json`.
- **Table `pv-pending-approvals`** (PK icsr_id). **Cognito user `approver`** added (2nd qualified person; <APPROVER_PW>).
- **Proven live (ENFORCE):** request_signoff ALLOW→starts workflow; self-approve (reviewer) BLOCKED (separation-of-duties); approver (different) → approved; execution SUCCEEDED (finalized only after approval); re-approval rejected (single-use). Standalone `scripts/test_signoff.sh` (8/8) + folded into `demo.sh` (16/16).
- **GOTCHA:** `create-state-machine --definition file://` needs a RELATIVE path in $WORK (cwd) — native Windows aws.exe can't resolve Git-Bash `/c/Users/...` absolute paths (project dir has a SPACE too). cp the ASL into $WORK first.
- **GOTCHA:** mcp_client truncates its printed result (~200 chars) → can't json-parse the (cut-off) object; `grep -o 'arn:aws:states:[A-Za-z0-9:_-]*'` the execution ARN instead.
- **All 3 build-alongside controls now DONE:** fail-closed masking ✅, immutable WORM audit ✅, human sign-off gate ✅.

## ✅ Runtime + Identity — agent runs NATIVELY on AgentCore Runtime — LIVE-PROVEN (2026-07-15)
The Strands PV agent now runs on **AgentCore Runtime** (ARM64 container), driven by the human's **Cognito JWT**; the same identity flows to the Gateway so Cedar enforces on the real principal. Project: `<PROJECTS-DIR>\pv-runtime\` (SPACE-FREE, separate from the main project because the container toolchain/Docker context can't handle the space in "pharmacovigilance agent").
- **Agent** `agent.py`: `BedrockAgentCoreApp` entrypoint → Strands `Agent` (BedrockModel = Sonnet 4.5 profile) with the Gateway MCP tools (`MCPClient` + `streamablehttp_client`, `Authorization: Bearer <human token>`). Runs the governed workflow: openfda → mask_phi → draft_narrative(deidentified) → write_audit(INTENT) → request_signoff. NEVER finalizes. **Deny-by-default guard:** if `list_tools_sync()` returns [] (unauthorized identity) it returns ACCESS DENIED WITHOUT invoking the model (else the LLM hallucinates a fake workflow — real bug I hit + fixed).
- **Deploy** via `bedrock-agentcore-starter-toolkit` (`agentcore configure` + `agentcore launch`, CodeBuild ARM64, no local Docker). Runtime ARN `arn:aws:bedrock-agentcore:us-east-1:111122223333:runtime/pv_runtime_agent-ZPsuUP3X6s`. Cognito JWT inbound authorizer (customJWTAuthorizer discoveryUrl+allowedClients=spine's pv-gw client) + Authorization header allowlisted. Env: GATEWAY_URL, MODEL_ID. Auto-created exec role has bedrock:InvokeModel (worked out of the box).
- **Invoke** `agentcore invoke --bearer-token <cognito-access-token> '{"access_token":"<same>","icsr_id":"...","requester":"reviewer"}'` (bearer authenticates to Runtime JWT authorizer; payload token drives the gateway).
- **PROVEN live:** reviewer → full workflow, `tools_available` = [mask_phi, openfda, draft_narrative, request_signoff, write_audit] — **finalize_submission ABSENT (Cedar hid it from the reviewer)**; 3 PHI masked, 1,597-char Bedrock narrative, INTENT audited, PENDING_APPROVAL. outsider → `tools_available: []` + ACCESS DENIED (deny-by-default), nothing run.
- **Toolchain env (Windows):** venv `py -3.12` at `pv-runtime/.venv`; ALWAYS `export PYTHONIOENCODING=utf-8 PYTHONUTF8=1` (rich/typer crash on cp1252 Unicode) + `AGENTCORE_SUPPRESS_RECOMMENDATION=1`. `configure -c` (create mode) skips the exec-role prompt (prompt_toolkit crashes: NoConsoleScreenBufferError in non-tty); pass `-ac <json>` to skip the OAuth prompt (also = the JWT wiring) and `-rha Authorization`. Create mode does NOT generate a Dockerfile → I wrote one (`Dockerfile`, public.ecr.aws/docker/library/python:3.12-slim, CMD python agent.py serving :8080). **GOTCHA:** log-group names starting with `/` get MSYS-path-mangled → `export MSYS_NO_PATHCONV=1` for aws logs calls.
- **COUPLING — RESOLVED (see Hardening 2 below).** Originally the Runtime's JWT authorizer was bound to a spine-rotated pool + a static GATEWAY_URL env. Now: identity is a STABLE separate stack (pool never rotates) and the gateway URL is discovered from SSM at invoke time. The Runtime survives spine cycles with NO redeploy — proven by a gateway rotation + untouched invoke. `_repoint.sh` is now only needed if identity itself changes.

## ✅ Hardening — real openFDA egress + fail-closed Bedrock Guardrail — LIVE-PROVEN (2026-07-15); demo 17/17
- **openfda_lookup is REAL** (`tools/openfda_lookup.py`): live GET to `api.fda.gov/drug/event.json` — aggregate FAERS only (report count + top MedDRA reaction terms via `count=patient.reaction.reactionmeddrapt.exact`), NO PHI, 6s timeout, fail-soft fallback to a deterministic aggregate if the API is slow/down (non-PHI background, not a control). Proven live: lisinopril → `source:"openFDA/FAERS (live)", reports_found:319519, top_reactions:[fatigue,nausea,drug ineffective,diarrhoea,dyspnoea]`.
- **Bedrock Guardrail on drafting** (`pv-icsr-guardrail`): fail-closed OUTPUT control. sensitiveInformationPolicy PII=ANONYMIZE (NAME/AGE/EMAIL/PHONE/SSN/ADDRESS) as defense-in-depth for anything masking missed + contentPolicy PROMPT_ATTACK HIGH (input). `draft_narrative` applies it via Converse `guardrailConfig`; if the guardrail can't run, NO narrative is emitted (fail-closed); a hard block (empty output) returns `guardrail:"BLOCKED"`. Proven live: `guardrail_applied:true` on the real draft. Created in deploy (`create-guardrail`, poll READY), wired into pv-core-tools via env `GUARDRAIL_ID`/`GUARDRAIL_VERSION=DRAFT` (update-function-configuration retry loop), IAM `bedrock:ApplyGuardrail`, torn down in destroy.
- **IaC + demo:** deploy_spine.sh section 2c (guardrail) + env-wire; demo.sh asserts `guardrail_applied:true`. GOTCHA: mcp_client truncates ~200 chars → put SHORT proof fields FIRST in the draft return (drafted_by/chars/guardrail_applied), narrative LAST, and assert on `"chars": [1-9]` not the narrative key. Made the audit test re-run-safe with a per-run NONCE in the payload (fresh audit_id each run → 1st stored:true, immediate dup stored:false).
- **Demo now 17/17** on a clean deploy: deny-by-default (2) + mask (2) + mask-before-model forbid + draft + narrative + guardrail (4) + WORM audit stored/dup (3) + no-self-submit forbid (1) + human sign-off gate (5).

## ✅ Hardening 2 — stable identity + Runtime decoupling + Observability — LIVE-PROVEN (2026-07-15)
- **Stable identity stack** (`scripts/deploy_identity.sh` / `destroy_identity.sh`): the Cognito pool/client/users are their OWN lifecycle, NOT torn down by the spine cycle. deploy_spine now calls deploy_identity (idempotent) + sources `identity-state.env`. destroy_spine LEAVES the pool intact. Proven: two back-to-back spine cycles REUSED the same pool `<POOL_ID>` (no rotation).
- **Dynamic gateway discovery (SSM):** deploy_spine publishes the (rotating) gateway URL to SSM `/pv-icsr/gateway-url`; the Runtime agent reads it at invoke time (`_gateway_url()`, SSM first, env fallback). Runtime exec role got inline `pv-runtime-ssm` (ssm:GetParameter on /pv-icsr/*, via `pv-runtime/_obs_setup.sh`).
- **DECOUPLING PROVEN:** ran a full spine cycle that rotated the gateway (new `pv-icsr-gw-*`) while keeping the pool; then invoked the Runtime **with NO re-point** → it discovered the new gateway via SSM + validated the token against the stable pool + ran the full governed workflow. The Runtime now survives spine cycles untouched. (The old `_repoint.sh` is now only needed if identity itself changes.)
- **Observability:** re-enabled OTel on the Runtime (removed `--disable-otel`; `requirements.txt` += `aws-opentelemetry-distro`; Dockerfile CMD = `opentelemetry-instrument python -u agent.py`) + structured `logging` in agent.py (invocation/identity, authorized_tools count+names, ACCESS DENIED, completion). CloudWatch `/aws/bedrock-agentcore/runtimes/pv_runtime_agent-*-DEFAULT` now shows per-step OTel-correlated logs (trace_id, span_id, code.file/line, service.name=pv_runtime_agent.DEFAULT, aws.service.type=gen_ai_agent) + a GenAI Observability dashboard. Transaction Search enable is best-effort in `_obs_setup.sh`.
- **GOTCHA (root-caused via the new logs):** deploy's `aws ssm put-parameter --name /pv-icsr/gateway-url` silently failed because Git-Bash MSYS mangled the `/`-leading name → ParameterNotFound at read time → agent fell back to a stale (deleted) gateway → 424. Fix: `export MSYS_NO_PATHCONV=1` at the top of `deploy_spine.sh`.

### Learned during the spine build (pin for the rest of the work)
- MCP tool id is `<targetName>___<toolName>` (e.g. `openfda-lookup___openfda_lookup`) — Cedar actions map to these.
- Cognito `cognito:groups` surfaces as a Cedar **String** tag (not a Set) → match with `like "*pv_reviewer*"`, not `.contains`.
- Cedar resource must be scoped (`resource is AgentCore::Gateway`), not wildcard.
- Access token (has `client_id` = app client) is the token the CUSTOM_JWT authorizer accepts (allowedClients).
- Gateway role needs `bedrock-agentcore:GetPolicyEngine` (+ policy read/eval) to attach an engine.
- Lambda target needs `--credential-provider-configurations [{credentialProviderType: GATEWAY_IAM_ROLE}]`.
- Engine mode `LOG_ONLY` → `ENFORCE` via `update-gateway --policy-engine-configuration`.
| AgentCore Runtime (Strands agent) | ✅ LIVE | `pv_runtime_agent-ZPsuUP3X6s` — Cognito JWT inbound; reviewer→full workflow, outsider→ACCESS DENIED. Project `pv-runtime/`. |
| Step Functions human gate | ✅ LIVE | `pv-signoff` SoD gate (approve≠request, single-use); demo-proven. |
| WORM audit | ✅ LIVE | append-only DDB `pv-audit` + S3 Object Lock `pv-audit-worm-*`. Observability: not yet. |

## Grounded API facts (verified against the account CLI, aws-cli 2.33.2)
- **Build order matters:** `create-policy` validates the Cedar statement against a schema generated from the **Gateway's tools' input schemas**. So: engine → IAM role + Cognito → gateway (attach engine, `mode=LOG_ONLY`) → gateway targets (tools) → **then** create-policy (validates against tool schema) → test in LOG_ONLY → flip to ENFORCE.
- **Policy Engine ↔ Gateway:** attach via `create-gateway --policy-engine-configuration '{"arn":"<engine-arn>","mode":"LOG_ONLY|ENFORCE"}'`. A gateway has at most one engine; an engine can back many gateways. **LOG_ONLY** traces allow/deny without enforcing — validate here first, then **ENFORCE**.
- **Gateway create:** `--protocol-type MCP`, `--protocol-configuration '{"mcp":{"supportedVersions":[...],"searchType":"SEMANTIC"}}'`, `--authorizer-type CUSTOM_JWT`, `--authorizer-configuration '{"customJWTAuthorizer":{"discoveryUrl":"<cognito>/.well-known/openid-configuration","allowedClients":[...],"allowedAudience":[...],"customClaims":[...]}}'`, plus a `--role-arn` (trust bedrock-agentcore; invoke tool Lambdas). Name pattern `([0-9a-zA-Z][-]?){1,100}`.
- **Cedar policy create:** `create-policy --policy-engine-id <id> --name <A-Za-z0-9_> --definition 'cedar={statement="<CEDAR>"}' [--validation-mode FAIL_ON_ANY_FINDINGS|IGNORE_ALL_FINDINGS]`. Default-deny + forbid-wins are automatic. Async — poll `get-policy`.
- **Cedar principal/action/resource:** principal `AgentCore::OAuthUser` (JWT `sub`; JWT claims become tags → condition on `principal.<claim>` e.g. role/scope) or `AgentCore::IamEntity`; action = each Gateway tool (auto-mapped from tool defs); resource = the gateway; tool input params available in `context` for conditions.
- **Names:** policy-engine / policy names must match `[A-Za-z][A-Za-z0-9_]*` (no hyphens).
- Runtime/Identity/Memory commands exist (`create-agent-runtime`, `create-workload-identity`, `create-memory`); data-plane invoke is `aws bedrock-agentcore`.

## Cedar policy set (authored in `policies/`, created after tools exist)
- `pv_reviewer_permit.cedar` — a `pv_reviewer` may look up / assemble / code / draft (role-scoped permit).
- `mask_before_draft.cedar` — forbid `draft_narrative` unless the input is de-identified (masking-before-model enforced by policy).
- `no_self_submit.cedar` — forbid any direct `finalize_submission`; only the human-gate workflow finalizes.
- Action ids are pinned to the generated tool schema at `create-policy` time; the `.cedar` files carry the intended logic.

## Next steps
1. IAM gateway role + Cognito user pool/app-client + a `pv_reviewer` test user (emit a `role` claim).
2. Create the Gateway (MCP + CUSTOM_JWT + engine in LOG_ONLY).
3. Add the 7 PV tools as Gateway Lambda targets (from `carried-over/aws-native-reference/02-pharmacovigilance` + `_shared`).
4. `create-policy` the Cedar set against the engine; validate allow/deny in LOG_ONLY; flip to ENFORCE.
5. Strands agent onto Runtime + Identity; human gate; WORM audit + Observability; IaC; end-to-end + negative tests; teardown.

## ✅ Phase 3 — deliverables COMPLETE (2026-07-16)
All five leadership/customer/SA artifacts are built and saved to `docs/` (sources in `docs/generators/`, Node + `pptxgenjs`/`docx` — regenerate with `node docs/generators/<name>.js`).
- **PV-AgentCore-Leadership.pptx** — 13-slide leadership story (the governance bet, why AgentCore-native + Cedar, the proof, the roadmap to the other hero agents). Generator: `leadership_deck.js`.
- **PV-AgentCore-Customer.pptx** — 10-slide customer-facing deck (the regulated PV problem, the governed pattern, the three build-alongside controls, shared responsibility). Generator: `customer_deck.js`.
- **PV-AgentCore-SA-Runbook.docx** — step-by-step deployable runbook (identity stack → spine deploy → 17/17 governance demo → Runtime → teardown; Windows/Git-Bash gotchas inline). Generator: `runbook.js` (+ shared `guides.js`).
- **PV-AgentCore-Regulatory-Adherence.docx** — control-to-requirement mapping to FDA 21 CFR Part 11, HIPAA, GVP/ICH E2B(R3); evidence produced vs. customer-owned validation; explicit "not a certification" disclaimer. Generator: `regulatory.js`.
- **PV-AgentCore-Maintenance.docx** — operating/maintenance guide (identity vs. spine lifecycles, SSM gateway discovery, observability, rotate default test passwords before shared use, upgrade/rollback). Generator: `maintenance.js`.
- All rendered + visually QA'd; static styled TOCs (live TOC field rendered blank in LibreOffice preview); placeholder scan clean. Honesty boundary carried through every doc: accelerator, not production-certified; MedDRA/WHODrug coding + live-system connectors are engagement work (labeled stubs).

_Phase 4 (not started): templatize the governed pattern to the remaining hero agents (SLG / HPP / EDU)._

## ✅ Runbook validation — followed end-to-end on a fresh redeploy (2026-07-16)
Ran the SA runbook step-by-step on Windows/Git-Bash against the live account (111122223333, us-east-1) as a fresh follower would, doing a genuine teardown + redeploy (not masked by idempotency):
- **§7 teardown** `destroy_spine.sh` → `[destroy] complete`, zero residual (WORM bucket + all IAM roles gone; identity + runtime preserved).
- **Step 1** `deploy_identity.sh` → reused stable pool <POOL_ID>, wrote identity-state.env.
- **Step 2** `deploy_spine.sh` → `[deploy] DONE`, new gateway `pv-icsr-gw-nrhhk3hzt9` in ENFORCE, new engine `pv_icsr_authz-kzox9iatnk`, SSM published.
- **Step 3** `demo.sh` → **17 passed, 0 failed / GOVERNANCE DEMO: PASS**.
- **Step 4** `setup_venv.sh` (venv OK: bedrock-agentcore 1.18.0, toolkit 0.3.10, strands 1.47.0) + `_obs_setup.sh` (SSM grant) + `_configure.sh` (CONFIGURE_EXIT=0, JWT authorizer wired) + `_launch.sh` (CodeBuild ARM64, LAUNCH_EXIT=0, runtime pv_runtime_agent-ZPsuUP3X6s).
- **Step 5** `_invoke.sh reviewer` → full governed workflow (FAERS 319519, 3 PHI masked, real Bedrock narrative, INTENT audit, PENDING_APPROVAL; tools_available omits finalize_submission). `_invoke.sh outsider` → ACCESS DENIED, tools_available:[]. Both INVOKE_EXIT=0. (Also re-proved decoupling: the runtime discovered the rotated gateway via SSM.)
- **§6 checklist**: SSM /pv-icsr/gateway-url == live gateway; runtime log group present. All green.

### Runbook doc fixes applied (docs/PV-AgentCore-SA-Runbook.docx + docs/generators/runbook.js)
1. **Step 4 venv (was a Windows blocker):** replaced `python3.12 -m venv` + `./.venv/bin/pip …` (POSIX `bin/` doesn't exist on Windows — venv makes `Scripts/`) with `bash setup_venv.sh` (the existing helper; correct per-OS paths), naming the 4 installed packages.
2. **Step 7 teardown:** `./.venv/bin/agentcore destroy` → `./.venv/Scripts/agentcore.exe destroy` (+ macOS/Linux note). `destroy` confirmed a real subcommand.
3. **Step 0:** `python3 --version` (git-bash returns 3.13) → `python3.12 --version` (Step 4 needs 3.12).
4. **§6 checklist:** deploy "ends with DEPLOY_EXIT=0" → actual output `[deploy] DONE` + `Gateway URL: … (mode ENFORCE)`.
5. **§8:** added a note that the pv-runtime helper scripts hardcode the reference path `<PROJECTS-DIR>/pv-runtime` (adjust if relocating).
6. **Config table:** fixed a `[object Object]` render bug in the Drafting-model row.
Note: `launch` still works in toolkit 0.3.10 (now aliased as `deploy`). Left the spine + runtime deployed and working; tear down with `destroy_spine.sh` (§7) when finished.

## ✅ New governed tool: assess_seriousness (seriousness + reporting clock) — LIVE-PROVEN (2026-07-16); demo now 20/20
Added the one genuinely worthwhile non-licensed workflow step so the exemplar is airtight: an ICH E2B(R3) / 21 CFR 314.80 seriousness assessment + expedited/periodic reporting-clock determination.
- **Tool** (`tools/assess_seriousness.py`): pure rules engine, NO model + NO licensed data. Detects the 6 E2B seriousness criteria (death, life-threatening, hospitalization, disability, congenital anomaly, other medically important) from the masked case text OR explicit `flags`; computes reporting category (EXPEDITED 15-day for serious+unlisted / PERIODIC for serious+listed / ROUTINE for non-serious). Unknown expectedness -> treated as unlisted (conservative). Fail-closed: refuses non-de-identified input (mirrors draft_narrative). Short proof fields first (serious/reporting_category/clock_days) for the ~200-char MCP truncation.
- **Governed like the rest**: new gateway target `assess-seriousness` (tool id `assess-seriousness___assess_seriousness`) + NEW Cedar forbid `mask_before_assess` (no assessment on un-masked data, mirrors mask_before_draft). Reviewer permit is action-agnostic so the tool is auto-allowed for reviewers / denied for outsiders — no permit change. `policies/mask_before_assess.cedar` added as source-of-truth.
- **Workflow**: inserted as step 3 in `pv-runtime/agent.py` (openfda -> mask -> **assess_seriousness** -> draft -> audit -> signoff); renumbered.
- **Wiring**: `deploy_spine.sh` (deploy_fn pv-assess-seriousness + t-seriousness.json target + mask_before_assess mkpolicy); `demo.sh` (+3 checks: mask-before-assess DENY, assess ALLOW, serious=true+EXPEDITED content). destroy_spine already deletes all `pv-*` lambdas + the engine's policies, so teardown needs no change.
- **PROVEN**: redeploy -> `mask_before_assess ACTIVE` + ENFORCE; **demo 20 passed, 0 failed / GOVERNANCE DEMO: PASS** (unmasked assess DENY names mask_before_assess-*, masked assess -> serious=true EXPEDITED clock_days=15). Runtime rebuilt (LAUNCH_EXIT=0) + reviewer invoke shows the agent running the Seriousness Assessment step live (Serious: YES, EXPEDITED 15-day) with `assess-seriousness` in tools_available; INVOKE_EXIT=0.
- Manifest of the whole agent captured at `docs/phase4/pharmacovigilance.manifest.yaml` (Phase 4 template groundwork).
