# _env.sh — shared runtime resolver. Portable across OS + install path.
# Source AFTER setting SELF="$(cd "$(dirname "$0")" && pwd)".
REGION="${AWS_REGION:-us-east-1}"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1 AGENTCORE_SUPPRESS_RECOMMENDATION=1 COLUMNS=140 TERM=dumb
# venv layout differs by OS: Windows -> .venv/Scripts/*.exe ; POSIX -> .venv/bin/*
if [ -f "$SELF/.venv/Scripts/python.exe" ]; then
  PY="$SELF/.venv/Scripts/python.exe"; AC="$SELF/.venv/Scripts/agentcore.exe"
else
  PY="$SELF/.venv/bin/python"; AC="$SELF/.venv/bin/agentcore"
fi
# spine-state.env is written by deploy_spine.sh at the project root (parent of runtime/).
STATE="${PV_SPINE_STATE:-$SELF/../spine-state.env}"
# Test-user passwords — OVERRIDE via env; the placeholder defaults are meant to be rotated.
PV_REVIEWER_PW="${PV_REVIEWER_PW:-ChangeMe-Reviewer1!}"
PV_APPROVER_PW="${PV_APPROVER_PW:-ChangeMe-Approver1!}"
PV_OUTSIDER_PW="${PV_OUTSIDER_PW:-ChangeMe-Outsider1!}"
# SSM parameter prefix for gateway discovery (root of gateway.ssm_discovery_param).
SSM_PREFIX="${PV_SSM_PREFIX:-/pv-icsr}"
