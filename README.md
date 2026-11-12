# Servidor MCP – Gestión de datos (CRUD) con acceso controlado

Servidor [Model Context Protocol](https://modelcontextprotocol.io) que expone operaciones CRUD sobre una tabla de prueba
(`test_records`, 30 registros ficticios) con **autenticación por tokens**, **OAuth 2.0 (Authorization Code + PKCE)**,
**autorización por rol/scope**, consultas preparadas y auditoría.

- Node.js ≥ 22.5 (probado en 24) · SDK oficial `@modelcontextprotocol/sdk` · SQLite (`node:sqlite`, sin compilación nativa)
- Transportes: **Streamable HTTP** (`/mcp`) y **stdio**
- 6 herramientas: `list_records`, `get_record`, `search_records`, `create_record`, `update_record`, `delete_record`

## Inicio rápido (5 minutos)

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

## Documentación

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

## Extensibilidad

Nueva herramienta = un objeto en [src/tools/definitions.js](src/tools/definitions.js) (`name`, `permission`, `inputShape`, `handler`);
el registro, la autenticación, la autorización, la validación y la auditoría se aplican automáticamente en [src/server.js](src/server.js).
Nueva tabla = nuevo script en `sql/` + repositorio en `src/records/`. Nuevos permisos: [src/config.js](src/config.js).
