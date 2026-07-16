#!/usr/bin/env bash
echo "########## OUTSIDER (expect ACCESS DENIED, tools_available: []) ##########"
bash /c/Users/daryd/Projects-DR/pv-runtime/_invoke.sh outsider 'PvOutsider#2026!' 2>&1 | grep -E '"result"|tools_available|INVOKE_EXIT|Response'
echo
echo "########## REVIEWER (expect full governed workflow) ##########"
bash /c/Users/daryd/Projects-DR/pv-runtime/_invoke.sh reviewer 'PvReviewer#2026!' 2>&1 | grep -E '"result"|tools_available|INVOKE_EXIT|Response'
