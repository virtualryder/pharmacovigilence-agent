// no_self_submit — PROVEN LIVE (AgentCore ENFORCE, 2026-07-15).
// The agent can never finalize/submit an ICSR itself: a blanket forbid on finalize_submission.
// Only the human sign-off workflow (Step Functions waitForTaskToken, a second qualified person)
// may finalize, via a separate privileged path that is NOT an agent tool. Separation of duties.
// NOTE: this intentionally "denies every request for that action" -> the Cedar analyzer flags it as
// Overly Restrictive, so create the policy with `--validation-mode IGNORE_ALL_FINDINGS`.
forbid(
  principal,
  action == AgentCore::Action::"pv-core___finalize_submission",
  resource == AgentCore::Gateway::"arn:aws:bedrock-agentcore:us-east-1:111122223333:gateway/pv-icsr-gw-fnq8n59ipa"
);
