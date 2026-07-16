// pv_reviewer_permit — PROVEN LIVE (AgentCore ENFORCE, 2026-07-15).
// A principal whose Cognito `cognito:groups` claim contains "pv_reviewer" may invoke tools;
// AgentCore Cedar is default-deny, so everyone else is blocked with no matching permit.
// Note: cognito:groups surfaces as a Cedar STRING tag -> match with `like`, not `.contains`.
// Broad (unconstrained-action) policy => resource scoped to the type `is AgentCore::Gateway`.
permit(
  principal,
  action,
  resource is AgentCore::Gateway
) when {
  principal.hasTag("cognito:groups") && principal.getTag("cognito:groups") like "*pv_reviewer*"
};
