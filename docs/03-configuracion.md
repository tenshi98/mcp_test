# 3. Configuración

Toda la configuración es por variables de entorno (`.env`, cargado con `--env-file-if-exists`). Referencia: [.env.example](../.env.example).

## Variables
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

## Autenticación y tokens
- Formato: `mcp_` + 32 bytes aleatorios en base64url. En BD: HMAC-SHA256 con `TOKEN_PEPPER`; `token_prefix` (8 chars) solo identifica.
- Vigencia: `expires_at`; revocación: `status='revoked'` (inmediata, se comprueba en cada llamada).
- Scopes opcionales por token (`--scopes records:read`): el permiso efectivo es la **intersección** con el rol. Útil para agentes de solo lectura.

## Permisos (autorización)
Permisos disponibles: `records:read`, `records:create`, `records:update`, `records:delete`.

| Rol | Por defecto | list/get/search | create | update | delete |
|---|---|---|---|---|---|
| `reader` | read | ✅ | ❌ | ❌ | ❌ |
| `editor` | read, create, update | ✅ | ✅ | ✅ | ❌ |
| `admin` | todos | ✅ | ✅ | ✅ | ✅ |

Cambie el mapeo con `ROLE_*`; un permiso desconocido impide arrancar. Cada herramienta declara el permiso que exige en `src/tools/definitions.js`.

## OAuth (opcional)
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

## Gestión de credenciales
- `.env` está en `.gitignore`; no lo versione. En producción use el gestor de secretos de la plataforma.
- Nunca ponga tokens en URLs ni en repositorios; los clientes los envían en el encabezado `Authorization`.
- Rote tokens emitiendo uno nuevo y revocando el anterior; rote `TOKEN_PEPPER` solo si sospecha compromiso (invalida todos los tokens).

## Configuración de agentes
Ver [05-integracion-agentes.md](05-integracion-agentes.md).
