#!/usr/bin/env bash
# Local smoke test: agent imports resolve + the agentcore CLI is present.
SELF="$(cd "$(dirname "$0")" && pwd)"; cd "$SELF"; source "$SELF/_env.sh"
echo "=== import smoke test ==="
"$PY" -c "
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient
from mcp.client.streamable_http import streamablehttp_client
print('IMPORTS_OK')
" 2>&1 | tail -15
echo "=== agentcore configure --help ==="
"$AC" configure --help 2>&1 | sed -n '1,40p'
