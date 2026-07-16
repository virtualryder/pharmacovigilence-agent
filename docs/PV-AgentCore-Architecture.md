# Pharmacovigilance Agent — AgentCore-Native Architecture

*Target architecture for the pharmacovigilance (ICSR intake) hero agent, rebuilt to run natively on Amazon Bedrock AgentCore. This note is the anchor design — it doubles as the opening of the leadership deck and the first section of the SA runbook. Draft v0.1 · 2026-07-15.*

---

## 1. What this agent does (the regulated workflow)

Pharmacovigilance is drug-safety surveillance. When an adverse event (AE) is reported, a regulated intake workflow must run end to end:

**parse the AE source → extract E2B(R3) fields → code the event (MedDRA) and drug (WHODrug) → assess seriousness and the reporting clock (expedited vs. periodic) → draft a CIOMS/ICSR narrative → a qualified person reviews and signs off → the ICSR is submitted to the regulator (FDA/EMA).**

Under GVP and 21 CFR 314/600, a **qualified person must make the causality/reportability determination and commit the submission**. The agent assembles, codes, and drafts; it never self-submits. That single rule drives the whole security design.

## 2. Design thesis

AWS now ships, in Amazon Bedrock AgentCore, the governance primitives our earlier "Aegis" work hand-rolled. So we stop being a parallel governance platform and become **the regulated-industry pattern implemented natively on AgentCore**: governed agentic AI built on AWS-native services, plus the three last-mile controls regulated customers need that AgentCore doesn't provide out of the box. That is a stronger and more honest story for AWS leadership and for customers than "we built our own."

## 3. Native on AgentCore vs. built alongside

| Control (governed-agent requirement) | Native? | AgentCore component / how |
|---|---|---|
| Verified human + agent identity | ✅ Native | **AgentCore Identity** — inbound JWT authorizer (Cognito / customer IdP) |
| Deny-by-default tool authorization | ✅ Native | **AgentCore Policy (Cedar)** — default-deny + forbid-wins, enforced at the Gateway |
| Least-privilege intersection (agent ∩ human) | ✅ Native | Cedar principal = `AgentCore::OAuthUser` with JWT claims (role/scope) as tags + tool-parameter conditions |
| Tools as governed endpoints | ✅ Native | **AgentCore Gateway** — APIs/Lambda → MCP tools; every call passes Policy |
| Agent hosting / runtime | ✅ Native | **AgentCore Runtime** — hosts the Strands agent, serverless, session-isolated |
| Tracing / observability | ✅ Native | **AgentCore Observability** — OpenTelemetry spans per agent/tool step |
| Fail-closed PHI/PII masking | 🔧 Build | `mask_phi` Gateway tool: Comprehend Medical `DetectPHI` + Comprehend `DetectPiiEntities`, before model + before audit |
| Human sign-off gate (separation of duties) | 🔧 Build | Step Functions `waitForTaskToken` — bound, single-use approval; AgentCore has no native human gate |
| Immutable WORM audit (21 CFR Part 11 evidence) | 🔧 Build | Append-only DynamoDB + S3 Object Lock; Observability traces are for ops, not tamper-proof evidence |

## 4. Target architecture (components)

**AgentCore Runtime** hosts the Strands pharmacovigilance agent. The existing Strands agent gets a `BedrockAgentCoreApp` entrypoint and is deployed with the AgentCore starter toolkit (`agentcore configure` / `agentcore launch`), which containerizes it (ARM64) and manages the endpoint.

**AgentCore Gateway** exposes each capability as an MCP tool backed by a Lambda target: `openfda_lookup`, `assemble_case`, `code_meddra_whodrug`, `mask_phi` (fail-closed), `draft_narrative`, `write_audit`, and `request_signoff`. Because every tool call is a Gateway call, Policy can gate all of them uniformly.

**AgentCore Identity** provides inbound auth — a JWT authorizer (Amazon Cognito or the customer's IdP) authenticates the human on whose behalf the agent acts — and outbound auth — the credentials the Gateway uses to reach connectors (openFDA today; Argus/Veeva under a BAA later).

**AgentCore Policy (Cedar)** is the deny-by-default authorization engine. Default-deny and forbid-wins are enforced automatically. Principal = `AgentCore::OAuthUser` (JWT claims such as `role` and `scope` surfaced as tags); Action = the specific tool invocation (auto-mapped from the Gateway's tool definitions); Resource = the Gateway; conditions can test both user claims and tool input parameters. This is simultaneously our deny-by-default gateway and our least-privilege intersection — natively.

**AgentCore Observability** emits OpenTelemetry spans for every agent and tool step.

**Built alongside — the regulated last mile:**
- **Fail-closed PHI/PII masking:** the `mask_phi` tool de-identifies the assembled case before the model drafts and before anything is written to the audit. Fail-closed — if masking can't run, the call stops rather than exposing PHI.
- **Human sign-off gate (separation of duties):** `request_signoff` starts a Step Functions execution that pauses on `waitForTaskToken`; a *different* qualified person approves with a bound, single-use token. The agent cannot finalize a submission itself.
- **Immutable WORM audit:** an append-only, tamper-evident record (append-only DynamoDB + S3 Object Lock) capturing `INTENT → COMMITTED` for 21 CFR Part 11 evidence.

## 5. How one governed action flows

1. The human authenticates (Cognito/IdP) and receives a JWT.
2. The agent (on AgentCore Runtime) decides to call a tool.
3. The call goes through AgentCore Gateway; **Inbound Auth** validates the JWT.
4. The **Policy Engine** evaluates Cedar: principal (user claims) + action (the tool) + resource (the gateway) + conditions (role, tool parameters), default-deny. A deny means the tool never runs — and the denial is auditable.
5. The allowed tool runs. For drafting, `mask_phi` runs first (fail-closed), so the model only ever sees de-identified text.
6. The consequential step never executes inline: `request_signoff` opens the Step Functions human gate; a second qualified person approves; only then does `finalize` run.
7. Every decision and state change is written to the WORM audit, and every step is traced in Observability.

## 6. Cedar policy model for pharmacovigilance (illustrative)

Default-deny is automatic; we author explicit permits plus a few targeted forbids. Illustrative — final syntax is pinned against the account during the port:

```cedar
// A PV reviewer may look up, assemble, code, and draft — gated on the role claim.
permit(
  principal is AgentCore::OAuthUser,
  action in [ AgentCore::Action::"openfda_lookup",
              AgentCore::Action::"assemble_case",
              AgentCore::Action::"code_meddra_whodrug",
              AgentCore::Action::"draft_narrative" ],
  resource
) when { principal.role == "pv_reviewer" };

// No drafting on un-masked data: drafting requires the de-identified flag on the tool input.
forbid(
  principal,
  action == AgentCore::Action::"draft_narrative",
  resource
) unless { context.tool_input.deidentified == true };

// Submission is never a direct tool call — only the approval workflow can finalize.
forbid(principal, action == AgentCore::Action::"finalize_submission", resource);
```

The shape is the point: role-scoped permits, a forbid that enforces masking-before-model, and no path for the agent to self-submit.

## 7. Build order

1. **Governance spine first** — Cedar policies + Policy Engine + Gateway, with deny-by-default proven before anything else.
2. **PV tools as Gateway Lambda targets** — `openfda_lookup`, `assemble_case`, `code_meddra_whodrug`, `mask_phi`, `draft_narrative`, `write_audit`, `request_signoff`.
3. **Runtime + Identity** — Strands agent onto AgentCore Runtime; Cognito inbound JWT wired to the Cedar principal.
4. **Human sign-off gate** — Step Functions `waitForTaskToken` wired to `request_signoff` and `finalize`.
5. **WORM audit + Observability.**
6. **IaC + validate** — CDK/CloudFormation for the whole stack; deploy; end-to-end run (Cedar allow/deny, masking, human gate, real Bedrock draft, immutable audit) + negative tests; teardown.

## 8. What's ours vs. the customer's (honesty boundary)

The accelerator owns: the agent, the Cedar policies, the tools, the masking, the human-gate workflow, the audit design, the IaC, and the docs. The customer owns: IdP federation and role mapping, connector validation against live safety systems (Argus/Veeva) under a BAA, computer-system validation (CSV/CSA) for the intended use, and production ATO / HITRUST / FedRAMP. Nothing here is production-certified on day one — and saying so is part of the credibility.

## 9. Regulatory anchors (full mapping is a separate guide)

- **GVP / ICH E2B(R3)** (ICSR structure + reporting clocks) → `assemble_case` / `code_meddra_whodrug` / `draft_narrative` + reporting-clock logic; the **qualified-person sign-off** → the human gate.
- **21 CFR Part 11** (electronic records & signatures) → WORM audit + bound single-use approval + verified identity.
- **HIPAA** (PHI) → fail-closed masking + least-privilege Cedar + encryption.

Each of these becomes a control-to-requirement line in the regulatory-adherence guide (Phase 3).
