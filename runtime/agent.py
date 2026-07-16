"""PV intake agent — runs natively on Amazon Bedrock AgentCore Runtime.

Identity: the human authenticates (Cognito) and their ACCESS token is passed to this agent, which
uses it as the bearer for every governed Gateway (MCP) tool call, so Cedar evaluates the real human
principal. It never finalizes; it requests human sign-off (separation of duties owns the commit).

Decoupling: the gateway URL is discovered at runtime from SSM (/pv-icsr/gateway-url), so the spine
can rotate the gateway without ever redeploying this Runtime. Identity is a stable shared pool.

Observability: structured INFO logs for each governed step land in the Runtime's CloudWatch log
group; with OpenTelemetry enabled, Strands also emits per-agent/per-tool spans.
"""
import os
import logging
import boto3
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient
from mcp.client.streamable_http import streamablehttp_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s pv-agent %(message)s")
log = logging.getLogger("pv-agent")

app = BedrockAgentCoreApp()

MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
REGION = os.environ.get("AWS_REGION", "us-east-1")
GATEWAY_URL_ENV = os.environ.get("GATEWAY_URL", "")
GATEWAY_SSM_PARAM = os.environ.get("GATEWAY_SSM_PARAM", "/pv-icsr/gateway-url")

SYSTEM = (
    "You are a pharmacovigilance (drug-safety) ICSR intake agent running under strict governance. "
    "Your tools are exposed via a governed gateway; every call is authorized by policy against the "
    "human identity you act for. Follow this workflow for an adverse-event report:\n"
    "1. openfda_lookup - look up FAERS background for the suspect drug (no PHI).\n"
    "2. mask_phi - de-identify the raw case text; use the returned masked_case for everything after.\n"
    "3. assess_seriousness - on the masked case (deidentified=true), assess ICH E2B(R3) seriousness and "
    "the reporting clock (expedited vs periodic); carry the determination into the narrative and summary.\n"
    "4. draft_narrative - draft the ICSR narrative, passing the masked case and deidentified=true.\n"
    "5. write_audit - record an INTENT audit entry for the draft.\n"
    "6. request_signoff - request human sign-off to submit (a DIFFERENT qualified person must approve).\n"
    "NEVER call finalize_submission directly - it is forbidden by policy; the human sign-off gate owns "
    "submission. If any tool is denied by policy, STOP and report exactly which control blocked you. "
    "End with a short summary: what you looked up, the de-identified narrative, and the sign-off status."
)


def _gateway_url():
    # Dynamic discovery: SSM first (survives gateway rotation), env var as fallback.
    try:
        p = boto3.client("ssm", region_name=REGION).get_parameter(Name=GATEWAY_SSM_PARAM)
        url = p["Parameter"]["Value"]
        log.info("gateway_url source=SSM param=%s", GATEWAY_SSM_PARAM)
        return url
    except Exception as exc:
        log.warning("SSM gateway lookup failed (%s); falling back to GATEWAY_URL env", type(exc).__name__)
        return GATEWAY_URL_ENV


@app.entrypoint
def invoke(payload, context=None):
    p = payload or {}
    token = p.get("access_token") or ""
    requester = p.get("requester", "reviewer")
    icsr_id = p.get("icsr_id", "ICSR-2026-0100")
    prompt = p.get("prompt") or (
        "Adverse-event report for ICSR %s (requester %s). Raw case: "
        "\"Patient John Smith, DOB 04/12/1972, MRN 55512345, developed rhabdomyolysis and acute "
        "kidney injury after starting lisinopril 10mg daily; hospitalized, drug withdrawn, recovering.\" "
        "Run the governed ICSR workflow and request sign-off with icsr_id=%s and requester=%s."
        % (icsr_id, requester, icsr_id, requester)
    )
    log.info("invocation requester=%s icsr_id=%s token_present=%s", requester, icsr_id, bool(token))
    if not token:
        log.warning("no access_token; refusing (identity required)")
        return {"error": "no access_token provided; a human Cognito identity is required to drive governed tools"}

    gw = _gateway_url()
    if not gw:
        return {"error": "gateway URL not available (SSM and env both empty)"}

    model = BedrockModel(model_id=MODEL_ID, region_name=REGION, temperature=0.2)
    mcp_client = MCPClient(lambda: streamablehttp_client(gw, headers={"Authorization": "Bearer %s" % token}))
    with mcp_client:
        tools = mcp_client.list_tools_sync()
        names = [getattr(t, "tool_name", str(t)) for t in tools]
        log.info("authorized_tools requester=%s count=%d names=%s", requester, len(names), names)
        # Deny-by-default proof: an unauthorized identity gets NO tools -> report the denial and do
        # NOT invoke the model (it would only hallucinate a workflow it cannot actually perform).
        if not tools:
            log.warning("ACCESS DENIED requester=%s (no authorized tools)", requester)
            return {
                "result": "ACCESS DENIED — your identity is not authorized for any governed tool at "
                          "the gateway (Cedar deny-by-default). No workflow was run and nothing was "
                          "drafted, masked, audited, or submitted.",
                "tools_available": [], "governed": True,
            }
        agent = Agent(model=model, tools=tools, system_prompt=SYSTEM)
        result = agent(prompt)
    log.info("invocation_complete requester=%s icsr_id=%s result_chars=%d", requester, icsr_id, len(str(result)))
    return {"result": str(result), "tools_available": names}


if __name__ == "__main__":
    app.run()
