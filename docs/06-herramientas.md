# 6. Referencia de herramientas

Todas devuelven `structuredContent` (y el mismo JSON en `content[0].text`). Errores de dominio: `isError: true` y
`{"error":{"code","message","details?"}}`. Parámetros que no cumplen el esquema JSON son rechazados por el protocolo (error `-32602` o `isError`, según el SDK).
Los esquemas completos de entrada se publican en `tools/list`.

**Códigos de error:** `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHENTICATED`, `FORBIDDEN`, `DATABASE_ERROR`.
**Campos del registro:** `id, first_name, last_name, email, birth_date (YYYY-MM-DD), short_text, description, quantity (int), amount (decimal), is_active (bool), category, notes, created_at, updated_at` (opcionales: birth_date, short_text, description, amount, notes).

## Parámetros comunes de listado (list_records, search_records)
`fields[]` (por defecto todos) · `sort_by` (cualquier campo, def. `id`) · `sort_order` `asc|desc` · `page` ≥1 (def. 1) · `page_size` 1–100 (def. 20).
Respuesta: `{"records":[…],"pagination":{"page","page_size","total","total_pages","has_more"}}`.

## list_records — permiso `records:read`
Lista todos los registros con paginación/orden/campos.
```json
{"name":"list_records","arguments":{"fields":["id","first_name","last_name"],"sort_by":"last_name","page":2,"page_size":5}}
```
## get_record — `records:read`
Parámetros: `id` (int, obligatorio), `fields[]`. Respuesta `{"record":{…}}`. Error `NOT_FOUND` si no existe.
```json
{"name":"get_record","arguments":{"id":7}}   →   {"record":{"id":7,"first_name":"…", …}}
{"name":"get_record","arguments":{"id":9999}} →  {"error":{"code":"NOT_FOUND","message":"El registro 9999 no existe"}}
```
## search_records — `records:read`
Filtros (todos opcionales, se combinan con AND): `query` (todas las palabras, en nombre/apellido/email/short_text/description/notes) ·
`category` · `is_active` · `created_from/to`, `updated_from/to` (`YYYY-MM-DD` o ISO 8601; un `to` de solo fecha incluye todo el día, UTC) ·
`birth_from/to` (`YYYY-MM-DD`) · `quantity_min/max` (int) · `amount_min/max` · `has_null` (`birth_date|short_text|description|amount|notes`).
Error `VALIDATION_ERROR` si un `*_from` > su `*_to`.
```json
{"name":"search_records","arguments":{"query":"Flores","is_active":true,"quantity_min":100,"sort_by":"amount","sort_order":"desc"}}
{"name":"search_records","arguments":{"created_from":"2026-03-01","created_to":"2026-06-30"}}
```
## create_record — `records:create`
Obligatorios: `first_name`, `last_name`, `email`. Opcionales: `birth_date, short_text, description, quantity (def. 0), amount, is_active (def. true), category (def. "general"), notes`.
`id`, `created_at`, `updated_at` se generan. Respuesta `{"record":{…}}`.
```json
{"name":"create_record","arguments":{"first_name":"Ana","last_name":"Prueba","email":"ana@example.com","quantity":5,"amount":12.5}}
```
Errores: `VALIDATION_ERROR` (email inválido, fecha inexistente, tipo incorrecto, longitud).
## update_record — `records:update`
`id` + uno o más campos editables; los no enviados se conservan; `null` borra un campo opcional. `updated_at` se actualiza solo.
Respuesta `{"updated":true,"record":{…}}`. Errores: `NOT_FOUND`, `VALIDATION_ERROR` (sin campos, valor inválido). `id`, `created_at`, `updated_at` no son editables.
```json
{"name":"update_record","arguments":{"id":3,"description":"Nueva descripción","quantity":42}}
```
## delete_record — `records:delete`
`id` y `confirm` (bool, def. false). **Sin `confirm:true` no elimina:**
```json
{"name":"delete_record","arguments":{"id":3}} → {"deleted":false,"confirmation_required":true,"record":{…},"message":"Se eliminará el registro 3. …"}
{"name":"delete_record","arguments":{"id":3,"confirm":true}} → {"deleted":true,"id":3,"record":{…}}
```
Errores: `NOT_FOUND`, `FORBIDDEN` (sin permiso). La eliminación es física y queda en `audit_log`.

## Errores transversales
```json
{"error":{"code":"FORBIDDEN","message":"Permiso requerido: records:delete"}}
{"error":{"code":"DATABASE_ERROR","message":"Error interno de base de datos"}}
```
Sin token, o token inválido/expirado/revocado, se responde HTTP 401 antes de llegar a la herramienta.

## Consideraciones de seguridad
Lectura: no expone `access_tokens` ni `allowed_users` (solo `test_records`). Escritura: validación estricta, sin asignación masiva.
Eliminación: confirmación explícita + permiso aparte. Todas las acciones quedan auditadas con el usuario.
