# 7. Manual de uso

Ejemplos de lo que usted le pide al agente y la herramienta que éste invoca (con un token `admin` salvo que se indique).

| Petición al agente | Herramienta y argumentos | Resultado |
|---|---|---|
| "Muéstrame todos los registros" | `list_records {page_size:100}` (o 20 por página) | Lista + `pagination.total = 30` |
| "Busca a Camila Rojas" | `search_records {query:"Camila Rojas"}` | Registros que contienen ambas palabras |
| "Registros creados entre marzo y junio de 2026" | `search_records {created_from:"2026-03-01", created_to:"2026-06-30"}` | Registros en el rango |
| "Crea a Ana Prueba, ana@example.com, categoría ventas" | `create_record {first_name,last_name,email,category}` | `{record:{id:31,…}}` |
| "Cambia la descripción del 31" | `update_record {id:31, description:"…"}` | `{updated:true, record}` con otros campos intactos |
| "Marca el 31 como inactivo y cambia su cantidad a 10" | `update_record {id:31, is_active:false, quantity:10}` | Varios campos a la vez |
| "Elimina el registro 31" | 1) `delete_record {id:31}` → pide confirmación; 2) tras su "sí": `delete_record {id:31, confirm:true}` | `{deleted:true}` |
| "Dame el registro 9999" | `get_record {id:9999}` | `NOT_FOUND`: el agente informa que no existe |
| Usuario `reader` pide eliminar | `delete_record …` | `FORBIDDEN: Permiso requerido: records:delete` |

Consejos: pida solo los campos necesarios ("solo nombre y email") para respuestas más cortas; para conjuntos grandes pida por páginas;
las fechas se interpretan en UTC.

## Operaciones sin permisos
Un agente con token `reader` o con scope `records:read` puede listar/buscar pero create/update/delete devuelven `FORBIDDEN` y quedan
registradas como `authz.denied` en `audit_log`. Un token revocado o expirado hace que el cliente reciba 401.

## Uso directo sin agente (curl)
Ver el ejemplo del [README](../README.md). Cada petición es JSON-RPC `tools/call`; cabeceras `Authorization`, `Content-Type: application/json`,
`Accept: application/json, text/event-stream`.
