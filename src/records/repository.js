// Acceso a datos de test_records. TODAS las consultas usan sentencias preparadas con parámetros;
// los nombres de columna provienen exclusivamente de listas blancas (nunca de la entrada).
import { E, AppError } from '../errors.js';
import { FIELDS, writable } from './schemas.js';
import { z } from 'zod';

const WRITABLE = Object.keys(writable);
const toApi = (row) => row && { ...row, ...('is_active' in row ? { is_active: !!row.is_active } : {}) };
const colList = (fields) => (fields?.length ? [...new Set(fields)] : FIELDS).filter(f => FIELDS.includes(f)).join(', ');
const escLike = (s) => s.replace(/[\\%_]/g, c => '\\' + c);
const fromBound = (s) => (s.length === 10 ? `${s}T00:00:00.000Z` : new Date(s).toISOString());
const toBound = (s) => (s.length === 10 ? `${s}T23:59:59.999Z` : new Date(s).toISOString());

const wrapDb = (fn) => { try { return fn(); } catch (e) { if (e instanceof AppError) throw e; throw Object.assign(E.db(), { cause: e }); } };

export function createRecordRepository(db) {
  const cache = new Map();
  const prep = (sql) => { let s = cache.get(sql); if (!s) cache.set(sql, (s = db.prepare(sql))); return s; };

  function buildWhere(f = {}) {
    const where = [], params = [];
    if (f.query) {
      for (const term of f.query.split(/\s+/).filter(Boolean)) {
        where.push('(' + ['first_name', 'last_name', 'email', 'short_text', 'description', 'notes', "first_name || ' ' || last_name"]
          .map(c => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')');
        params.push(...Array(7).fill(`%${escLike(term)}%`));
      }
    }
    if (f.category !== undefined) { where.push('category = ?'); params.push(f.category); }
    if (f.is_active !== undefined) { where.push('is_active = ?'); params.push(f.is_active ? 1 : 0); }
    const range = (col, lo, hi, loFn = x => x, hiFn = x => x) => {
      if (lo !== undefined) { where.push(`${col} >= ?`); params.push(loFn(lo)); }
      if (hi !== undefined) { where.push(`${col} <= ?`); params.push(hiFn(hi)); }
    };
    range('created_at', f.created_from, f.created_to, fromBound, toBound);
    range('updated_at', f.updated_from, f.updated_to, fromBound, toBound);
    range('birth_date', f.birth_from, f.birth_to);
    range('quantity', f.quantity_min, f.quantity_max);
    range('amount', f.amount_min, f.amount_max);
    if (f.has_null) where.push(`${f.has_null} IS NULL`);   // f.has_null validado como enum
    return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
  }

  return {
    query({ fields, sort_by = 'id', sort_order = 'asc', page = 1, page_size = 20, ...filters } = {}) {
      if (!FIELDS.includes(sort_by)) throw E.validation('sort_by inválido');
      const dir = sort_order === 'desc' ? 'DESC' : 'ASC';
      const { sql, params } = buildWhere(filters);
      return wrapDb(() => {
        const total = prep(`SELECT COUNT(*) AS n FROM test_records ${sql}`).get(...params).n;
        const rows = prep(`SELECT ${colList(fields)} FROM test_records ${sql} ORDER BY ${sort_by} ${dir}, id ASC LIMIT ? OFFSET ?`)
          .all(...params, page_size, (page - 1) * page_size).map(toApi);
        const total_pages = Math.ceil(total / page_size);
        return { records: rows, pagination: { page, page_size, total, total_pages, has_more: page < total_pages } };
      });
    },
    get(id, fields) {
      return wrapDb(() => toApi(prep(`SELECT ${colList(fields)} FROM test_records WHERE id = ?`).get(id)));
    },
    create(input) {
      const data = z.strictObject({ ...writable, birth_date: writable.birth_date.optional(), short_text: writable.short_text.optional(),
        description: writable.description.optional(), amount: writable.amount.optional(), notes: writable.notes.optional(),
        quantity: writable.quantity.optional(), is_active: writable.is_active.optional(), category: writable.category.optional() }).parse(input);
      const cols = Object.keys(data);
      return wrapDb(() => {
        const vals = cols.map(c => (typeof data[c] === 'boolean' ? +data[c] : data[c]));
        const r = cols.length
          ? prep(`INSERT INTO test_records (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals)
          : null;
        return toApi(prep('SELECT * FROM test_records WHERE id = ?').get(Number(r.lastInsertRowid)));
      });
    },
    update(id, changes) {
      const keys = Object.keys(changes).filter(k => changes[k] !== undefined);
      if (!keys.length) throw E.validation('Debe indicar al menos un campo a actualizar');
      for (const k of keys) if (!WRITABLE.includes(k)) throw E.validation(`Campo no editable: ${k}`);
      return wrapDb(() => {
        const sets = keys.map(k => `${k} = ?`).join(', ');
        const vals = keys.map(k => (typeof changes[k] === 'boolean' ? +changes[k] : changes[k]));
        const r = prep(`UPDATE test_records SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).run(...vals, id);
        if (!r.changes) return null;
        return toApi(prep('SELECT * FROM test_records WHERE id = ?').get(id));
      });
    },
    delete(id) {
      return wrapDb(() => prep('DELETE FROM test_records WHERE id = ?').run(id).changes > 0);
    },
  };
}
