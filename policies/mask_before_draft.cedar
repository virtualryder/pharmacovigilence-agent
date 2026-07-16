// mask_before_draft — PROVEN LIVE (AgentCore ENFORCE, 2026-07-15).
// The model may never draft on un-masked data: forbid draft_narrative unless the tool input
// carries deidentified == true (set by mask_phi). forbid overrides permit, so this is a hard
// guardrail — masking-before-model enforced by POLICY, not just code.
// Tool inputs surface under `context.input.<field>`. Tool-specific (constrained-action) policies
// must pin the resource to the specific gateway ARN. Action id = <targetName>___<toolName>.
forbid(
  principal,
  action == AgentCore::Action::"pv-core___draft_narrative",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-east-1:864217980669:gateway/pv-icsr-gw-fnq8n59ipa"
) unless {
  context.input.deidentified == true
};
