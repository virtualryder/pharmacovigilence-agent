// mask_before_assess — the seriousness/reporting-clock assessor may never run on un-masked data.
// Forbid assess_seriousness unless the tool input carries deidentified == true (set by mask_phi).
// forbid overrides permit, so this is a hard guardrail — the same masking-before-processing control
// that protects draft_narrative, extended to the seriousness assessment step. Enforced by POLICY,
// not just tool code. Tool inputs surface under `context.input.<field>`; action id = <target>___<tool>.
// NOTE: deploy_spine.sh authors this inline against the LIVE gateway ARN (it rotates per spine
// cycle); the ARN below is illustrative of the last deploy.
forbid(
  principal,
  action == AgentCore::Action::"assess-seriousness___assess_seriousness",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-east-1:111122223333:gateway/pv-icsr-gw-fnq8n59ipa"
) unless {
  context.input.deidentified == true
};
