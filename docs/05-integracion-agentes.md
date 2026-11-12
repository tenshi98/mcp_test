# 5. Integración con agentes

Prerrequisitos: servidor iniciado (`npm start`) o ruta a `src/index.js`, y un token (`npm run admin -- token-issue <userId>`).
Reemplace `/RUTA/ABSOLUTA` y `mcp_<token>`. Ejemplos listos en [examples/](../examples/).

| Parámetro | Significado |
|---|---|
| `url` | Endpoint MCP: `http://HOST:PORT/mcp` (Streamable HTTP) |
| `Authorization: Bearer …` | Credencial. Sin ella el servidor responde 401 |
| `command`/`args` (stdio) | Lanza el servidor como subproceso: `node src/index.js stdio` |
| `MCP_TOKEN` (stdio) | Token del cliente (stdio no tiene cabeceras) |
| `DB_PATH`, `TOKEN_PEPPER` (stdio) | Deben coincidir con los del servidor/CLI que emitió el token |

## Claude Desktop
Archivo: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) o `%APPDATA%\Claude\claude_desktop_config.json` (Windows).
- **stdio (recomendado en local):** [examples/claude_desktop_config.stdio.json](../examples/claude_desktop_config.stdio.json)
- **HTTP vía `mcp-remote`:** [examples/claude_desktop_config.http.json](../examples/claude_desktop_config.http.json)
Reinicie Claude Desktop; las 6 herramientas aparecen en el selector. Las anotaciones (`readOnlyHint`, `destructiveHint`) hacen que pida confirmación en las destructivas.

## OpenCode
[examples/opencode.json](../examples/opencode.json) → `opencode.json` del proyecto o `~/.config/opencode/opencode.json`.
`type: "remote"` usa `url` + `headers`; `type: "local"` usa `command` (array) + `environment`. Verifique con `opencode mcp list`.

## Claude Code
`bash examples/claude_code.sh` (usa `claude mcp add --transport http … --header "Authorization: Bearer …"`).

## VS Code / Cursor / otros clientes
VS Code (`.vscode/mcp.json`): [examples/vscode.mcp.json](../examples/vscode.mcp.json) (pide el token y lo oculta).
Cualquier cliente compatible con Streamable HTTP que permita cabeceras personalizadas sirve (Cursor, Windsurf, Cline, MCP Inspector:
`npx @modelcontextprotocol/inspector` → Transport *Streamable HTTP*, URL `/mcp`, header `Authorization`). Clientes solo-stdio: use `mcp-remote` como puente.

## Con OAuth
Navegue a `<PUBLIC_URL>/oauth/login`, inicie sesión; la respuesta contiene `access_token` (token MCP) para usar como Bearer en cualquiera de las configuraciones.

## Limitar lo que puede hacer un agente
Emita tokens con scopes: `npm run admin -- token-issue 2 --scopes records:read --label agente-lectura`.
