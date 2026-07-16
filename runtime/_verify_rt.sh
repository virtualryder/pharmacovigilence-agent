#!/usr/bin/env bash
# End-to-end verify: outsider -> ACCESS DENIED; reviewer -> full governed workflow.
SELF="$(cd "$(dirname "$0")" && pwd)"; source "$SELF/_env.sh"
echo "########## OUTSIDER (expect ACCESS DENIED, tools_available: []) ##########"
bash "$SELF/_invoke.sh" outsider "$PV_OUTSIDER_PW" 2>&1 | grep -E '"result"|tools_available|INVOKE_EXIT|Response'
echo
echo "########## REVIEWER (expect full governed workflow) ##########"
bash "$SELF/_invoke.sh" reviewer "$PV_REVIEWER_PW" 2>&1 | grep -E '"result"|tools_available|INVOKE_EXIT|Response'
