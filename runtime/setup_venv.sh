#!/usr/bin/env bash
set -e
cd /c/Users/daryd/Projects-DR/pv-runtime
py -3.12 -m venv .venv
./.venv/Scripts/python.exe -m pip install --upgrade pip >/dev/null
./.venv/Scripts/python.exe -m pip install "bedrock-agentcore" "bedrock-agentcore-starter-toolkit" "strands-agents" "strands-agents-tools"
echo "=== versions ==="
./.venv/Scripts/python.exe -m pip show bedrock-agentcore bedrock-agentcore-starter-toolkit strands-agents 2>/dev/null | grep -E '^(Name|Version):'
echo "=== agentcore CLI ==="
./.venv/Scripts/agentcore.exe --version 2>&1 || echo "agentcore.exe not found"
echo "SETUP_DONE"
