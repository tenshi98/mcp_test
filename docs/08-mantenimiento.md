# 8. Mantenimiento y solución de problemas

## Comandos de administración (`npm run admin -- …`)
```
user-add --name N --email E [--role reader|editor|admin]   user-list   user-enable <id>   user-disable <id>   user-role <id> --role R
token-issue <userId> [--label L] [--days N] [--scopes a,b]  token-list [--user ID]   token-revoke <tokenId> [--reason R]   token-revoke-user <userId>
oauth-list   oauth-authorize <id>   oauth-deauthorize <id>   oauth-link <oauthId> --user <userId>
```
- **Gestión de usuarios:** `user-disable` desactiva y revoca todos sus tokens. Para rehabilitar: `user-enable` y emitir token nuevo.
- **Revocación:** `token-revoke <id>` (id visible en `token-list`); efecto inmediato.
- **Usuarios OAuth:** `oauth-list`; `oauth-deauthorize <id>` bloquea esa identidad; `oauth-link` la asocia a un usuario permitido.

## Actualizaciones
- Servidor: `git pull && npm ci && npm test` y reinicie. `001_schema.sql` es idempotente para tablas nuevas; cambios de columnas en tablas existentes requieren un script `ALTER` nuevo (cree `sql/003_*.sql`).
- Dependencias: `npm outdated`, `npm update`, `npm audit`, luego `npm test`. Pruebe el SDK MCP con cuidado al subir de versión mayor.

## Respaldos
```bash
sqlite3 data/mcp.db ".backup 'backup/mcp-$(date +%F).db'"     # consistente, con el servidor en marcha
```
Respalde también `.env` (en un gestor de secretos). Restaurar = detener el servidor y reemplazar `DB_PATH`. Programe el respaldo con cron.

## Logs
Líneas JSON en stderr y en `LOG_FILE`; auditoría persistente en `audit_log`. Rote con `logrotate`. Consultas útiles:
```sql
SELECT ts,event,user_id,outcome FROM audit_log WHERE outcome <> 'ok' ORDER BY id DESC LIMIT 50;
SELECT event,COUNT(*) FROM audit_log GROUP BY event;
```
Los logs nunca contienen tokens, secretos ni cuerpos de peticiones. Purgue `audit_log` según su política de retención.

## Problemas frecuentes
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
