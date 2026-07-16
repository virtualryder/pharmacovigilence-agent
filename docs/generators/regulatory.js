const G = require("./guides.js");
const { H1, H2, H3, P, bold, code, bullet, num, codeBlock, callout, table, spacer, coverAndToc, makeDoc, Packer } = G;

const cover = coverAndToc(
  ["Regulatory-Adherence Guide"],
  "Pharmacovigilance Agent on Amazon Bedrock AgentCore",
  "How the governed PV accelerator maps to GVP / ICH E2B(R3), FDA 21 CFR Part 11, and HIPAA — the controls it provides, the evidence it produces, and the validation that remains the customer's responsibility. Accelerator reference; not a compliance certification or legal advice. Version 1.0 · 2026.",
  ["1. Purpose & scope", "2. The regulated workflow", "3. Frameworks in scope", "4. FDA 21 CFR Part 11 mapping", "5. HIPAA mapping", "6. GVP / ICH E2B(R3) mapping", "7. Separation of duties & the human gate", "8. Shared responsibility", "9. Disclaimer"]
);

const body = [
  H1("1. Purpose & scope"),
  P("This guide maps the controls implemented in the pharmacovigilance (PV) accelerator to the requirements a regulated safety organization must satisfy. It is written for the compliance, quality-assurance, and security stakeholders who decide whether an AI-assisted intake workflow can be adopted."),
  P([bold("What this guide is: "), "a control-to-requirement mapping showing how the accelerator supports adherence, what evidence it produces, and where the customer's own validation is required."]),
  P([bold("What this guide is not: "), "a certification, an attestation, or legal/regulatory advice. Adopting this accelerator does not by itself make a system compliant. Computer-system validation for the intended use, and the resulting regulatory posture, remain the customer's responsibility (§8)."]),
  callout("Design principle", [["Every control below follows one rule from the regulated workflow: a qualified person makes the causality and reportability determination and commits the submission — the agent assembles, codes, and drafts, but never self-submits. The security design exists to enforce that rule."]], G.colors.TEAL),

  H1("2. The regulated workflow"),
  P("Pharmacovigilance is drug-safety surveillance. When an adverse event is reported, a regulated intake workflow runs: parse the source, extract E2B(R3) fields, code the event (MedDRA) and drug (WHODrug), assess seriousness and the reporting clock, draft a CIOMS/ICSR narrative, obtain a qualified person's review and sign-off, and submit the ICSR to the regulator."),
  P("The accelerator automates the assembly, coding, and drafting steps under governance, and pauses at a human sign-off gate before any submission. Three regulatory frameworks bear on this workflow, mapped in §§4–6."),

  H1("3. Frameworks in scope"),
  table(["Framework", "Relevance to the workflow"], [
    [[bold("GVP / ICH E2B(R3)")], "Good pharmacovigilance practices and the ICSR data structure and reporting clocks; the qualified-person determination."],
    [[bold("FDA 21 CFR Part 11")], "Electronic records and electronic signatures — audit trails, record integrity, access controls, and signature linking."],
    [[bold("HIPAA")], "Protection of PHI in the case data — de-identification, minimum-necessary access, audit, and safeguards."],
  ], [2500, 7940]),

  H1("4. FDA 21 CFR Part 11 mapping"),
  P("Part 11 governs electronic records and signatures. The accelerator implements technical controls for the record-integrity, access, audit, and signature-linking requirements; system validation for the intended use is the customer's responsibility."),
  table(["Requirement (21 CFR Part 11)", "How the accelerator addresses it", "Evidence / customer responsibility"], [
    ["§11.10(a) — Validation of systems", "Reproducible infrastructure-as-code and a 17-check governance test harness that runs in enforcement mode.", [{ text: "Customer: ", bold: true }, "computer-system validation (CSV/CSA) for the intended use."]],
    ["§11.10(c) — Protection & retention of records", "Append-only DynamoDB ledger plus an S3 Object Lock (WORM) copy of each audit record; the writing principal is denied delete, update, and retention-bypass.", "Object Lock configuration; IAM deny policy. Customer sets the retention period."],
    ["§11.10(d) — Limiting access to authorized individuals", "Amazon Cognito authentication with AgentCore Policy (Cedar) deny-by-default; every tool call is authorized against the human's identity.", "Cognito pool + Cedar policies; deny strings name the firing policy."],
    ["§11.10(e) — Secure, computer-generated, time-stamped audit trails", "Every governed action writes a tamper-evident record capturing INTENT → COMMITTED with a content hash and timestamp; duplicates are rejected.", "The pv-audit ledger + WORM bucket; demo proves write-once + duplicate rejection."],
    ["§11.10(g) — Authority checks", "Cedar authorizes each specific tool per identity; the submission action is forbidden to the agent and reachable only through the human gate.", "Cedar permit/forbid policies; the no-self-submit forbid."],
    ["§11.50 / §11.70 — Signature manifestation & record linking", "The sign-off is a bound, single-use approval tied to the approver's identity and the specific ICSR execution; consumed against a durable ledger.", [{ text: "Customer: ", bold: true }, "map to the qualified person's formal e-signature process."]],
    ["§11.200 — Electronic signature uniqueness", "Approvals require a verified identity distinct from the requester and cannot be reused (single-use token).", "Separation-of-duties check + single-use consumption (see §7)."],
  ], [2650, 4090, 3700]),

  H1("5. HIPAA mapping"),
  P("Where the case contains protected health information (PHI), the accelerator de-identifies it before the model or the audit sees it, and constrains access by least privilege. A Business Associate Agreement and the customer's HIPAA program remain prerequisites for handling real PHI."),
  table(["HIPAA area", "How the accelerator addresses it", "Evidence / customer responsibility"], [
    ["De-identification (§164.514)", "The mask_phi tool runs Amazon Comprehend Medical to remove PHI (name, date of birth, MRN, and more) before drafting and before the audit — fail-closed: if masking cannot run, no draft is produced.", "Comprehend Medical detection; demo proves name/DOB/MRN redaction and the fail-closed path."],
    ["Minimum necessary (§164.502(b))", "Least-privilege authorization: the agent acts only within the intersection of its own and the human's permissions (Cedar).", "Cedar least-privilege policies."],
    ["Access controls (§164.312(a))", "Authenticated identity (Cognito/IdP) and deny-by-default tool authorization.", "Cognito + Cedar."],
    ["Audit controls (§164.312(b))", "Immutable WORM audit of every decision and state change.", "pv-audit ledger + Object Lock."],
    ["Integrity & transmission (§164.312(c),(e))", "Runs inside the customer's AWS account; PHI is masked before any model call; records are Object-Lock protected.", [{ text: "Customer: ", bold: true }, "BAA, encryption/KMS configuration, network controls, HIPAA program."]],
  ], [2500, 4240, 3700]),

  H1("6. GVP / ICH E2B(R3) mapping"),
  table(["GVP / E2B(R3) area", "How the accelerator addresses it", "Status / customer responsibility"], [
    ["ICSR structure (E2B(R3))", "Tools assemble the case and draft a CIOMS-style narrative structured for ICSR intake.", "Narrative drafting is live; assemble_case is a reference stub."],
    ["MedDRA / WHODrug coding", "A coding tool step is wired into the governed workflow.", [{ text: "Customer: ", bold: true }, "MedDRA and WHODrug are licensed dictionaries — coding is engagement work, delivered as a labeled stub."]],
    ["Seriousness & reporting clocks", "The workflow includes a seriousness/reporting-clock assessment step ahead of drafting.", [{ text: "Customer: ", bold: true }, "configure thresholds and clocks for the intended market."]],
    ["Qualified-person determination", "The causality/reportability determination and the commit are performed by a qualified person at the human sign-off gate; the agent cannot submit.", "Enforced by the Step Functions gate + the no-self-submit forbid (see §7)."],
    ["Safety-signal background", "openfda_lookup retrieves aggregate FAERS background (no PHI) to support review.", "Live openFDA reference connector; production connectors to Argus/Veeva are customer work."],
  ], [2500, 4240, 3700]),

  H1("7. Separation of duties & the human sign-off gate"),
  P("The single most important control for GVP and Part 11 is that a qualified person — not the agent — makes the determination and commits. The accelerator enforces this structurally:"),
  bullet([bold("The agent cannot submit. "), "The finalize action is forbidden by a Cedar policy and is hidden from the agent entirely; it is not reachable as a tool."]),
  bullet([bold("Submission runs only through the gate. "), "The sanctioned path is a request for sign-off that starts a Step Functions workflow, which pauses until a human approves."]),
  bullet([bold("The approver must differ from the requester. "), "A separation-of-duties check rejects self-approval."]),
  bullet([bold("Approvals are single-use. "), "The approval token is consumed against a durable ledger; it cannot be replayed."]),
  bullet([bold("Both ends are audited. "), "An INTENT record is written when sign-off is requested and a COMMITTED record when the submission is finalized."]),
  callout("Proven live", [["In enforcement mode: a reviewer's request to self-approve is blocked as a separation-of-duties violation; a different qualified person's approval succeeds; the submission finalizes only after approval; and re-using the token is rejected."]], G.colors.MINT, "E9F5EF"),

  H1("8. Shared responsibility"),
  P("The accelerator provides the pattern, the controls, and the evidence. Certification and the connection to the customer's real systems remain the customer's."),
  table(["The accelerator provides", "The customer is responsible for"], [
    ["The governed agent, Cedar policies, and tools", "Computer-system validation (CSV/CSA) for the intended use"],
    ["Fail-closed PHI masking", "IdP federation and role mapping to the workforce"],
    ["The human sign-off workflow (separation of duties)", "Connector validation to live safety systems (Argus/Veeva) under a BAA"],
    ["The immutable WORM audit design", "MedDRA / WHODrug dictionary licensing and validated coding"],
    ["Reproducible IaC + the governance test harness", "Production authorization to operate (ATO / HITRUST / FedRAMP as applicable)"],
    ["Documentation (this guide, the runbook, maintenance)", "Data retention policy and legal/regulatory sign-off"],
  ], [5220, 5220]),

  H1("9. Disclaimer"),
  P([{ text: "This document describes how an accelerator's technical controls map to selected regulatory requirements. It is provided for evaluation and architecture purposes only. It is not legal, regulatory, or compliance advice, and it is not a certification or attestation of compliance with 21 CFR Part 11, HIPAA, GVP, ICH E2B(R3), or any other regulation. Compliance depends on the customer's validated implementation, policies, and use. Consult your regulatory, quality, and legal functions before processing real adverse-event or patient data.", italics: true, color: G.colors.MUTED, size: 19 }]),
];

const doc = makeDoc(cover, body, "PV AgentCore · Regulatory-Adherence Guide");
Packer.toBuffer(doc).then((b) => { require("fs").writeFileSync("PV-AgentCore-Regulatory-Adherence.docx", b); console.log("wrote regulatory"); });
