#!/usr/bin/env bash
# Claude Code (CLI) – transporte HTTP con Bearer token
claude mcp add --transport http mcp-crud http://127.0.0.1:3000/mcp --header "Authorization: Bearer $MCP_TOKEN"
# Variante stdio
# claude mcp add mcp-crud -e DB_PATH=... -e TOKEN_PEPPER=... -e MCP_TOKEN=$MCP_TOKEN -- node /RUTA/ABSOLUTA/mcp_test/src/index.js stdio
