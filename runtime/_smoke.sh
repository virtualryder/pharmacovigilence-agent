#!/usr/bin/env bash
cd /c/Users/daryd/Projects-DR/pv-runtime
echo "=== import smoke test ==="
./.venv/Scripts/python.exe -c "
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient
from mcp.client.streamable_http import streamablehttp_client
print('IMPORTS_OK')
" 2>&1 | tail -15
echo "=== agentcore configure --help ==="
./.venv/Scripts/agentcore.exe configure --help 2>&1 | sed -n '1,60p'
