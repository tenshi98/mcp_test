# 4. Seguridad: autenticación vs. autorización

| | **Autenticación** | **Autorización** |
|---|---|---|
| Pregunta | ¿Quién eres y es válida tu credencial? | ¿Qué tienes permitido hacer? |
| Mecanismo aquí | Token `mcp_…` (hash, vigencia, revocación) u OAuth (access token validado en el proveedor) | Usuario activo en `allowed_users` + permisos del rol ∩ scopes del token, exigidos por herramienta |
| Fallo | `401 Unauthorized` (sin/falso/expirado/revocado) | `403` (usuario inactivo) o error de herramienta `FORBIDDEN` |
| Código | `security/auth.js#authenticate`, `tokens.js`, `oauth.js` | `security/auth.js#requirePermission`, `config.js` (roles) |

## Controles implementados
- Solicitudes sin autenticación válida rechazadas antes de procesar MCP; usuarios inactivos rechazados.
- Reautenticación en **cada** llamada: revocar un token o desactivar un usuario tiene efecto inmediato.
- Tokens: 256 bits de entropía, solo se guarda su HMAC; el token se muestra una vez.
- Permisos por herramienta; `delete_record` exige además `confirm=true` (protección anti-accidentes, independiente del cliente).
- Validación estricta (zod) de tipos, formatos de fecha, rangos y longitudes; campos desconocidos descartados.
- SQL siempre parametrizado; nombres de columnas/orden solo desde listas blancas; comodines `LIKE` escapados.
- Errores de BD no filtran detalles (`DATABASE_ERROR` genérico; detalle solo en el log del servidor).
- Logs JSON con redacción de claves sensibles y patrones `mcp_…`/`Bearer …`; auditoría en tabla `audit_log`.
- Cuerpo HTTP limitado a 1 MB; servidor *stateless*; escucha en loopback por defecto.

## Flujo OAuth y vinculación de identidades
```
Cliente/Usuario        Servidor MCP                       Proveedor OAuth
   │ GET /oauth/login ───►│ genera state + PKCE verifier        │
   │ ◄── 302 authorize ───│ (code_challenge S256)               │
   │ ──────────────── login y consentimiento ──────────────────►│
   │ ◄── 302 /oauth/callback?code&state ────────────────────────│
   │ GET callback ───────►│ valida state (un solo uso, 10 min)  │
   │                      │ POST /token (code + code_verifier) ►│
   │                      │ GET /userinfo (access_token) ──────►│
   │                      │ vincula/actualiza oauth_users:
   │                      │   • email coincide con allowed_users → allowed_user_id
   │                      │   • sin coincidencia y REQUIRE_PREAUTHORIZED → 403
   │                      │   • is_authorized=0 o usuario inactivo → 403
   │ ◄── {access_token: mcp_…, expires_at} (una sola vez)
```
Además, un cliente puede enviar directamente como Bearer el access token del proveedor; el servidor lo valida con *userinfo*
(caché de 60 s) y lo mapea al mismo usuario permitido. Consecuencia: una desautorización puede tardar hasta 60 s en este camino.

## Limitaciones conocidas
- No se implementa un servidor de autorización propio (DCR, `/authorize` propio); el servidor es *resource server* + cliente OAuth.
- Sin límite de tasa (rate limiting): agréguelo en el proxy inverso.
- Búsqueda de texto insensible a mayúsculas solo para ASCII (limitación de `LIKE` en SQLite): "joaquin" no encuentra "Joaquín".
- SQLite sin cifrado en reposo: proteja el archivo con permisos del sistema de archivos.
