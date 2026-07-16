/* Leadership deck — Governed Agentic AI for Regulated Industries (PV accelerator on AgentCore) */
const pptxgen = require("pptxgenjs");
const p = new pptxgen();
p.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
p.author = "PV AgentCore Accelerator";
p.title = "Governed Agentic AI for Regulated Industries";

// ---- palette ----
const NAVY = "0E2A47";   // primary dark
const NAVY2 = "143A5E";  // panel navy
const TEAL = "1C7293";   // secondary
const MINT = "02C39A";   // accent — governed / proven
const AMBER = "E8A13A";  // accent 2 — build-alongside
const INK = "1A2733";    // text on light
const CLOUD = "F4F7FA";  // light bg
const CARD = "FFFFFF";
const MUTED = "6B7A8A";
const LINE = "D9E1E8";
const WHITE = "FFFFFF";
const ICE = "CADCFC";

const TF = "Cambria";   // titles (safe serif w/ personality)
const BF = "Calibri";   // body

const sh = (o = {}) => Object.assign({ type: "outer", color: "0A1F33", blur: 9, offset: 3, angle: 90, opacity: 0.22 }, o);

function bg(s, c) { s.background = { color: c }; }
function footer(s, n) {
  s.addText([
    { text: "Governed Agentic AI · Amazon Bedrock AgentCore", options: { color: MUTED, fontSize: 8, fontFace: BF } },
  ], { x: 0.6, y: 7.06, w: 8, h: 0.3, align: "left", margin: 0 });
  s.addText(String(n).padStart(2, "0"), { x: 12.4, y: 7.02, w: 0.4, h: 0.3, align: "right", color: MUTED, fontSize: 9, fontFace: BF, margin: 0 });
}
function title(s, t, color = INK) {
  s.addText(t, { x: 0.6, y: 0.45, w: 12.1, h: 0.9, fontFace: TF, fontSize: 27, bold: true, color, align: "left", valign: "top", margin: 0 });
}
function eyebrow(s, t, color = TEAL) {
  s.addText(t.toUpperCase(), { x: 0.62, y: 0.28, w: 12, h: 0.3, fontFace: BF, fontSize: 11, bold: true, color, charSpacing: 2, margin: 0 });
}
function card(s, x, y, w, h, fill = CARD, radius = 0.09) {
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: LINE, width: 1 }, rectRadius: radius, shadow: sh() });
}
function circle(s, x, y, d, fill, txt, txtColor = WHITE, fs = 16) {
  s.addShape(p.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" }, shadow: sh({ blur: 6, offset: 2, opacity: 0.18 }) });
  if (txt !== undefined) s.addText(txt, { x, y, w: d, h: d, align: "center", valign: "middle", color: txtColor, fontFace: BF, fontSize: fs, bold: true, margin: 0 });
}

/* ------------------------------------------------------------------ 1. TITLE */
(() => {
  const s = p.addSlide(); bg(s, NAVY);
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: NAVY } });
  // motif: concentric governance rings, upper right
  s.addShape(p.ShapeType.ellipse, { x: 9.4, y: -1.9, w: 6.2, h: 6.2, fill: { color: NAVY2 }, line: { type: "none" } });
  s.addShape(p.ShapeType.ellipse, { x: 10.4, y: -0.9, w: 4.2, h: 4.2, fill: { color: "18466F" }, line: { type: "none" } });
  s.addShape(p.ShapeType.ellipse, { x: 11.25, y: -0.05, w: 2.5, h: 2.5, fill: { color: TEAL }, line: { type: "none" } });
  s.addText("AMAZON BEDROCK AGENTCORE  ·  REGULATED INDUSTRIES", { x: 0.7, y: 1.35, w: 11, h: 0.4, fontFace: BF, fontSize: 13, bold: true, color: MINT, charSpacing: 2, margin: 0 });
  s.addText("Governed Agentic AI,\nProven in a Regulated Workflow", { x: 0.66, y: 1.95, w: 11.4, h: 2.1, fontFace: TF, fontSize: 42, bold: true, color: WHITE, lineSpacingMultiple: 1.02, margin: 0 });
  s.addText("A pharmacovigilance (drug-safety) accelerator running natively on Amazon Bedrock AgentCore — identity-bound, deny-by-default with Cedar, and proven end-to-end on AWS.",
    { x: 0.7, y: 4.15, w: 9.7, h: 1.0, fontFace: BF, fontSize: 16, color: ICE, lineSpacingMultiple: 1.15, margin: 0 });
  // proof chips
  const chips = ["17 / 17 live governance checks", "Agent native on Runtime", "Reproducible IaC · zero-residual"];
  let cx = 0.7;
  chips.forEach((c) => {
    const w = 0.42 + c.length * 0.098;
    s.addShape(p.ShapeType.roundRect, { x: cx, y: 5.5, w, h: 0.5, fill: { color: NAVY2 }, line: { color: TEAL, width: 1 }, rectRadius: 0.25 });
    s.addText(c, { x: cx, y: 5.5, w, h: 0.5, align: "center", valign: "middle", color: WHITE, fontFace: BF, fontSize: 12, bold: true, margin: 0 });
    cx += w + 0.25;
  });
  s.addText("Draft v1 · 2026", { x: 0.7, y: 6.7, w: 4, h: 0.3, color: MUTED, fontSize: 10, fontFace: BF, margin: 0 });
  s.addNotes("The one-line thesis: AWS shipped the governance primitives; we implemented the regulated-industry pattern natively on AgentCore and proved it end-to-end. This deck walks the story from tension to proof to roadmap.");
})();

/* ------------------------------------------------------------------ 2. TENSION */
(() => {
  const s = p.addSlide(); bg(s, CLOUD);
  eyebrow(s, "The problem");
  title(s, "Regulated industries want agentic AI. They can't deploy an ungoverned one.");
  s.addText([
    { text: "In life sciences and healthcare, an agent that touches patient data and drafts regulatory submissions must be identity-bound, deny-by-default, auditable, and ", options: { color: INK, fontSize: 15, fontFace: BF } },
    { text: "incapable of acting unilaterally.", options: { color: TEAL, fontSize: 15, fontFace: BF, bold: true } },
    { text: "  “Impressive demo” is not the bar — “will pass an audit” is.", options: { color: INK, fontSize: 15, fontFace: BF } },
  ], { x: 0.62, y: 1.5, w: 12.0, h: 0.9, valign: "top", lineSpacingMultiple: 1.15, margin: 0 });

  const items = [
    ["Touches PHI", "Patient names, DOB, MRNs flow through the case.", "HIPAA · de-identification", TEAL],
    ["Creates regulatory records", "The drafted ICSR becomes an electronic record & signature.", "21 CFR Part 11 · tamper-proof evidence", AMBER],
    ["Takes consequential actions", "Submitting to FDA/EMA is irreversible and accountable.", "GxP · separation of duties", MINT],
  ];
  const w = 3.86, gap = 0.24, x0 = 0.62, y = 2.75, h = 3.6;
  items.forEach((it, i) => {
    const x = x0 + i * (w + gap);
    card(s, x, y, w, h);
    circle(s, x + 0.32, y + 0.34, 0.62, it[3], String(i + 1));
    s.addText(it[0], { x: x + 1.12, y: y + 0.36, w: w - 1.3, h: 0.6, fontFace: TF, fontSize: 17, bold: true, color: INK, valign: "middle", margin: 0 });
    s.addText(it[1], { x: x + 0.34, y: y + 1.25, w: w - 0.66, h: 1.4, fontFace: BF, fontSize: 13.5, color: "34434F", valign: "top", lineSpacingMultiple: 1.12, margin: 0 });
    s.addShape(p.ShapeType.roundRect, { x: x + 0.34, y: y + h - 0.78, w: w - 0.68, h: 0.5, fill: { color: CLOUD }, line: { type: "none" }, rectRadius: 0.08 });
    s.addText(it[2], { x: x + 0.34, y: y + h - 0.78, w: w - 0.68, h: 0.5, align: "center", valign: "middle", fontFace: BF, fontSize: 11.5, bold: true, color: it[3], margin: 0 });
  });
  footer(s, 2);
  s.addNotes("Three non-negotiables that block ungoverned agents in regulated settings. The rest of the deck shows how AgentCore + three last-mile controls satisfy all three.");
})();

/* ------------------------------------------------------------------ 3. WHY NOW */
(() => {
  const s = p.addSlide(); bg(s, CLOUD);
  eyebrow(s, "Why now");
  title(s, "AWS just shipped the governance primitives");
  s.addText("Amazon Bedrock AgentCore now provides — as native, managed services — the exact controls a governable agent needs. The gap between a “cool agent” and a “governable agent” just closed, on AWS.",
    { x: 0.62, y: 1.45, w: 11.7, h: 0.9, fontFace: BF, fontSize: 15, color: INK, lineSpacingMultiple: 1.15, margin: 0 });
  const prims = [
    ["Identity", "Inbound JWT — Cognito or the customer's IdP"],
    ["Policy (Cedar)", "Deny-by-default, forbid-wins authorization"],
    ["Gateway", "APIs / Lambda exposed as governed MCP tools"],
    ["Runtime", "Serverless, session-isolated agent hosting"],
    ["Observability", "OpenTelemetry spans per agent & tool step"],
  ];
  const w = 2.28, gap = 0.2, x0 = 0.62, y = 2.9, h = 3.15;
  prims.forEach((pr, i) => {
    const x = x0 + i * (w + gap);
    card(s, x, y, w, h);
    circle(s, x + w / 2 - 0.34, y + 0.35, 0.68, TEAL, String.fromCharCode(9679), MINT, 20);
    s.addText(pr[0], { x: x + 0.12, y: y + 1.2, w: w - 0.24, h: 0.5, align: "center", fontFace: TF, fontSize: 15.5, bold: true, color: NAVY, margin: 0 });
    s.addText(pr[1], { x: x + 0.16, y: y + 1.72, w: w - 0.32, h: 1.3, align: "center", fontFace: BF, fontSize: 12, color: "44535F", lineSpacingMultiple: 1.1, valign: "top", margin: 0 });
  });
  s.addText("Five native governance primitives — no platform to hand-build.",
    { x: 0.62, y: 6.25, w: 12, h: 0.4, fontFace: BF, fontSize: 13, italic: true, color: TEAL, margin: 0 });
  footer(s, 3);
  s.addNotes("This is the 'why now.' Previously teams hand-rolled identity, policy engines, audit. AgentCore makes those native. The strategic implication is on the next slide.");
})();

/* ------------------------------------------------------------------ 4. THESIS */
(() => {
  const s = p.addSlide(); bg(s, NAVY);
  eyebrow(s, "The thesis", MINT);
  s.addText("Implement the regulated pattern natively — don't rebuild the platform", { x: 0.6, y: 0.45, w: 12.1, h: 0.9, fontFace: TF, fontSize: 26, bold: true, color: WHITE, margin: 0 });

  // left card — native
  card(s, 0.62, 1.7, 5.9, 4.35, NAVY2, 0.1);
  s.addText("NATIVE ON AGENTCORE", { x: 0.95, y: 2.0, w: 5.2, h: 0.4, fontFace: BF, fontSize: 13, bold: true, color: MINT, charSpacing: 1.5, margin: 0 });
  const nativeList = ["Verified human + agent identity", "Deny-by-default authorization (Cedar)", "Least-privilege intersection (agent ∩ human)", "Tools as governed endpoints (Gateway)", "Serverless agent runtime", "Tracing & observability"];
  nativeList.forEach((t, i) => {
    const y = 2.55 + i * 0.56;
    circle(s, 0.95, y, 0.34, MINT, "✓", NAVY, 13);
    s.addText(t, { x: 1.42, y: y - 0.04, w: 4.9, h: 0.42, fontFace: BF, fontSize: 13.5, color: WHITE, valign: "middle", margin: 0 });
  });

  // right card — build
  card(s, 6.8, 1.7, 5.9, 4.35, "1E2E1A", 0.1);
  s.addShape(p.ShapeType.rect, { x: 6.8, y: 1.7, w: 5.9, h: 4.35, fill: { type: "none" }, line: { color: AMBER, width: 1.25 } });
  s.addText("THE REGULATED LAST MILE — BUILT ALONGSIDE", { x: 7.13, y: 2.0, w: 5.4, h: 0.4, fontFace: BF, fontSize: 13, bold: true, color: AMBER, charSpacing: 1, margin: 0 });
  const buildList = [["Fail-closed PHI / PII masking", "No masking → no draft. Ever."], ["Human sign-off gate (separation of duties)", "A different qualified person, single-use token."], ["Immutable WORM audit", "Append-only + Object Lock; writer can't tamper."]];
  buildList.forEach((t, i) => {
    const y = 2.62 + i * 1.02;
    circle(s, 7.13, y, 0.4, AMBER, "⚙", NAVY, 15);
    s.addText(t[0], { x: 7.68, y: y - 0.06, w: 4.85, h: 0.5, fontFace: BF, fontSize: 14, bold: true, color: WHITE, valign: "middle", margin: 0 });
    s.addText(t[1], { x: 7.68, y: y + 0.4, w: 4.85, h: 0.5, fontFace: BF, fontSize: 12, color: "C9D6C2", valign: "top", margin: 0 });
  });

  s.addText("Governed agentic AI on AWS-native services, plus the three controls regulated customers need that AgentCore doesn't ship. A stronger — and more honest — story than “we built our own platform.”",
    { x: 0.62, y: 6.2, w: 12.1, h: 0.7, fontFace: BF, fontSize: 13.5, italic: true, color: ICE, align: "center", margin: 0 });
  footer(s, 4);
  s.addNotes("The core strategic message. Six of nine controls are native; three are the regulated 'last mile' we add. This positions the work as extending AgentCore, not competing with it.");
})();

/* ------------------------------------------------------------------ 5. HERO USE CASE */
(() => {
  const s = p.addSlide(); bg(s, CLOUD);
  eyebrow(s, "The hero use case");
  title(s, "Pharmacovigilance: intake of an Individual Case Safety Report (ICSR)");
  // process flow
  const steps = ["Parse the\nadverse event", "Extract\nE2B(R3) fields", "Code MedDRA\n& WHODrug", "Assess seriousness\n& reporting clock", "Draft the CIOMS\nnarrative", "Qualified-person\nsign-off", "Submit to\nFDA / EMA"];
  const n = steps.length, w = 1.58, gap = 0.14, x0 = 0.62, y = 1.85, h = 1.35;
  steps.forEach((t, i) => {
    const x = x0 + i * (w + gap);
    const isHuman = i === 5, isSubmit = i === 6;
    const fill = isHuman ? AMBER : isSubmit ? NAVY : TEAL;
    s.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { type: "none" }, rectRadius: 0.08, shadow: sh({ blur: 6, offset: 2, opacity: 0.16 }) });
    s.addText(t, { x, y, w, h, align: "center", valign: "middle", color: WHITE, fontFace: BF, fontSize: 11, bold: true, lineSpacingMultiple: 1.0, margin: 0.03 });
    if (i < n - 1) s.addText("›", { x: x + w - 0.02, y, w: gap + 0.04, h, align: "center", valign: "middle", color: MUTED, fontSize: 16, bold: true, margin: 0 });
  });
  // the one rule callout
  card(s, 0.62, 3.7, 12.1, 2.35, CARD, 0.1);
  circle(s, 1.05, 4.15, 0.9, NAVY, "§", MINT, 30);
  s.addText("The one rule that drives the entire security design", { x: 2.25, y: 4.02, w: 10.2, h: 0.5, fontFace: TF, fontSize: 18, bold: true, color: NAVY, margin: 0 });
  s.addText([
    { text: "Under GVP and 21 CFR 314 / 600, a qualified person makes the causality and reportability determination and commits the submission. ", options: { bold: true, color: INK } },
    { text: "The agent assembles, codes, and drafts — it never self-submits. Everything else in this architecture exists to enforce that one sentence.", options: { color: "34434F" } },
  ], { x: 2.25, y: 4.55, w: 10.25, h: 1.35, fontFace: BF, fontSize: 14, valign: "top", lineSpacingMultiple: 1.16, margin: 0 });
  footer(s, 5);
  s.addNotes("Amber = the human step; navy = the irreversible submit. The callout is the crux: a qualified person commits, the agent never self-submits. Keep returning to this rule.");
})();

/* ------------------------------------------------------------------ 6. ARCHITECTURE MAP */
(() => {
  const s = p.addSlide(); bg(s, CLOUD);
  eyebrow(s, "Architecture");
  title(s, "Six controls native, three built alongside");
  const rows = [
    ["Verified human + agent identity", "AgentCore Identity — inbound JWT (Cognito / customer IdP)", true],
    ["Deny-by-default authorization", "AgentCore Policy (Cedar) — default-deny + forbid-wins", true],
    ["Least-privilege intersection", "Cedar principal = OAuthUser; JWT claims + tool-parameter conditions", true],
    ["Tools as governed endpoints", "AgentCore Gateway — Lambda → MCP tools; every call passes Policy", true],
    ["Agent hosting / runtime", "AgentCore Runtime — serverless, session-isolated", true],
    ["Tracing / observability", "AgentCore Observability — OpenTelemetry spans", true],
    ["Fail-closed PHI / PII masking", "mask_phi tool — Comprehend Medical, before model & audit", false],
    ["Human sign-off gate", "Step Functions waitForTaskToken — bound, single-use approval", false],
    ["Immutable WORM audit", "Append-only DynamoDB + S3 Object Lock — Part 11 evidence", false],
  ];
  const x = 0.62, w = 12.1, y0 = 1.55, rh = 0.565;
  rows.forEach((r, i) => {
    const y = y0 + i * rh;
    const fill = i % 2 === 0 ? CARD : "ECF1F5";
    s.addShape(p.ShapeType.rect, { x, y, w, h: rh - 0.06, fill: { color: fill }, line: { type: "none" } });
    // status pill
    const c = r[2] ? MINT : AMBER;
    s.addShape(p.ShapeType.roundRect, { x: x + 0.14, y: y + 0.11, w: 1.35, h: 0.32, fill: { color: c }, line: { type: "none" }, rectRadius: 0.16 });
    s.addText(r[2] ? "NATIVE" : "BUILD", { x: x + 0.14, y: y + 0.11, w: 1.35, h: 0.32, align: "center", valign: "middle", color: r[2] ? NAVY : WHITE, fontFace: BF, fontSize: 10.5, bold: true, margin: 0 });
    s.addText(r[0], { x: x + 1.65, y, w: 3.75, h: rh - 0.06, valign: "middle", fontFace: BF, fontSize: 13, bold: true, color: INK, margin: 0 });
    s.addText(r[1], { x: x + 5.5, y, w: w - 5.7, h: rh - 0.06, valign: "middle", fontFace: BF, fontSize: 12, color: "44535F", margin: 0 });
  });
  footer(s, 6);
  s.addNotes("The full nine-control map. Green NATIVE (6) = AgentCore services. Amber BUILD (3) = the regulated last mile. This is the honest architecture at a glance.");
})();

/* ------------------------------------------------------------------ 7. GOVERNED FLOW */
(() => {
  const s = p.addSlide(); bg(s, NAVY);
  eyebrow(s, "Runtime behavior", MINT);
  s.addText("How one governed action flows", { x: 0.6, y: 0.45, w: 12, h: 0.8, fontFace: TF, fontSize: 26, bold: true, color: WHITE, margin: 0 });
  const flow = [
    ["1", "Human authenticates", "Cognito / IdP issues a JWT for the person on whose behalf the agent acts."],
    ["2", "Agent decides to call a tool", "The Strands agent runs on AgentCore Runtime and reaches for a Gateway tool."],
    ["3", "Gateway validates identity", "Inbound auth checks the JWT before anything runs."],
    ["4", "Cedar evaluates — default-deny", "Principal + action + resource + conditions. A deny means the tool never runs — and is auditable."],
    ["5", "Masking runs first (fail-closed)", "For drafting, mask_phi de-identifies the case; the model only ever sees masked text."],
    ["6", "Human gate for the commit", "request_signoff opens a Step Functions gate; a second qualified person approves. Only then does finalize run."],
    ["7", "WORM audit + trace", "Every decision and state change is written to an immutable record and traced in Observability."],
  ];
  const colW = 5.95, x0 = 0.62, y0 = 1.55, rh = 0.75;
  flow.forEach((f, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i < 4 ? i : i - 4;
    const x = x0 + col * (colW + 0.55);
    const y = y0 + row * (rh + 0.12);
    circle(s, x, y, 0.56, i === 5 ? AMBER : i === 6 ? MINT : TEAL, f[0], i === 5 ? NAVY : i === 6 ? NAVY : WHITE, 17);
    s.addText(f[1], { x: x + 0.72, y: y - 0.04, w: colW - 0.75, h: 0.32, fontFace: BF, fontSize: 14, bold: true, color: WHITE, margin: 0 });
    s.addText(f[2], { x: x + 0.72, y: y + 0.28, w: colW - 0.75, h: 0.5, fontFace: BF, fontSize: 11.5, color: ICE, valign: "top", lineSpacingMultiple: 1.05, margin: 0 });
  });
  footer(s, 7);
  s.addNotes("Read down the left column, then the right. Steps 5 (fail-closed masking) and 6 (human gate) are the regulated controls; step 4 (Cedar deny-by-default) is the native spine.");
})();

/* ------------------------------------------------------------------ 8. PROOF */
(() => {
  const s = p.addSlide(); bg(s, CLOUD);
  eyebrow(s, "Evidence");
  title(s, "Proof, not slideware: 17 / 17 governance checks, live on AWS");
  // stat band
  const stats = [["17/17", "governance checks pass", MINT], ["6", "controls native on AgentCore", TEAL], ["3", "regulated controls built & proven", AMBER], ["0", "residual on teardown", NAVY]];
  const sw = 2.9, gap = 0.23, x0 = 0.62, y = 1.5;
  stats.forEach((st, i) => {
    const x = x0 + i * (sw + gap);
    card(s, x, y, sw, 1.35);
    s.addText(st[0], { x, y: y + 0.12, w: sw, h: 0.7, align: "center", fontFace: TF, fontSize: 34, bold: true, color: st[2], margin: 0 });
    s.addText(st[1], { x: x + 0.1, y: y + 0.85, w: sw - 0.2, h: 0.42, align: "center", fontFace: BF, fontSize: 11.5, color: "44535F", margin: 0 });
  });
  // what's proven
  card(s, 0.62, 3.15, 12.1, 3.05, CARD, 0.1);
  s.addText("Every one of these ran live, in ENFORCE mode, and each denial names the exact Cedar policy that fired:", { x: 0.95, y: 3.35, w: 11.4, h: 0.4, fontFace: BF, fontSize: 13, bold: true, color: NAVY, margin: 0 });
  const proofs = [
    "Deny-by-default — reviewer ALLOW, outsider DENY",
    "Mask-before-model — un-masked draft is forbidden",
    "No-self-submit — the agent can't finalize",
    "Real PHI masking (Comprehend Medical, fail-closed)",
    "Real Bedrock ICSR narrative through a Guardrail",
    "Immutable WORM audit — write-once, append-only",
    "Human sign-off — approver ≠ requester, single-use",
    "Live openFDA / FAERS lookup (319k real reports)",
  ];
  const cw = 5.55, cx = [0.98, 6.9];
  proofs.forEach((t, i) => {
    const col = i < 4 ? 0 : 1; const row = i % 4;
    const x = cx[col]; const yy = 3.85 + row * 0.56;
    circle(s, x, yy, 0.32, MINT, "✓", NAVY, 12);
    s.addText(t, { x: x + 0.44, y: yy - 0.05, w: cw, h: 0.44, valign: "middle", fontFace: BF, fontSize: 12.5, color: INK, margin: 0 });
  });
  footer(s, 8);
  s.addNotes("The credibility slide. It's not a mockup — it's a reproducible, one-command demo that stands the stack up, proves 17 checks in ENFORCE mode, and tears down with zero residual.");
})();

/* ------------------------------------------------------------------ 9. RUNTIME + IDENTITY */
(() => {
  const s = p.addSlide(); bg(s, CLOUD);
  eyebrow(s, "Native on Runtime");
  title(s, "The agent runs on AgentCore Runtime — driven by the human's identity");
  s.addText("The human authenticates with Cognito; that same identity flows to the Gateway, so Cedar evaluates the real person. The agent inherits the human's least-privilege — it can do nothing the human isn't allowed to do.",
    { x: 0.62, y: 1.45, w: 12.1, h: 0.75, fontFace: BF, fontSize: 14, color: INK, lineSpacingMultiple: 1.14, margin: 0 });
  // two outcome cards
  card(s, 0.62, 2.5, 5.95, 2.35, CARD, 0.1);
  circle(s, 1.0, 2.85, 0.62, MINT, "✓", NAVY, 20);
  s.addText("Reviewer identity", { x: 1.8, y: 2.85, w: 4.6, h: 0.5, fontFace: TF, fontSize: 17, bold: true, color: NAVY, valign: "middle", margin: 0 });
  s.addText("Runs the full governed workflow: FAERS lookup → mask PHI → draft narrative → write audit → request sign-off. The forbidden finalize tool is hidden from the agent entirely by Cedar.",
    { x: 1.0, y: 3.6, w: 5.35, h: 1.15, fontFace: BF, fontSize: 12.5, color: "34434F", valign: "top", lineSpacingMultiple: 1.12, margin: 0 });

  card(s, 6.78, 2.5, 5.95, 2.35, CARD, 0.1);
  circle(s, 7.16, 2.85, 0.62, "C0392B", "✕", WHITE, 20);
  s.addText("Outsider identity", { x: 7.96, y: 2.85, w: 4.6, h: 0.5, fontFace: TF, fontSize: 17, bold: true, color: NAVY, valign: "middle", margin: 0 });
  s.addText("Access denied — zero authorized tools. The agent honestly reports it did nothing: nothing masked, drafted, audited, or submitted. Deny-by-default holds even when the agent is driving.",
    { x: 7.16, y: 3.6, w: 5.35, h: 1.15, fontFace: BF, fontSize: 12.5, color: "34434F", valign: "top", lineSpacingMultiple: 1.12, margin: 0 });

  // bottom strip — two extras
  const extras = [["Observable", "OpenTelemetry spans + structured logs per step, correlated to the identity, in CloudWatch."], ["Decoupled", "Stable identity + dynamic gateway discovery: the runtime survives redeploys untouched."]];
  extras.forEach((e, i) => {
    const x = 0.62 + i * 6.16;
    s.addShape(p.ShapeType.roundRect, { x, y: 5.1, w: 5.95, h: 1.0, fill: { color: NAVY }, line: { type: "none" }, rectRadius: 0.09, shadow: sh() });
    s.addText(e[0].toUpperCase(), { x: x + 0.3, y: 5.24, w: 5.4, h: 0.34, fontFace: BF, fontSize: 12, bold: true, color: MINT, charSpacing: 1.5, margin: 0 });
    s.addText(e[1], { x: x + 0.3, y: 5.56, w: 5.4, h: 0.5, fontFace: BF, fontSize: 12, color: ICE, valign: "top", lineSpacingMultiple: 1.05, margin: 0 });
  });
  footer(s, 9);
  s.addNotes("This is 'max-native on AgentCore' realized: the agent itself runs on Runtime under a real Cognito identity, and governance holds on the real principal. Outsider proves deny-by-default even when the agent drives.");
})();

/* ------------------------------------------------------------------ 10. LAST-MILE CONTROLS */
(() => {
  const s = p.addSlide(); bg(s, CLOUD);
  eyebrow(s, "The regulated last mile", AMBER);
  title(s, "Three controls we build on top — the audit-passing difference");
  const cards = [
    ["Fail-closed PHI masking", "Comprehend Medical de-identifies the case before the model or the audit sees it. If masking can't run, the draft is blocked — no un-masked PHI is ever emitted.", "HIPAA", TEAL],
    ["Human sign-off gate", "Submission is never an inline tool call. A Step Functions gate pauses for a different qualified person, who approves with a bound, single-use token.", "GxP · separation of duties", AMBER],
    ["Immutable WORM audit", "Append-only DynamoDB + S3 Object Lock capture INTENT → COMMITTED. The principal that writes evidence is denied delete, update, and bypass.", "21 CFR Part 11", MINT],
  ];
  const w = 3.86, gap = 0.24, x0 = 0.62, y = 1.75, h = 4.2;
  cards.forEach((c, i) => {
    const x = x0 + i * (w + gap);
    card(s, x, y, w, h, CARD, 0.1);
    circle(s, x + 0.34, y + 0.36, 0.72, c[3], String(i + 1));
    s.addText(c[0], { x: x + 1.2, y: y + 0.42, w: w - 1.35, h: 0.62, fontFace: TF, fontSize: 15.5, bold: true, color: NAVY, valign: "middle", lineSpacingMultiple: 0.98, margin: 0 });
    s.addText(c[2], { x: x + 0.34, y: y + 1.35, w: w - 0.68, h: 0.36, fontFace: BF, fontSize: 11, bold: true, color: c[3], margin: 0 });
    s.addText(c[1], { x: x + 0.34, y: y + 1.85, w: w - 0.68, h: 2.1, fontFace: BF, fontSize: 12.8, color: "34434F", valign: "top", lineSpacingMultiple: 1.15, margin: 0 });
  });
  s.addText("AgentCore's Observability traces are for operations — not tamper-proof evidence. That gap is exactly why the WORM audit is a control, not a log.",
    { x: 0.62, y: 6.2, w: 12.1, h: 0.4, fontFace: BF, fontSize: 12.5, italic: true, color: TEAL, margin: 0 });
  footer(s, 10);
  s.addNotes("These three are where a governed agent earns an auditor's trust. Each maps to a named regulation. Fail-closed masking, a real human gate, and tamper-proof evidence.");
})();

/* ------------------------------------------------------------------ 11. WHY IT MATTERS FOR AWS */
(() => {
  const s = p.addSlide(); bg(s, CLOUD);
  eyebrow(s, "Strategic value");
  title(s, "Why this matters for AWS");
  const items = [
    ["Differentiates AgentCore where AWS wants to win", "Life sciences, healthcare, public sector — the verticals with the strictest bar are the ones where native governance is the deciding factor.", TEAL],
    ["A repeatable pattern, not a one-off", "One governed chassis — identity, Cedar, Gateway, Runtime, the three controls — with domain logic and fixtures swapped per use case.", MINT],
    ["Low blast radius, high credibility", "One deep, proven hero per vertical beats a claim of forty shallow agents. Reference-grade, not vaporware.", AMBER],
    ["Honest by construction", "It's clear about what's proven vs. engagement work — which is exactly what regulated buyers and their auditors trust.", NAVY],
  ];
  const w = 5.95, gap = 0.24, x0 = 0.62, y0 = 1.65, h = 2.05;
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = x0 + col * (w + gap), y = y0 + row * (h + 0.24);
    card(s, x, y, w, h, CARD, 0.1);
    circle(s, x + 0.34, y + 0.36, 0.6, it[2], String(i + 1));
    s.addText(it[0], { x: x + 1.12, y: y + 0.32, w: w - 1.3, h: 0.72, fontFace: TF, fontSize: 15.5, bold: true, color: NAVY, valign: "middle", lineSpacingMultiple: 0.98, margin: 0 });
    s.addText(it[1], { x: x + 0.34, y: y + 1.18, w: w - 0.66, h: 0.78, fontFace: BF, fontSize: 12.8, color: "34434F", valign: "top", lineSpacingMultiple: 1.12, margin: 0 });
  });
  footer(s, 11);
  s.addNotes("Tie the technical work back to AWS strategy: it wins regulated deals, it's reusable, it's low-risk, and it's credible because it's honest.");
})();

/* ------------------------------------------------------------------ 12. HONESTY BOUNDARY */
(() => {
  const s = p.addSlide(); bg(s, CLOUD);
  eyebrow(s, "Credibility");
  title(s, "What's proven vs. what's engagement work");
  // left — accelerator owns
  card(s, 0.62, 1.6, 5.95, 4.15, CARD, 0.1);
  s.addText("THE ACCELERATOR OWNS  ·  PROVEN", { x: 0.95, y: 1.85, w: 5.3, h: 0.4, fontFace: BF, fontSize: 12.5, bold: true, color: MINT, charSpacing: 1, margin: 0 });
  ["The agent + the Cedar policies", "The seven tools + fail-closed masking", "The human-gate workflow", "The immutable audit design", "Reproducible IaC + one-command demo", "The documentation set"].forEach((t, i) => {
    const y = 2.45 + i * 0.53;
    circle(s, 0.98, y, 0.32, MINT, "✓", NAVY, 12);
    s.addText(t, { x: 1.42, y: y - 0.05, w: 4.95, h: 0.44, valign: "middle", fontFace: BF, fontSize: 13, color: INK, margin: 0 });
  });
  // right — customer owns
  card(s, 6.78, 1.6, 5.95, 4.15, CARD, 0.1);
  s.addText("THE CUSTOMER OWNS  ·  ENGAGEMENT WORK", { x: 7.11, y: 1.85, w: 5.4, h: 0.4, fontFace: BF, fontSize: 12.5, bold: true, color: AMBER, charSpacing: 1, margin: 0 });
  ["IdP federation + role mapping", "Connector validation to live safety systems (Argus / Veeva) under a BAA", "MedDRA / WHODrug licensed dictionaries", "Computer-system validation (CSV / CSA)", "Production ATO / HITRUST / FedRAMP"].forEach((t, i) => {
    const y = 2.45 + i * 0.62;
    circle(s, 7.14, y, 0.32, AMBER, "⚙", NAVY, 12);
    s.addText(t, { x: 7.58, y: y - 0.06, w: 5.0, h: 0.56, valign: "middle", fontFace: BF, fontSize: 13, color: INK, lineSpacingMultiple: 1.0, margin: 0 });
  });
  s.addShape(p.ShapeType.roundRect, { x: 0.62, y: 5.95, w: 12.1, h: 0.7, fill: { color: NAVY }, line: { type: "none" }, rectRadius: 0.09 });
  s.addText("Nothing here is production-certified on day one — and saying so is the credibility.", { x: 0.62, y: 5.95, w: 12.1, h: 0.7, align: "center", valign: "middle", fontFace: BF, fontSize: 14, bold: true, italic: true, color: WHITE, margin: 0 });
  footer(s, 12);
  s.addNotes("Never oversell. This slide is what makes regulated buyers trust the rest. State the boundary plainly: we own the pattern and the proof; they own certification, connectors, and licensed dictionaries.");
})();

/* ------------------------------------------------------------------ 13. ROADMAP + ASK */
(() => {
  const s = p.addSlide(); bg(s, NAVY);
  s.addShape(p.ShapeType.ellipse, { x: 10.2, y: 4.6, w: 5.5, h: 5.5, fill: { color: NAVY2 }, line: { type: "none" } });
  eyebrow(s, "Roadmap", MINT);
  s.addText("One governed pattern, four regulated verticals", { x: 0.6, y: 0.45, w: 12, h: 0.85, fontFace: TF, fontSize: 26, bold: true, color: WHITE, margin: 0 });
  s.addText("The pharmacovigilance agent is the template. The same governed chassis — identity, Cedar, Gateway, Runtime, and the three last-mile controls — carries to the other hero agents by swapping domain logic and fixtures.",
    { x: 0.62, y: 1.4, w: 11.6, h: 0.8, fontFace: BF, fontSize: 14, color: ICE, lineSpacingMultiple: 1.14, margin: 0 });
  const verts = [["HCLS", "Pharmacovigilance", "PROVEN", MINT], ["SLG", "State & Local Gov", "NEXT", TEAL], ["HPP", "Healthcare Payer / Provider", "NEXT", TEAL], ["EDU", "Education", "NEXT", TEAL]];
  const w = 2.9, gap = 0.23, x0 = 0.62, y = 2.5;
  verts.forEach((v, i) => {
    const x = x0 + i * (w + gap);
    s.addShape(p.ShapeType.roundRect, { x, y, w, h: 1.75, fill: { color: NAVY2 }, line: { color: v[3], width: 1.25 }, rectRadius: 0.1, shadow: sh() });
    s.addText(v[0], { x, y: y + 0.22, w, h: 0.5, align: "center", fontFace: TF, fontSize: 22, bold: true, color: WHITE, margin: 0 });
    s.addText(v[1], { x: x + 0.1, y: y + 0.78, w: w - 0.2, h: 0.55, align: "center", fontFace: BF, fontSize: 12.5, color: ICE, valign: "top", lineSpacingMultiple: 1.0, margin: 0 });
    s.addShape(p.ShapeType.roundRect, { x: x + w / 2 - 0.6, y: y + 1.36, w: 1.2, h: 0.3, fill: { color: v[3] }, line: { type: "none" }, rectRadius: 0.15 });
    s.addText(v[2], { x: x + w / 2 - 0.6, y: y + 1.36, w: 1.2, h: 0.3, align: "center", valign: "middle", color: NAVY, fontFace: BF, fontSize: 10, bold: true, margin: 0 });
  });
  // the ask
  s.addText("THE ASK", { x: 0.62, y: 4.65, w: 4, h: 0.35, fontFace: BF, fontSize: 12.5, bold: true, color: MINT, charSpacing: 2, margin: 0 });
  const asks = [["1", "Internal demo", "Stand up the stack live and walk leadership through the 17-check proof."], ["2", "Customer workshops", "Take the pattern to regulated accounts as a reference architecture."], ["3", "Scoped pilot", "A pilot on synthetic data with a named safety org, boundary made explicit."]];
  asks.forEach((a, i) => {
    const x = 0.62 + i * 4.06;
    circle(s, x, 5.15, 0.5, MINT, a[0], NAVY, 16);
    s.addText(a[1], { x: x + 0.66, y: 5.13, w: 3.3, h: 0.34, fontFace: BF, fontSize: 14, bold: true, color: WHITE, margin: 0 });
    s.addText(a[2], { x: x + 0.66, y: 5.47, w: 3.3, h: 0.9, fontFace: BF, fontSize: 11.5, color: ICE, valign: "top", lineSpacingMultiple: 1.08, margin: 0 });
  });
  s.addText("Governed agentic AI, native on AWS — proven where the bar is highest.", { x: 0.62, y: 6.65, w: 12, h: 0.4, fontFace: TF, fontSize: 15, italic: true, bold: true, color: MINT, margin: 0 });
  s.addNotes("Close on the strategic multiplier: one pattern, four verticals, PV proven. The ask is a simple three-step path from internal demo to a scoped, synthetic-data pilot.");
})();

p.writeFile({ fileName: "PV-AgentCore-Leadership.pptx" }).then((f) => console.log("wrote", f));
