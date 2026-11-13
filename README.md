# Servidor MCP – Gestión de datos (CRUD) con acceso controlado

Servidor [Model Context Protocol](https://modelcontextprotocol.io) que expone operaciones CRUD sobre una tabla de prueba
(`test_records`, 30 registros ficticios) con **autenticación por tokens**, **OAuth 2.0 (Authorization Code + PKCE)**,
**autorización por rol/scope**, consultas preparadas y auditoría.

- Node.js ≥ 22.5 (probado en 24) · SDK oficial `@modelcontextprotocol/sdk` · SQLite (`node:sqlite`, sin compilación nativa)
- Transportes: **Streamable HTTP** (`/mcp`) y **stdio**
- 6 herramientas: `list_records`, `get_record`, `search_records`, `create_record`, `update_record`, `delete_record`

## Tabla de Contenidos

- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Características](#características)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Scripts para crear la base de datos.](#scripts-para-crear-la-base-de-datos)
- [Configuración](#configuración)
- [Cómo ejecutar el proyecto](#cómo-ejecutar-el-proyecto)
- [Ejemplos de uso](#ejemplos-de-uso)
- [Estructura de carpetas completa del proyecto (backend + frontend).](#estructura-de-carpetas-completa-del-proyecto-backend--frontend)
- [Explicaciones breves de cada módulo](#explicaciones-breves-de-cada-módulo)
- [Migración a Otras Bases de Datos en caso de ser necesario](#migración-a-otras-bases-de-datos-en-caso-de-ser-necesario)
- [Solución de Problemas](#solución-de-problemas)
- [Notas Adicionales](#notas-adicionales)

## Tecnologías utilizadas

| Tecnología | Versión / uso |
|---|---|
| **Node.js** (ESM) | ≥ 22.5 (probado en 24). Requerido por `node:sqlite` |
| **@modelcontextprotocol/sdk** | 1.32.x · `McpServer`, `StreamableHTTPServerTransport`, `StdioServerTransport` |
| **zod** | 4.6.x · validación de entrada y generación del JSON Schema de cada herramienta |
| **node:sqlite** | SQLite embebido (`DatabaseSync`), sentencias preparadas, WAL. Sin módulos nativos que compilar |
| **node:http** | Servidor HTTP propio: `/mcp`, `/health`, `/oauth/*`, `/.well-known/*` |
| **node:crypto** | HMAC-SHA256 (hash de tokens), aleatoriedad de tokens/`state` y PKCE (S256) |
| **node:test** | Pruebas automatizadas (38 casos) sin dependencias externas |
| **OAuth 2.0 / OIDC** | Authorization Code + PKCE contra un proveedor externo (Google, GitHub, etc.) |
| **SQLite 3** | Base de datos relacional en un único archivo (`DB_PATH`) |
| **npm** | ≥ 10 · scripts `start`, `start:stdio`, `db:init`, `admin`, `test` |

## Características

- **6 herramientas MCP** de CRUD: listar, obtener, buscar, crear, actualizar y eliminar registros de `test_records`.
- **Doble transporte**: Streamable HTTP sin estado (`POST /mcp`) y stdio para clientes locales.
- **Autenticación por tokens** propios con formato `mcp_…`; en la base solo se guarda su `HMAC-SHA256` con `TOKEN_PEPPER`.
- **OAuth 2.0 opcional** (Authorization Code + PKCE S256, `state` de un solo uso, vinculación de identidades).
- **Autorización por rol y scope**: `reader`, `editor`, `admin`; el permiso efectivo es la **intersección** rol ∩ scopes del token.
- **Revalidación en cada `tools/call`**: revocar un token o desactivar un usuario surte efecto inmediato.
- **Consultas preparadas y listas blancas de columnas**: nunca se interpola entrada del usuario en el SQL.
- **Validación estricta** de tipos, formatos, rangos y fechas con zod; errores de dominio con códigos (`VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHENTICATED`, `FORBIDDEN`, `DATABASE_ERROR`).
- **Eliminación con confirmación explícita** (`confirm: true`) y permiso separado (`records:delete`).
- **Auditoría persistente** en `audit_log` (usuario, evento, resultado) sin secretos ni cuerpos de peticiones.
- **Paginación, orden, selección de campos y filtros** por texto, categoría, estado, fechas, cantidades, montos y campos nulos.
- **CLI de administración** (`bin/admin.js`) para base de datos, usuarios, tokens y usuarios OAuth.
- **Logs JSON** a stderr y archivo opcional, con niveles configurables.
- **Scripts SQL idempotentes** y 30 registros ficticios de ejemplo.
- **Documentación completa** en `docs/` y configuraciones de agentes listas para usar en `examples/`.

## Requisitos

- **Hardware:** cualquier equipo; ≥ 512 MB RAM y 100 MB de disco son suficientes.
- **Software:** Node.js ≥ 22.5 (recomendado 24; trae `node:sqlite`), npm ≥ 10, git. Opcional: `sqlite3` CLI para inspeccionar la BD,
  `curl` para verificar.
- **Sistemas:** Linux, macOS, Windows (WSL o nativo).
- **Credencial mínima:** un `TOKEN_PEPPER` de al menos 16 caracteres en `.env` y un token emitido con `bin/admin.js`.
- **Opcional:** un proveedor OAuth 2.0/OIDC con endpoints de autorización, token y *userinfo* (solo si desea OAuth).
- **Puerto libre:** `3000` por defecto (`HTTP_PORT`), accesible para los clientes MCP.

## Instalación

```bash
git clone <repositorio> mcp_test && cd mcp_test
npm install                                  # @modelcontextprotocol/sdk, zod
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # pegue el resultado en TOKEN_PEPPER
```

Edite `.env` y defina como mínimo `TOKEN_PEPPER` (obligatorio, ≥ 16 caracteres). El resto de variables tiene valores por
defecto razonables para desarrollo local; la referencia completa está en [Configuración](#configuración) y en
[.env.example](.env.example).

### Base de datos

La BD es un archivo SQLite (`DB_PATH`, por defecto `data/mcp.db`). Se crea **desde cero** con los scripts entregados:

```bash
npm run db:init                  # ejecuta sql/001_schema.sql + sql/002_seed_records.sql
npm run db:init -- --no-seed     # solo tablas, sin datos de prueba
# alternativa manual con sqlite3:
sqlite3 data/mcp.db < sql/001_schema.sql && sqlite3 data/mcp.db < sql/002_seed_records.sql
```

`001_schema.sql` es idempotente. `002_seed_records.sql` **borra y recarga** `test_records` (úselo solo en entornos de prueba).
Ver detalles en [Scripts para crear la base de datos](#scripts-para-crear-la-base-de-datos).

### Primer usuario y token

```bash
npm run admin -- user-add --name "Admin" --email admin@example.com --role admin
npm run admin -- token-issue 1 --label primer-token --days 30
```

Guarde el token: **no se puede recuperar** (solo se almacena su hash).

### Inicio rápido (5 minutos)

```bash
npm install
cp .env.example .env                       # edite TOKEN_PEPPER (ver docs/03-configuracion.md)
npm run db:init                            # crea tablas + 30 registros de prueba
npm run admin -- user-add --name "Su Nombre" --email usted@example.com --role admin
npm run admin -- token-issue 1 --label mi-agente     # copie el token (se muestra una sola vez)
npm start                                  # http://127.0.0.1:3000/mcp
npm test                                   # 38 pruebas automatizadas
```

Verificación: `curl localhost:3000/health` → `{"status":"ok"}`; y con el token:

```bash
curl -s -X POST localhost:3000/mcp -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_records","arguments":{"page_size":3}}}'
```

### Iniciar y verificar

```bash
npm start                         # HTTP en HTTP_HOST:HTTP_PORT (127.0.0.1:3000)
curl localhost:3000/health        # {"status":"ok"}
curl -i -X POST localhost:3000/mcp -d '{}'     # 401 (sin token) → la seguridad funciona
npm test                          # todas las pruebas deben pasar
sqlite3 data/mcp.db 'select count(*) from test_records'     # 30
```

Para exponerlo fuera de localhost, colóquelo detrás de un proxy TLS (nginx/Caddy) y ajuste `PUBLIC_URL`. Nunca publique HTTP sin TLS.

## Scripts para crear la base de datos.

Todos los scripts viven en [`sql/`](sql/) y se ejecutan con el CLI incluido (`npm run db:init`) o, si lo prefiere, con el
cliente `sqlite3`. La ruta del archivo se toma de `DB_PATH` (por defecto `./data/mcp.db`).

| Script | Qué hace | ¿Borra datos? |
|---|---|---|
| [`sql/001_schema.sql`](sql/001_schema.sql) | Crea todas las tablas e índices: `allowed_users`, `access_tokens`, `oauth_users`, `test_records`, `audit_log`. Idempotente (`IF NOT EXISTS`). | No |
| [`sql/002_seed_records.sql`](sql/002_seed_records.sql) | Carga 30 registros ficticios en `test_records` con semilla fija. **Hace `DELETE` previo** de la tabla. | Sí (solo `test_records`) |

Formas de ejecutarlos:

```bash
# 1) Recomendada: usa DB_PATH del .env y crea la carpeta base si no existe
npm run db:init                    # esquema + datos de prueba
npm run db:init -- --no-seed       # solo esquema (entorno productivo o BD vacía)

# 2) Manual, sin cargar .env
sqlite3 data/mcp.db < sql/001_schema.sql
sqlite3 data/mcp.db < sql/002_seed_records.sql

# 3) Scripts nuevos de evolución: nómbrelos sql/003_*.sql, 004_*.sql, ...
#    (001 y 002 son idempotentes; los cambios de columnas requieren ALTER en un script nuevo)
```

Notas:

- `npm run db:init` es equivalente a `npm run admin -- db-init` y es seguro de repetir: el esquema usa `IF NOT EXISTS`.
- `--no-seed` equivale a `npm run admin -- db-init --no-seed`.
- El servidor **no** crea la BD automáticamente: si arranca contra un archivo sin tablas verá `no such table`. Ejecute
  `npm run db:init` primero.
- Para inspeccionar: `sqlite3 data/mcp.db '.tables'` y `sqlite3 data/mcp.db 'select count(*) from test_records'`.

## Configuración

Toda la configuración es por variables de entorno (`.env`, cargado con `--env-file-if-exists`). Referencia: [.env.example](.env.example).

### Variables

| Variable | Defecto | Descripción |
|---|---|---|
| `DB_PATH` | `./data/mcp.db` | Archivo SQLite (`:memory:` solo en pruebas) |
| `HTTP_HOST` / `HTTP_PORT` | `127.0.0.1` / `3000` | Interfaz y puerto. Mantener en loopback salvo proxy |
| `PUBLIC_URL` | `http://127.0.0.1:3000` | URL externa; define `redirect_uri` OAuth y metadatos |
| `TOKEN_PEPPER` | — (**obligatorio**, ≥16) | Secreto del HMAC con que se hashean los tokens. Si se pierde o cambia, todos los tokens dejan de validar |
| `TOKEN_TTL_DAYS` | `30` | Vigencia por defecto de tokens nuevos |
| `MCP_TOKEN` | vacío | Token del cliente en modo stdio |
| `ROLE_READER/EDITOR/ADMIN` | ver abajo | Permisos de cada rol (lista separada por comas) |
| `OAUTH_*` | vacío | Ver más abajo. OAuth se habilita si están CLIENT_ID, AUTHORIZE_URL, TOKEN_URL y USERINFO_URL |
| `LOG_LEVEL`, `LOG_FILE` | `info`, vacío | Nivel (`debug/info/warn/error`) y archivo opcional (siempre también a stderr) |

### Autenticación y tokens
- Formato: `mcp_` + 32 bytes aleatorios en base64url. En BD: HMAC-SHA256 con `TOKEN_PEPPER`; `token_prefix` (8 chars) solo identifica.
- Vigencia: `expires_at`; revocación: `status='revoked'` (inmediata, se comprueba en cada llamada).
- Scopes opcionales por token (`--scopes records:read`): el permiso efectivo es la **intersección** con el rol. Útil para agentes de solo lectura.

### Permisos (autorización)
Permisos disponibles: `records:read`, `records:create`, `records:update`, `records:delete`.

| Rol | Por defecto | list/get/search | create | update | delete |
|---|---|---|---|---|---|
| `reader` | read | ✅ | ❌ | ❌ | ❌ |
| `editor` | read, create, update | ✅ | ✅ | ✅ | ❌ |
| `admin` | todos | ✅ | ✅ | ✅ | ✅ |

Cambie el mapeo con `ROLE_*`; un permiso desconocido impide arrancar. Cada herramienta declara el permiso que exige en `src/tools/definitions.js`.

### OAuth (opcional)
Funciona con cualquier proveedor OAuth 2.0/OIDC que ofrezca authorization-code, PKCE (S256) y un endpoint *userinfo* que devuelva `sub|id`, `email`, `name`.
Registre en el proveedor el redirect URI **`<PUBLIC_URL>/oauth/callback`**.
```
OAUTH_PROVIDER=google
OAUTH_CLIENT_ID=...apps.googleusercontent.com
OAUTH_CLIENT_SECRET=...
OAUTH_AUTHORIZE_URL=https://accounts.google.com/o/oauth2/v2/auth
OAUTH_TOKEN_URL=https://oauth2.googleapis.com/token
OAUTH_USERINFO_URL=https://openidconnect.googleapis.com/v1/userinfo
OAUTH_REQUIRE_PREAUTHORIZED=true
```
`OAUTH_REQUIRE_PREAUTHORIZED=true` (recomendado): solo ingresan identidades cuyo email ya exista en `allowed_users`.
Con `false`, la identidad se registra pero queda **sin autorización** hasta que un administrador la vincule (`oauth-link`) y autorice.

### Gestión de credenciales
- `.env` está en `.gitignore`; no lo versione. En producción use el gestor de secretos de la plataforma.
- Nunca ponga tokens en URLs ni en repositorios; los clientes los envían en el encabezado `Authorization`.
- Rote tokens emitiendo uno nuevo y revocando el anterior; rote `TOKEN_PEPPER` solo si sospecha compromiso (invalida todos los tokens).

### Configuración de agentes
Ver [05-integracion-agentes.md](docs/05-integracion-agentes.md) y la carpeta [examples/](examples/).

## Cómo ejecutar el proyecto

| Comando | Qué hace |
|---|---|
| `npm start` | Servidor **HTTP** (Streamable HTTP) en `http://HTTP_HOST:HTTP_PORT/mcp` |
| `npm run start:stdio` | Servidor **stdio** para clientes locales (requiere `MCP_TOKEN` válido) |
| `npm run db:init` | Crea/actualiza el esquema y carga los datos de prueba |
| `npm run admin -- <comando>` | CLI de administración (usuarios, tokens, OAuth, BD) |
| `npm test` | Ejecuta las 38 pruebas automatizadas (`node:test`) |

### Modo HTTP (recomendado para agentes remotos)

```bash
npm start
# → server.started { mode: 'http', host: '127.0.0.1', port: 3000 }
curl localhost:3000/health
```

Rutas expuestas:

| Ruta | Método | Uso |
|---|---|---|
| `/mcp` | `POST` | Endpoint MCP (JSON-RPC) con `Authorization: Bearer <token>` |
| `/health` | `GET` | Comprobación de vida → `{"status":"ok"}` |
| `/oauth/login` | `GET` | Inicia el flujo OAuth (solo si está configurado) |
| `/oauth/callback` | `GET` | Retorno del proveedor; entrega el `access_token` una sola vez |
| `/.well-known/oauth-protected-resource` | `GET` | Metadatos del recurso protegido |

El servidor es *stateless*: crea un `McpServer` y un transporte por petición; solo acepta `POST` en `/mcp`.

### Modo stdio (cliente local)

```bash
MCP_TOKEN=mcp_... npm run start:stdio
```

En stdio no hay cabeceras HTTP: el token llega por `MCP_TOKEN` y se valida al arrancar y en cada llamada. El proceso
termina si el token es inválido y **nunca** debe imprimir nada por `stdout` (rompería el protocolo; los logs van a `stderr`).

### Conectarlo a un agente

- **Claude Desktop (stdio):** [examples/claude_desktop_config.stdio.json](examples/claude_desktop_config.stdio.json)
- **Claude Desktop (HTTP):** [examples/claude_desktop_config.http.json](examples/claude_desktop_config.http.json)
- **OpenCode:** [examples/opencode.json](examples/opencode.json) → `opencode.json` del proyecto o `~/.config/opencode/opencode.json`
- **VS Code:** [examples/vscode.mcp.json](examples/vscode.mcp.json)
- **Claude Code:** `bash examples/claude_code.sh`
- **Inspector:** `npx @modelcontextprotocol/inspector` → transporte *Streamable HTTP*, URL `/mcp`, header `Authorization`.

Ejemplo mínimo (HTTP):

```json
{
  "mcpServers": {
    "mcp-crud": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": { "Authorization": "Bearer mcp_<token>" }
    }
  }
}
```

Detalle por cliente en [docs/05-integracion-agentes.md](docs/05-integracion-agentes.md).

## Ejemplos de uso

Cada llamada es JSON-RPC 2.0 `tools/call` sobre `POST /mcp`. Guarde el token en una variable:

```bash
export TOKEN=mcp_...
export URL=http://127.0.0.1:3000/mcp
```

### list_records — listar con paginación

```bash
curl -s -X POST $URL -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_records","arguments":{"fields":["id","first_name","last_name"],"sort_by":"last_name","page":2,"page_size":5}}}'
```

### get_record — obtener uno por id

```bash
curl -s -X POST $URL -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_record","arguments":{"id":7}}}'
```

### search_records — filtrar

```bash
curl -s -X POST $URL -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_records","arguments":{"query":"Flores","is_active":true,"quantity_min":100,"sort_by":"amount","sort_order":"desc"}}}'
```

Filtros disponibles: `query`, `category`, `is_active`, `created_from/to`, `updated_from/to`, `birth_from/to`,
`quantity_min/max`, `amount_min/max`, `has_null`.

### create_record — crear

```bash
curl -s -X POST $URL -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"create_record","arguments":{"first_name":"Ana","last_name":"Prueba","email":"ana@example.com","quantity":5,"amount":12.5,"category":"ventas"}}}'
```

### update_record — actualizar campos

```bash
curl -s -X POST $URL -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"update_record","arguments":{"id":3,"description":"Nueva descripción","quantity":42}}}'
```

### delete_record — eliminar (doble paso)

```bash
# 1) Sin confirm: no borra, devuelve el registro y pide confirmación
curl -s -X POST $URL -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"delete_record","arguments":{"id":3}}}'

# 2) Con confirm:true elimina
curl -s -X POST $URL -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"delete_record","arguments":{"id":3,"confirm":true}}}'
```

### Ejemplos conversacionales

| Petición al agente | Herramienta y argumentos | Resultado |
|---|---|---|
| "Muéstrame todos los registros" | `list_records {page_size:100}` | Lista + `pagination.total = 30` |
| "Busca a Camila Rojas" | `search_records {query:"Camila Rojas"}` | Registros que contienen ambas palabras |
| "Registros creados entre marzo y junio de 2026" | `search_records {created_from:"2026-03-01", created_to:"2026-06-30"}` | Registros en el rango |
| "Crea a Ana Prueba, ana@example.com, categoría ventas" | `create_record {first_name,last_name,email,category}` | `{record:{id:31,…}}` |
| "Cambia la descripción del 31" | `update_record {id:31, description:"…"}` | `{updated:true, record}` con otros campos intactos |
| "Marca el 31 como inactivo y cambia su cantidad a 10" | `update_record {id:31, is_active:false, quantity:10}` | Varios campos a la vez |
| "Elimina el registro 31" | 1) `delete_record {id:31}` → pide confirmación; 2) tras su "sí": `delete_record {id:31, confirm:true}` | `{deleted:true}` |
| "Dame el registro 9999" | `get_record {id:9999}` | `NOT_FOUND`: el agente informa que no existe |
| Usuario `reader` pide eliminar | `delete_record …` | `FORBIDDEN: Permiso requerido: records:delete` |

Consejos: pida solo los campos necesarios ("solo nombre y email") para respuestas más cortas; para conjuntos grandes pida por páginas;
las fechas se interpretan en UTC. Más casos en [docs/07-manual-de-uso.md](docs/07-manual-de-uso.md) y referencia completa de
parámetros y errores en [docs/06-herramientas.md](docs/06-herramientas.md).

### Operaciones sin permisos
Un agente con token `reader` o con scope `records:read` puede listar/buscar pero create/update/delete devuelven `FORBIDDEN` y quedan
registradas como `authz.denied` en `audit_log`. Un token revocado o expirado hace que el cliente reciba 401.

## Estructura de carpetas completa del proyecto (backend + frontend).

Este repositorio contiene **solo el backend** (servidor MCP). No hay frontend web: la capa "frontend" es el **cliente MCP**
(Claude Desktop, OpenCode, Claude Code, VS Code/Cursor, Inspector), que se conecta por HTTP o stdio. Sus archivos de
configuración de ejemplo están en `examples/` y actúan como interfaz de usuario final (el agente).

```
mcp_test/
├── README.md                      Documentación principal (este archivo)
├── LICENSE                        Licencia GPL-3.0
├── package.json                   Metadatos, dependencias y scripts npm
├── package-lock.json              Árbol de dependencias fijado
├── .env.example                   Plantilla comentada de variables de entorno
├── .gitignore                     Excluye .env, data/*.db, logs, node_modules
│
├── bin/
│   └── admin.js                   CLI: db-init, usuarios, tokens, usuarios OAuth
│
├── data/
│   └── .gitkeep                   Carpeta del archivo SQLite (DB_PATH); aquí se crea mcp.db
│
├── docs/
│   ├── 01-arquitectura.md         Alcance, diagramas, flujos, componentes, modelo de datos
│   ├── 02-instalacion.md          Requisitos, instalación, BD, verificación
│   ├── 03-configuracion.md        Variables, tokens, permisos, OAuth, credenciales
│   ├── 04-seguridad.md            Autenticación vs. autorización, flujo OAuth, amenazas
│   ├── 05-integracion-agentes.md  Claude Desktop, OpenCode, Claude Code, VS Code y otros
│   ├── 06-herramientas.md         Referencia de las 6 herramientas (parámetros, ejemplos, errores)
│   ├── 07-manual-de-uso.md        Ejemplos prácticos con agentes
│   ├── 08-mantenimiento.md        Operación, respaldos, logs, solución de problemas
│   └── 09-pruebas.md              Cobertura de pruebas y cómo extenderlas
│
├── examples/                      "Frontend": configuración de los clientes MCP
│   ├── claude_code.sh             Alta del servidor en Claude Code
│   ├── claude_desktop_config.http.json   Claude Desktop vía mcp-remote (HTTP)
│   ├── claude_desktop_config.stdio.json  Claude Desktop lanzando el proceso (stdio)
│   ├── opencode.json              OpenCode: variantes remote y local
│   └── vscode.mcp.json            VS Code / Cursor
│
├── logs/
│   └── .gitkeep                   Carpeta para LOG_FILE (server.log)
│
├── sql/
│   ├── 001_schema.sql             DDL idempotente: 5 tablas + índices
│   └── 002_seed_records.sql       30 registros ficticios (borra y recarga test_records)
│
├── src/
│   ├── index.js                   Punto de entrada: `node src/index.js http|stdio`
│   ├── app.js                     Composition root: configuración y servicios
│   ├── config.js                  Carga/valida entorno, roles y OAuth
│   ├── db.js                      Apertura SQLite, PRAGMAs y ejecución de scripts SQL
│   ├── http.js                    Servidor HTTP, /mcp, /health, /oauth/*, well-known
│   ├── server.js                  McpServer: registra herramientas + auth + auditoría
│   ├── audit.js                   Auditoría en audit_log y logs
│   ├── logger.js                  Logs JSON a stderr y archivo
│   ├── errors.js                  AppError y constructores de errores de dominio
│   │
│   ├── records/
│   │   ├── schemas.js             Campos, validación zod y reglas de escritura
│   │   └── repository.js          SQL preparado de test_records (único acceso a la tabla)
│   │
│   ├── security/
│   │   ├── auth.js                Autenticación (quién) y autorización (permiso)
│   │   ├── tokens.js              Emisión, hash HMAC, validación y revocación
│   │   ├── users.js               allowed_users: alta, rol, activar/desactivar
│   │   └── oauth.js               Code + PKCE, state, userinfo, vinculación
│   │
│   └── tools/
│       └── definitions.js         Contrato de las 6 herramientas MCP
│
└── test/
    ├── helpers.js                 Utilidades comunes de prueba
    ├── auth.test.js               Autenticación, tokens, roles y scopes
    ├── crud.test.js               Las 6 herramientas y validaciones
    ├── oauth.test.js              Flujo OAuth (proveedor simulado)
    └── stdio.test.js              Transporte stdio
```

## Explicaciones breves de cada módulo

| Módulo | Responsabilidad |
|---|---|
| `src/index.js` | Arranque del proceso. Decide transporte según el argumento (`http` por defecto o `stdio`), valida `MCP_TOKEN` en stdio y gestiona el apagado (`SIGINT`/`SIGTERM`). |
| `src/app.js` | *Composition root*: carga la configuración, abre la BD, crea logger, auditoría, usuarios, tokens, OAuth, auth y repositorio, y los inyecta en el resto de módulos. Facilita las pruebas (permite inyectar `db`, `logger`, `fetchFn`). |
| `src/config.js` | Lee variables de entorno con valores por defecto, construye el mapa de roles/permisos, decide si OAuth está habilitado y valida lo indispensable (por ejemplo, `TOKEN_PEPPER`) antes de arrancar. |
| `src/db.js` | Abre SQLite con `node:sqlite`, activa `foreign_keys`, WAL y `busy_timeout`, y ejecuta `sql/001_schema.sql` y `sql/002_seed_records.sql`. Exporta `SQL_DIR` y `nowIso`. |
| `src/http.js` | Servidor HTTP sin framework: limita el cuerpo a 1 MB, autentica el `Bearer`, expone `/health`, metadatos OAuth, `/oauth/login`, `/oauth/callback` y `/mcp`; crea un servidor MCP efímero por petición (*stateless*). |
| `src/server.js` | Construye el `McpServer` y registra cada herramienta. En cada `tools/call` reautentica, comprueba el permiso, ejecuta el handler, audita y normaliza errores (`isError: true`). |
| `src/tools/definitions.js` | Contrato declarativo de las 6 herramientas: nombre, descripción, permiso, `inputShape` (zod), anotaciones y handler. Añadir una herramienta es añadir un objeto aquí. |
| `src/records/schemas.js` | Lista blanca de campos, esquemas zod de entrada, campos editables, formatos (email, fechas, longitudes) y mensajes de validación. |
| `src/records/repository.js` | Único módulo que consulta `test_records`. Construye `WHERE`/`ORDER BY` con listas blancas y sentencias preparadas, pagina, filtra y convierte filas al formato de la API. Punto único a cambiar para otro motor de BD. |
| `src/security/auth.js` | Autentica tokens propios y tokens OAuth; devuelve el principal (usuario, rol, scopes, permisos) y expone `requirePermission` (rol ∩ scopes). |
| `src/security/tokens.js` | Genera tokens `mcp_…`, guarda solo el HMAC-SHA256 con `TOKEN_PEPPER`, valida vigencia/estado y revoca (individual o por usuario). |
| `src/security/users.js` | CRUD de `allowed_users`: alta, consulta, cambio de rol, activar/desactivar. Un usuario inactivo no puede autenticarse. |
| `src/security/oauth.js` | Authorization Code + PKCE (S256), `state` de un solo uso con caducidad, intercambio de código, consulta a *userinfo*, vinculación/creación en `oauth_users` y emisión del token MCP. |
| `src/audit.js` | Inserta eventos en `audit_log` (usuario, evento, resultado, detalle) y emite log estructurado. Nunca guarda tokens ni secretos. |
| `src/logger.js` | Logger JSON con niveles (`debug/info/warn/error`), salida a `stderr` y archivo opcional rotable. |
| `src/errors.js` | `AppError` con `code`, `message`, `details` y constructores (`E.validation`, `E.notFound`, `E.forbidden`, `E.db`…). |
| `bin/admin.js` | CLI de operaciones: `db-init`, `user-*`, `token-*`, `oauth-*`. Es la única "UI" de administración. |
| `sql/*.sql` | Esquema idempotente y datos de prueba. Base para migraciones incrementales (`003_*.sql`, …). |
| `test/*.test.js` | Pruebas con `node:test`: autenticación/tokens, CRUD y validaciones, OAuth con proveedor simulado y transporte stdio. |
| `examples/*` | Configuraciones listas para clientes MCP (el "frontend" consumidor). |

### Extensibilidad

Nueva herramienta = un objeto en [src/tools/definitions.js](src/tools/definitions.js) (`name`, `permission`, `inputShape`, `handler`);
el registro, la autenticación, la autorización, la validación y la auditoría se aplican automáticamente en [src/server.js](src/server.js).
Nueva tabla = nuevo script en `sql/` + repositorio en `src/records/`. Nuevos permisos: [src/config.js](src/config.js).

## Migración a Otras Bases de Datos en caso de ser necesario

El diseño está pensado para que el cambio de motor afecte a **pocas capas**. La lógica de negocio, autenticación, permisos,
OAuth y auditoría no dependen del dialecto; el acoplamiento está concentrado en:

1. `src/db.js` — driver y apertura de conexión.
2. `src/records/repository.js` — SQL de `test_records`.
3. `src/security/*.js` y `src/audit.js` — SQL de tablas de seguridad/auditoría.
4. `sql/001_schema.sql` y `sql/002_seed_records.sql` — DDL y datos.
5. `test/helpers.js` — base de datos en memoria/temporal.

### Pasos sugeridos

1. **Elija el motor y el driver.** PostgreSQL (`pg`), MySQL/MariaDB (`mysql2`) o SQL Server (`mssql`). Añada solo esa dependencia.
2. **Cree un adaptador de conexión.** Reemplace `openDb()` por una función que devuelva un objeto con la misma interfaz que usa
   el proyecto: `exec(sql)` y `prepare(sql)` → `{ run(...), get(...), all(...) }`. Mantenga `initDb()` leyendo los `.sql` del motor.
3. **Traduzca el esquema.** Duplique `sql/001_schema.sql` como `sql/001_schema.postgres.sql` (o el motor elegido) y ajuste tipos,
   defaults, autoincrementos e índices. Conserve nombres de tablas/columnas para no tocar el resto del código.
4. **Adapte el repositorio.**
   - Placeholders: `?` → `$1, $2…` en PostgreSQL; en MySQL se mantiene `?`.
   - Inserción: `lastInsertRowid` → `INSERT … RETURNING id` (PostgreSQL) o `insertId` (MySQL).
   - Filas afectadas: `changes` → `rowCount` / `affectedRows`.
   - Booleanos: `0/1` → `BOOLEAN` real; ajuste `toApi()` y las comparaciones.
   - Fechas: guarde `TIMESTAMPTZ`/`DATETIME` y compare con parámetros ISO, no con texto.
   - `LIKE`: en MySQL el escape por defecto es `\`; en PostgreSQL use `ILIKE` si desea búsqueda sin distinguir mayúsculas.
   - Concatenación: `first_name || ' ' || last_name` funciona en PostgreSQL/SQLite; en MySQL use `CONCAT(...)`.
5. **Ajuste conexión y concurrencia.** Elimine `PRAGMA` (WAL, `busy_timeout`, `foreign_keys`) y sustitúyalos por la configuración
   equivalente del motor (pool de conexiones, `statement_timeout`, transacciones, claves foráneas activas).
6. **Migre los datos existentes.** Exporte/importe respetando el orden `allowed_users → access_tokens → oauth_users → test_records →
   audit_log`. Los hashes de tokens siguen siendo válidos si conserva el mismo `TOKEN_PEPPER` y la columna `token_hash`; si no,
   reemita los tokens.
7. **Actualice los scripts y las pruebas.** `db:init` debe ejecutar el DDL del nuevo motor y el seed equivalente. En
   `test/helpers.js` sustituya `:memory:` por una base temporal o un esquema de prueba; ejecute `npm test` hasta que los 38 casos pasen.
8. **Valide la paridad funcional.** Cuente registros, pruebe paginación/orden/filtros, create/update/delete con confirmación,
   revocación inmediata de tokens, auditoría y modo stdio.

### Equivalencias rápidas

| SQLite | PostgreSQL | MySQL / MariaDB |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `GENERATED ALWAYS AS IDENTITY` / `SERIAL` | `INT AUTO_INCREMENT PRIMARY KEY` |
| `TEXT` | `TEXT` / `VARCHAR(n)` | `VARCHAR(n)` / `TEXT` |
| `REAL` | `DOUBLE PRECISION` / `NUMERIC(14,2)` | `DOUBLE` / `DECIMAL(14,2)` |
| `INTEGER` (0/1) para bool | `BOOLEAN` | `TINYINT(1)` / `BOOLEAN` |
| `strftime('%Y-%m-%dT%H:%M:%fZ','now')` | `now()` / `CURRENT_TIMESTAMP` | `CURRENT_TIMESTAMP(3)` / `UTC_TIMESTAMP(3)` |
| `?` | `$1` | `?` |
| `INSERT … ; SELECT last_insert_rowid()` | `INSERT … RETURNING id` | `INSERT …` + `insertId` |
| `PRAGMA journal_mode=WAL` | Configuración del servidor/pool | `InnoDB`, configuración del servidor |
| `COLLATE NOCASE` | `CITEXT` o índice `lower(col)` | Colación `..._ci` |

> La capa `src/records/repository.js` es el **único punto obligatorio** a portar para el CRUD; el resto son ajustes de driver,
> DDL y pruebas. Documente el dialecto elegido y mantenga los scripts por motor para no romper la instalación SQLite original.

## Solución de Problemas

| Síntoma | Causa / solución |
|---|---|
| Arranca y falla con "TOKEN_PEPPER es obligatorio" | Defina `TOKEN_PEPPER` (≥16 caracteres) en `.env` |
| 401 con un token recién emitido | `TOKEN_PEPPER` distinto al usado al emitirlo, token mal copiado, expirado/revocado (`token-list`) |
| 403 "usuario inactivo" | `user-enable <id>` |
| `FORBIDDEN: Permiso requerido` | El rol o los scopes del token no incluyen ese permiso; emita otro token |
| `no such table` al iniciar | Ejecute `npm run db:init` |
| `DATABASE_ERROR` en herramientas | Revise el log (`tool.unexpected_error`): BD bloqueada, sin permisos de escritura o esquema alterado |
| stdio: el cliente no conecta | El proceso termina si `MCP_TOKEN` es inválido; vea stderr del cliente. No imprima nada en stdout |
| OAuth: "state inválido o expirado" | El flujo tardó >10 min, se reutilizó el enlace o el servidor se reinició entre login y callback |
| OAuth 403 | Email del proveedor no está en `allowed_users` o identidad desautorizada (`oauth-list`) |
| "Node: No such built-in module node:sqlite" | Actualice a Node ≥ 22.5 |
| `EADDRINUSE` al iniciar | Otro proceso usa el puerto: `HTTP_PORT=3001 npm start` o libere el puerto (`ss -ltnp \| grep 3000`) |
| `EACCES` al abrir la BD | La carpeta de `DB_PATH` no es escribible por el usuario del proceso (`chown`/permisos) |
| `database is locked` | Otra conexión retiene la BD; el proyecto ya usa WAL y `busy_timeout=5000`. Evite escribir con `sqlite3` mientras corre el servidor |
| `405 METHOD_NOT_ALLOWED` en `/mcp` | El transporte es *stateless*: solo `POST`. Use `GET /health` para comprobaciones |
| `VALIDATION_ERROR: Cuerpo demasiado grande` | El cuerpo supera 1 MB; pagine o reduzca el lote |
| El cliente no ve herramientas | Verifique `POST /mcp` con `curl` y el mismo token; revise que el cliente apunte a `/mcp` y envíe `Accept: application/json, text/event-stream` |
| `npm test` falla solo en algunos entornos | Las pruebas usan `--test-concurrency=1`; cierre procesos que compartan una BD en archivo y ejecute `npm run db:init` |
| Cambié el código y no veo el efecto | Reinicie el servidor (`npm start`); no hay recarga automática |
| `.env` no se aplica | Los scripts usan `--env-file-if-exists=.env`; ejecute desde la raíz del proyecto o exporte las variables |

Diagnóstico rápido:

```bash
node --version                                  # ≥ 22.5
npm run admin -- user-list                      # usuarios registrados
npm run admin -- token-list                     # estado de tokens (activo/revocado, expiración)
sqlite3 data/mcp.db "select ts,event,user_id,outcome from audit_log order by id desc limit 20;"
tail -n 50 logs/server.log                      # si LOG_FILE está configurado
```

## Notas Adicionales

- **Datos ficticios:** los 30 registros de `test_records` se generan con una semilla fija y usan el dominio reservado
  `example.com`; ninguna persona real está representada.
- **Sin frontend web:** la administración se hace con el CLI `bin/admin.js` y el consumo con clientes MCP (ver
  [examples/](examples/)). No hay panel ni API REST adicional.
- **Licencia:** [GPL-3.0](LICENSE).
- **Alcance:** CRUD de `test_records`, tokens propios, OAuth, roles/scopes, auditoría, scripts SQL y pruebas. Un servidor de
  autorización OAuth propio y una UI de administración quedan **fuera de alcance**.
- **Producción:** use TLS detrás de un proxy inverso, `TOKEN_PEPPER` en un gestor de secretos, `HTTP_HOST=127.0.0.1`, respaldos
  programados y rotación de logs. Nunca publique el servidor sin TLS ni comparta tokens.
- **Respaldos:** `sqlite3 data/mcp.db ".backup 'backup/mcp-$(date +%F).db'"` es consistente incluso con el servidor en marcha.
- **Auditoría:** los eventos se guardan en `audit_log`; defina una política de retención y purgue periódicamente.
- **Actualizaciones:** `git pull && npm ci && npm test`, reinicie. Los cambios de columnas requieren un script nuevo
  (`sql/003_*.sql`); `001_schema.sql` solo cubre tablas nuevas.
- **Principio de mínimo privilegio:** emita tokens con `--scopes records:read` para agentes de consulta y reserve `admin`
  para operaciones destructivas.

### Documentación

| Documento | Contenido |
|---|---|
| [docs/01-arquitectura.md](docs/01-arquitectura.md) | Descripción, alcance, arquitectura, diagramas, estructura de directorios, flujos |
| [docs/02-instalacion.md](docs/02-instalacion.md) | Requisitos, instalación, BD, scripts SQL, verificación |
| [docs/03-configuracion.md](docs/03-configuracion.md) | Variables de entorno, tokens, OAuth, permisos, credenciales |
| [docs/04-seguridad.md](docs/04-seguridad.md) | Autenticación vs. autorización, flujo OAuth, modelo de amenazas |
| [docs/05-integracion-agentes.md](docs/05-integracion-agentes.md) | Claude Desktop, OpenCode, Claude Code, VS Code y otros |
| [docs/06-herramientas.md](docs/06-herramientas.md) | Referencia de cada herramienta (parámetros, ejemplos, errores) |
| [docs/07-manual-de-uso.md](docs/07-manual-de-uso.md) | Ejemplos prácticos con agentes |
| [docs/08-mantenimiento.md](docs/08-mantenimiento.md) | Operación, respaldos, logs, solución de problemas |
| [docs/09-pruebas.md](docs/09-pruebas.md) | Qué cubren las pruebas y cómo extenderlas |

Configuraciones de ejemplo para agentes: [examples/](examples/). Scripts SQL: [sql/](sql/).
