import json
import os
import boto3
from botocore.exceptions import BotoCoreError, ClientError

# PV core tools behind the `pv-core` Gateway target:
#   - draft_narrative    -> REAL Bedrock (Converse) ICSR narrative from a de-identified case
#   - finalize_submission-> deny-only stub (the human sign-off gate owns real submission)
#
# The Gateway routes both tools to this one Lambda; we branch on the input shape
# (finalize carries icsr_id; draft carries case/deidentified).

DRAFT_MODEL_ID = os.environ.get("DRAFT_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
GUARDRAIL_ID = os.environ.get("GUARDRAIL_ID", "")
GUARDRAIL_VERSION = os.environ.get("GUARDRAIL_VERSION", "DRAFT")

_SYSTEM = (
    "You are a pharmacovigilance medical writer drafting an ICSR (Individual Case Safety Report) "
    "narrative in CIOMS style. You are given an ALREADY DE-IDENTIFIED adverse-event case. "
    "Write a single, concise clinical narrative (roughly 150-350 words). Rules: "
    "(1) Preserve every [REDACTED:...] placeholder verbatim; never guess or reconstruct redacted values. "
    "(2) Never invent patient identifiers, dates, or facts not present in the case. "
    "(3) Cover, when available: reporter/source, de-identified patient descriptors, suspect product and dosing, "
    "adverse event(s) with onset and timeline, clinical course, outcome, and seriousness/causality as reported. "
    "(4) Output the narrative text only - no preamble, headings, or JSON."
)


def _coerce(event):
    e = event or {}
    if isinstance(e, str):
        try:
            e = json.loads(e)
        except Exception:
            e = {"_raw": e}
    return e


def _draft(e):
    # Belt-and-suspenders: Cedar's mask_before_draft already blocks un-masked drafting,
    # but the tool itself also refuses rather than ever drafting on non-de-identified input.
    if e.get("deidentified") is not True:
        return {"error": "refused: case is not de-identified (deidentified must be true)",
                "drafted_by": None, "deidentified_input": e.get("deidentified")}
    case = e.get("case", "")
    if not isinstance(case, str):
        case = json.dumps(case, ensure_ascii=False)
    kwargs = dict(
        modelId=DRAFT_MODEL_ID,
        system=[{"text": _SYSTEM}],
        messages=[{"role": "user", "content": [{"text": "De-identified case:\n" + case}]}],
        inferenceConfig={"maxTokens": 900, "temperature": 0.2},
    )
    # Fail-closed OUTPUT guardrail: a Bedrock Guardrail scans the drafted narrative (PII anonymize
    # as defense-in-depth for anything masking missed). If the guardrail can't run, drafting fails
    # rather than returning an unguarded narrative.
    if GUARDRAIL_ID:
        kwargs["guardrailConfig"] = {"guardrailIdentifier": GUARDRAIL_ID,
                                     "guardrailVersion": GUARDRAIL_VERSION}
    try:
        br = boto3.client("bedrock-runtime")
        resp = br.converse(**kwargs)
        narrative = resp["output"]["message"]["content"][0]["text"].strip()
        stop = resp.get("stopReason")
        # A hard block by the guardrail -> fail closed, do not emit content.
        if stop == "guardrail_intervened" and not narrative:
            return {"error": "output guardrail blocked the draft (fail-closed)",
                    "drafted_by": None, "guardrail": "BLOCKED"}
        # Short proof fields FIRST (the MCP client truncates long results ~200 chars); narrative LAST.
        return {"drafted_by": DRAFT_MODEL_ID, "chars": len(narrative),
                "guardrail_applied": bool(GUARDRAIL_ID), "deidentified_input": True,
                "narrative": narrative}
    except (BotoCoreError, ClientError, KeyError, IndexError) as exc:
        # Do not fabricate a narrative on model/guardrail failure; surface the error (fail-closed).
        return {"error": "draft failed: " + type(exc).__name__ + ": " + str(exc),
                "drafted_by": None}


def handler(event, context):
    e = _coerce(event)
    if "icsr_id" in e:
        # finalize_submission is never a real inline call - the human sign-off gate owns it.
        # Cedar also hard-denies this action; this body is defense-in-depth.
        return {"error": "refused: finalize_submission must go through the human sign-off gate",
                "icsr_id": e.get("icsr_id"), "submitted": False}
    if "case" in e or "deidentified" in e:
        return _draft(e)
    return {"ok": True, "received": e, "note": "pv core tool"}
