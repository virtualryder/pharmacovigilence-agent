import json
import boto3
from botocore.exceptions import BotoCoreError, ClientError

# Fail-closed PHI/PII de-identification tool for the PV ICSR pipeline.
#
# Contract:
#   input : { "case": "<free text, or JSON string, containing possible PHI>" }
#   output: { "deidentified": true,  "masked_case": "<text>", "entities_masked": N, "masked_by": "comprehend-medical" }
#        or { "deidentified": false, "masked_case": null, "error": "<reason>" }  (fail-closed: no text leaked)
#
# Why fail-closed matters: the Cedar policy `mask_before_draft` forbids draft_narrative
# unless context.input.deidentified == true. This tool is the ONLY thing that should ever
# set deidentified=true, and it only does so AFTER Comprehend Medical successfully ran and
# every detected PHI span was redacted. If detection cannot run, we return deidentified=false
# and DROP the text entirely, so no un-masked PHI can flow to the model or the audit.

_PHI_MAX_BYTES = 18000  # Comprehend Medical hard limit is 20000 UTF-8 bytes; stay under it.


def _text_of(event):
    e = event or {}
    if isinstance(e, str):
        try:
            e = json.loads(e)
        except Exception:
            e = {"case": e}
    case = e.get("case", e)
    if not isinstance(case, str):
        case = json.dumps(case, ensure_ascii=False)
    return case


def _redact(text, entities):
    """Replace each detected span with a typed placeholder, working end->start so offsets hold."""
    spans = sorted(entities, key=lambda x: x.get("BeginOffset", 0), reverse=True)
    out = text
    n = 0
    for ent in spans:
        b = ent.get("BeginOffset")
        e = ent.get("EndOffset")
        if b is None or e is None or b < 0 or e > len(out) or b >= e:
            continue
        label = ent.get("Type") or ent.get("Category") or "PHI"
        out = out[:b] + "[REDACTED:" + label + "]" + out[e:]
        n += 1
    return out, n


def handler(event, context):
    text = _text_of(event)

    if not text.strip():
        # Nothing to mask is a safe, deterministic de-identified result.
        return {"deidentified": True, "masked_case": "", "entities_masked": 0, "masked_by": "noop-empty"}

    if len(text.encode("utf-8")) > _PHI_MAX_BYTES:
        # Fail closed rather than silently masking only the first chunk.
        return {"deidentified": False, "masked_case": None,
                "error": "input exceeds mask_phi size limit; split the case before masking"}

    # ---- MANDATORY control: Comprehend Medical DetectPHI (fail-closed) ----
    try:
        cm = boto3.client("comprehendmedical")
        phi = cm.detect_phi(Text=text)
        masked, n_phi = _redact(text, phi.get("Entities", []))
    except (BotoCoreError, ClientError) as exc:
        # Detection could not run -> do NOT emit the text. This is the fail-closed guarantee.
        return {"deidentified": False, "masked_case": None,
                "error": "PHI detection failed (fail-closed, no text emitted): " + type(exc).__name__}

    # ---- Best-effort backstop: generic PII on the ALREADY PHI-masked text ----
    n_pii = 0
    try:
        cp = boto3.client("comprehend")
        pii = cp.detect_pii_entities(Text=masked, LanguageCode="en")
        masked, n_pii = _redact(masked, pii.get("Entities", []))
    except (BotoCoreError, ClientError):
        # The mandatory PHI pass already succeeded on this text; a PII-backstop hiccup does not
        # leak PHI (it runs on masked text), so we proceed rather than fail the whole call.
        n_pii = 0

    return {
        "deidentified": True,
        "masked_case": masked,
        "entities_masked": n_phi + n_pii,
        "phi_entities": n_phi,
        "pii_entities": n_pii,
        "masked_by": "comprehend-medical",
    }
