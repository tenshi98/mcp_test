# 1. Arquitectura y descripción general

## Objetivo y alcance
Permitir que agentes de IA consulten y modifiquen una tabla de datos mediante MCP, con control estricto de **quién** accede
(autenticación) y **qué** puede hacer (autorización). Es una base de referencia reutilizable para servidores MCP con acceso
controlado a bases de datos.

**Dentro del alcance:** CRUD de `test_records`, tokens propios, vinculación OAuth, roles/scopes, auditoría, scripts SQL, pruebas.
**Fuera de alcance:** servidor de autorización OAuth propio (se delega en un proveedor externo), UI de administración
(se usa el CLI `bin/admin.js`), motores SQL distintos de SQLite (la capa `src/records/repository.js` es el único punto a portar).

## Tecnologías
Node.js 24 (ESM) · `@modelcontextprotocol/sdk` 1.x (Streamable HTTP + stdio) · `zod` (validación + JSON Schema de las herramientas)
· `node:sqlite` (SQLite, sentencias preparadas) · `node:test` (pruebas) · `node:crypto` (HMAC-SHA256, PKCE).

## Diagrama de arquitectura
```
 ┌──────────────┐   HTTPS/HTTP + Bearer     ┌────────────────────────────── Servidor MCP ──────────────────────────────┐
 │ Agente/Cliente│ ───────────────────────► │ http.js  ──► auth.authenticate ──► server.js (McpServer)                 │
 │ (Claude, ...) │ ◄─────────────────────── │  /mcp         (tokens | OAuth)      │ por herramienta:                    │
 └──────────────┘    JSON-RPC (MCP)         │  /oauth/*                           │  1 authenticate (de nuevo)          │
        │  stdio (MCP_TOKEN)                │  /.well-known/...                   │  2 requirePermission (autorización) │
        └─────────────────────────────────► │ index.js stdio ─────────────────────┤  3 validar (zod) + handler          │
                                            │                                     │  4 audit (log + audit_log)          │
                                            │                                     ▼                                     │
                                            │            records/repository.js  (SQL preparado, lista blanca)           │
                                            └───────────────────────────────┬──────────────────────────────────────────┘
                                                                            ▼
                      SQLite: allowed_users · access_tokens · oauth_users · test_records · audit_log
        OAuth:  Servidor MCP ◄──code+PKCE──► Proveedor OAuth externo (token + userinfo)
```

## Flujo de una llamada
1. El cliente envía `POST /mcp` con `Authorization: Bearer <token>`.
2. `http.js` autentica: token `mcp_…` (hash en BD, vigencia, revocación) o access token OAuth (validado vía *userinfo*).
   Sin credencial válida → `401` + `WWW-Authenticate` (con `resource_metadata`). Usuario inactivo → `403`.
3. Se crea un servidor MCP efímero (modo *stateless*) y se procesa el JSON-RPC.
4. En cada `tools/call` se **reautentica** (la revocación es inmediata) y se comprueba el permiso de la herramienta.
5. Los parámetros se validan con zod (tipos, formatos, rangos); el repositorio ejecuta SQL parametrizado.
6. Respuesta estructurada (`structuredContent` + `content[0].text` JSON). Errores: `isError: true` con `{error:{code,message}}`.

## Estructura de directorios
```
sql/            001_schema.sql (tablas)  002_seed_records.sql (30 registros ficticios)
src/
  index.js      arranque (http | stdio)          config.js   variables de entorno y roles
  app.js        composición de dependencias      db.js       SQLite + ejecución de scripts
  http.js       transporte HTTP, OAuth endpoints server.js   registro de herramientas + guardas
  audit.js logger.js errors.js
  security/     tokens.js users.js oauth.js auth.js
  records/      schemas.js (validación)  repository.js (SQL)
  tools/        definitions.js (6 herramientas)
bin/admin.js    CLI de administración
test/           pruebas automatizadas
docs/ examples/ .env.example
```

## Componentes
| Componente | Responsabilidad |
|---|---|
| `security/auth.js` | Autentica (quién) y autoriza (permiso efectivo = rol ∩ scopes del token) |
| `security/tokens.js` | Emite/valida/revoca tokens; guarda solo `HMAC-SHA256(token, TOKEN_PEPPER)` |
| `security/oauth.js` | Code + PKCE, `state` de un solo uso, vinculación `oauth_users → allowed_users` |
| `records/repository.js` | Único módulo que toca `test_records`; columnas solo desde listas blancas |
| `tools/definitions.js` | Contrato de cada herramienta (nombre, permiso, esquema, lógica) |
| `server.js` | Aplica autenticación, autorización, manejo de errores y auditoría a todas las herramientas |

## Modelo de datos
`allowed_users` 1—N `access_tokens`; `allowed_users` 1—N `oauth_users` (vínculo por `allowed_user_id`); `audit_log` independiente.
Detalle de columnas en [sql/001_schema.sql](../sql/001_schema.sql).
