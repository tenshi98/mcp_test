# 9. Pruebas

`npm test` (38 pruebas, `node:test`, BD SQLite en memoria, servidor HTTP real en puerto efímero, cliente MCP oficial):

| Archivo | Cubre |
|---|---|
| `test/auth.test.js` | conexión MCP, 401 sin token/falso/malformado/expirado/revocado, 403 inactivo, desactivación en caliente, hash en BD, scopes, logs sin secretos, metadatos OAuth |
| `test/oauth.test.js` | flujo code+PKCE completo contra un proveedor simulado, vinculación, anti-replay de `state`, identidad no preautorizada/desautorizada, access token del proveedor como Bearer, secretos fuera de logs |
| `test/crud.test.js` | list/get/search, paginación, orden, campos, filtros (texto, fecha, numéricos, estado, nulos), create/update/delete, confirmación de borrado, validaciones, inexistentes, permisos por rol, inyección SQL, mass-assignment, error de BD |
| `test/stdio.test.js` | transporte stdio autenticado, permisos, rechazo de token inválido |

Para agregar una herramienta: añada su definición y un caso en `crud.test.js` usando `call(client, 'nombre', args)`.
