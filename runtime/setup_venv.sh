#!/usr/bin/env bash
# Create the Python 3.12 venv + install the AgentCore/Strands toolkit. Portable (Windows/macOS/Linux).
set -e
SELF="$(cd "$(dirname "$0")" && pwd)"; cd "$SELF"
# Python 3.12: Windows uses the 'py' launcher; POSIX uses python3.12.
if command -v py >/dev/null 2>&1; then PYCMD="py -3.12"; else PYCMD="python3.12"; fi
$PYCMD -m venv .venv
if [ -f .venv/Scripts/python.exe ]; then PY=".venv/Scripts/python.exe"; AC=".venv/Scripts/agentcore.exe"; else PY=".venv/bin/python"; AC=".venv/bin/agentcore"; fi
"$PY" -m pip install --upgrade pip >/dev/null
"$PY" -m pip install "bedrock-agentcore" "bedrock-agentcore-starter-toolkit" "strands-agents" "strands-agents-tools"
echo "=== versions ==="
"$PY" -m pip show bedrock-agentcore bedrock-agentcore-starter-toolkit strands-agents 2>/dev/null | grep -E '^(Name|Version):'
echo "=== agentcore CLI ==="
"$AC" --help >/dev/null 2>&1 && echo "agentcore CLI OK" || echo "agentcore CLI NOT found"
echo "SETUP_DONE"
