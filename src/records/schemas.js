// Esquemas de validación (zod) y metadatos de columnas de test_records.
import { z } from 'zod';

export const FIELDS = ['id', 'first_name', 'last_name', 'email', 'birth_date', 'short_text', 'description',
  'quantity', 'amount', 'is_active', 'category', 'notes', 'created_at', 'updated_at'];
export const SORTABLE = FIELDS;

const isRealDate = (s) => {
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato requerido YYYY-MM-DD').refine(isRealDate, 'Fecha inexistente');
export const dateOrDateTime = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/, 'Formato requerido YYYY-MM-DD o ISO 8601')
  .refine(s => isRealDate(s.slice(0, 10)) && !Number.isNaN(new Date(s.length === 10 ? s + 'T00:00:00Z' : s).getTime()), 'Fecha inexistente');

export const id = z.number().int().positive().describe('Identificador numérico del registro');
const text = (max) => z.string().max(max);

// Campos editables (compartidos por create y update).
export const writable = {
  first_name: text(100).trim().min(1).describe('Nombre'),
  last_name: text(100).trim().min(1).describe('Apellido'),
  email: text(254).trim().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido').describe('Correo electrónico'),
  birth_date: dateStr.nullable().describe('Fecha de nacimiento YYYY-MM-DD'),
  short_text: text(255).nullable().describe('Texto corto'),
  description: text(20000).nullable().describe('Descripción extensa'),
  quantity: z.number().int().min(-2147483648).max(2147483647).describe('Entero'),
  amount: z.number().finite().min(-1e12).max(1e12).nullable().describe('Decimal'),
  is_active: z.boolean().describe('Estado activo'),
  category: text(50).trim().min(1).describe('Categoría'),
  notes: text(5000).nullable().describe('Observaciones'),
};

export const fieldsParam = z.array(z.enum(FIELDS)).min(1).max(FIELDS.length)
  .describe('Campos a devolver (por defecto todos)');

export const listShape = {
  fields: fieldsParam.optional(),
  sort_by: z.enum(SORTABLE).default('id').describe('Campo de ordenamiento'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
  page: z.number().int().min(1).max(1_000_000).default(1).describe('Página (desde 1)'),
  page_size: z.number().int().min(1).max(100).default(20).describe('Registros por página (máx 100)'),
};

export const filterShape = {
  query: z.string().trim().min(1).max(200).optional().describe('Texto a buscar en nombre, apellido, email, textos, descripción y observaciones (todas las palabras deben aparecer)'),
  category: z.string().max(50).optional().describe('Categoría exacta'),
  is_active: z.boolean().optional().describe('Filtrar por estado'),
  created_from: dateOrDateTime.optional(), created_to: dateOrDateTime.optional(),
  updated_from: dateOrDateTime.optional(), updated_to: dateOrDateTime.optional(),
  birth_from: dateStr.optional(), birth_to: dateStr.optional(),
  quantity_min: z.number().int().optional(), quantity_max: z.number().int().optional(),
  amount_min: z.number().finite().optional(), amount_max: z.number().finite().optional(),
  has_null: z.enum(FIELDS.filter(f => ['birth_date', 'short_text', 'description', 'amount', 'notes'].includes(f))).optional()
    .describe('Solo registros donde este campo opcional es NULL'),
};
