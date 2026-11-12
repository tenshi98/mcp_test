// Definición declarativa de las herramientas MCP. Para agregar una herramienta nueva basta con
// añadir un objeto aquí (o en otro módulo y registrarlo en tools/index.js).
import { z } from 'zod';
import { E } from '../errors.js';
import { id, writable, fieldsParam, listShape, filterShape } from '../records/schemas.js';

const opt = (s) => s.optional();
const optionalWritable = Object.fromEntries(Object.entries(writable).map(([k, v]) => [k, opt(v)]));
const withDefaults = ({ fields, sort_by, sort_order, page, page_size }) => ({ fields, sort_by, sort_order, page, page_size });

export const toolDefinitions = ({ records }) => [
  {
    name: 'list_records',
    title: 'Listar registros',
    description: 'Lista registros de test_records con paginación, ordenamiento y selección de campos. Devuelve {records, pagination}.',
    permission: 'records:read',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    inputShape: listShape,
    handler: (args) => records.query(withDefaults(args)),
  },
  {
    name: 'get_record',
    title: 'Obtener registro por ID',
    description: 'Obtiene un registro por su identificador. Error NOT_FOUND si no existe.',
    permission: 'records:read',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    inputShape: { id, fields: opt(fieldsParam) },
    handler: ({ id: rid, fields }) => {
      const record = records.get(rid, fields);
      if (!record) throw E.notFound(`El registro ${rid} no existe`);
      return { record };
    },
  },
  {
    name: 'search_records',
    title: 'Buscar registros con filtros',
    description: 'Busca por texto (nombre, email, descripción...) y filtra por categoría, estado, fechas (creación, modificación, nacimiento), rangos numéricos o campos nulos. Admite paginación, orden y selección de campos.',
    permission: 'records:read',
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    inputShape: { ...filterShape, ...listShape },
    handler: (args) => {
      for (const [lo, hi] of [['created_from', 'created_to'], ['updated_from', 'updated_to'], ['birth_from', 'birth_to'], ['quantity_min', 'quantity_max'], ['amount_min', 'amount_max']])
        if (args[lo] !== undefined && args[hi] !== undefined && args[lo] > args[hi]) throw E.validation(`${lo} no puede ser mayor que ${hi}`);
      return records.query(args);
    },
  },
  {
    name: 'create_record',
    title: 'Crear registro',
    description: 'Crea un registro. Obligatorios: first_name, last_name, email. El id y created_at/updated_at se generan automáticamente. Devuelve el registro creado.',
    permission: 'records:create',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    inputShape: { ...optionalWritable, first_name: writable.first_name, last_name: writable.last_name, email: writable.email },
    handler: (args) => ({ record: records.create(args) }),
  },
  {
    name: 'update_record',
    title: 'Actualizar registro',
    description: 'Actualiza parcialmente un registro por id (solo los campos enviados; null borra campos opcionales). Actualiza updated_at. Error NOT_FOUND si no existe.',
    permission: 'records:update',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputShape: { id, ...optionalWritable },
    handler: ({ id: rid, ...changes }) => {
      const record = records.update(rid, changes);
      if (!record) throw E.notFound(`El registro ${rid} no existe`);
      return { updated: true, record };
    },
  },
  {
    name: 'delete_record',
    title: 'Eliminar registro',
    description: 'Elimina un registro por id. Protección anti-accidentes: sin confirm=true NO elimina y devuelve el registro para que el usuario confirme; repita la llamada con confirm=true solo tras su aprobación explícita.',
    permission: 'records:delete',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputShape: { id, confirm: z.boolean().default(false).describe('Debe ser true para ejecutar la eliminación') },
    handler: ({ id: rid, confirm }) => {
      const record = records.get(rid);
      if (!record) throw E.notFound(`El registro ${rid} no existe`);
      if (confirm !== true)
        return { deleted: false, confirmation_required: true, record, message: `Se eliminará el registro ${rid}. Vuelva a llamar con confirm=true tras la aprobación del usuario.` };
      records.delete(rid);
      return { deleted: true, id: rid, record };
    },
  },
];
