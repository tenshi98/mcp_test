import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, connect, call } from './helpers.js';

let t, admin, editor, reader;
before(async () => {
  t = await startTestApp();
  const tok = (name, role) => t.app.tokens.issue(t.mk(name, role).id).token;
  admin = await connect(t.url, tok('admin', 'admin'));
  editor = await connect(t.url, tok('editor', 'editor'));
  reader = await connect(t.url, tok('reader', 'reader'));
});
after(async () => { await Promise.all([admin, editor, reader].map(c => c.close())); await t.close(); });

// ---------- READ ----------
test('list_records: paginación y total', async () => {
  const r = await call(admin, 'list_records', { page: 1, page_size: 10 });
  assert.equal(r.data.records.length, 10);
  assert.deepEqual(r.data.pagination, { page: 1, page_size: 10, total: 30, total_pages: 3, has_more: true });
  const last = await call(admin, 'list_records', { page: 3, page_size: 10 });
  assert.equal(last.data.pagination.has_more, false);
  const beyond = await call(admin, 'list_records', { page: 9 });
  assert.equal(beyond.data.records.length, 0);
});

test('list_records: orden y selección de campos', async () => {
  const r = await call(admin, 'list_records', { fields: ['id', 'last_name'], sort_by: 'last_name', sort_order: 'desc', page_size: 100 });
  assert.deepEqual(Object.keys(r.data.records[0]), ['id', 'last_name']);
  const names = r.data.records.map(x => x.last_name);
  assert.ok(names.every((n, i) => i === 0 || names[i - 1] >= n), 'orden descendente');
});

test('get_record: existente e inexistente', async () => {
  const ok = await call(admin, 'get_record', { id: 1 });
  assert.equal(ok.data.record.id, 1);
  assert.equal(typeof ok.data.record.is_active, 'boolean');
  const no = await call(admin, 'get_record', { id: 99999 });
  assert.equal(no.isError, true);
  assert.equal(no.data.error.code, 'NOT_FOUND');
});

test('search_records: texto, categoría, estado, rangos y nulos', async () => {
  const all = (await call(admin, 'list_records', { page_size: 100 })).data.records;
  const first = all[0];
  const byName = await call(admin, 'search_records', { query: first.last_name });
  assert.ok(byName.data.records.some(x => x.id === first.id));
  const multi = await call(admin, 'search_records', { query: `${first.first_name} ${first.last_name}` });
  assert.ok(multi.data.records.some(x => x.id === first.id));

  const act = await call(admin, 'search_records', { is_active: false, page_size: 100 });
  assert.equal(act.data.records.length, all.filter(x => !x.is_active).length);

  const q = await call(admin, 'search_records', { quantity_min: 100, quantity_max: 300, page_size: 100 });
  assert.equal(q.data.records.length, all.filter(x => x.quantity >= 100 && x.quantity <= 300).length);

  const cat = await call(admin, 'search_records', { category: 'ventas', page_size: 100 });
  assert.equal(cat.data.records.length, all.filter(x => x.category === 'ventas').length);

  const nul = await call(admin, 'search_records', { has_null: 'notes', page_size: 100 });
  assert.equal(nul.data.records.length, all.filter(x => x.notes === null).length);
  assert.ok(nul.data.records.length > 0);
});

test('search_records: fechas (solo fecha es inclusiva en el límite superior)', async () => {
  const all = (await call(admin, 'list_records', { page_size: 100 })).data.records;
  const from = '2026-03-01', to = '2026-06-30';
  const r = await call(admin, 'search_records', { created_from: from, created_to: to, page_size: 100 });
  const exp = all.filter(x => x.created_at >= from && x.created_at <= to + 'T23:59:59.999Z');
  assert.equal(r.data.records.length, exp.length);
  const b = await call(admin, 'search_records', { birth_from: '1990-01-01', birth_to: '1999-12-31', page_size: 100 });
  assert.ok(b.data.records.every(x => x.birth_date >= '1990-01-01' && x.birth_date <= '1999-12-31'));
});

test('search_records: rangos incoherentes y formatos inválidos', async () => {
  const a = await call(admin, 'search_records', { quantity_min: 10, quantity_max: 1 });
  assert.equal(a.data.error.code, 'VALIDATION_ERROR');
  const b = await call(admin, 'search_records', { created_from: '31/12/2026' });
  assert.ok(b.isError);
  const c = await call(admin, 'search_records', { birth_from: '2026-02-31' });
  assert.ok(c.isError);
});

// ---------- CREATE ----------
let createdId;
test('create_record: éxito, id y fechas automáticas, opcionales', async () => {
  const r = await call(editor, 'create_record', { first_name: 'Ana', last_name: 'Prueba', email: 'ana@example.com', quantity: 5, amount: 12.5, is_active: false });
  assert.equal(r.isError, false);
  const rec = r.data.record; createdId = rec.id;
  assert.ok(rec.id > 30);
  assert.equal(rec.is_active, false);
  assert.equal(rec.birth_date, null);
  assert.equal(rec.category, 'general');
  assert.ok(rec.created_at && rec.updated_at);
  assert.equal((await call(admin, 'get_record', { id: rec.id })).data.record.email, 'ana@example.com');
});

test('create_record: validaciones', async () => {
  const bad = [
    {},                                                                                      // faltan obligatorios
    { first_name: 'A', last_name: 'B' },                                                     // falta email
    { first_name: 'A', last_name: 'B', email: 'no-es-email' },
    { first_name: 'A', last_name: 'B', email: 'a@b.cl', quantity: 1.5 },                      // no entero
    { first_name: 'A', last_name: 'B', email: 'a@b.cl', quantity: '7' },                      // tipo incorrecto
    { first_name: 'A', last_name: 'B', email: 'a@b.cl', birth_date: '2020-13-45' },
    { first_name: 'A', last_name: 'B', email: 'a@b.cl', is_active: 'si' },
    { first_name: '', last_name: 'B', email: 'a@b.cl' },
    { first_name: 'A'.repeat(101), last_name: 'B', email: 'a@b.cl' },
  ];
  for (const args of bad) assert.ok((await call(editor, 'create_record', args)).isError, JSON.stringify(args));
  assert.equal((await call(admin, 'list_records')).data.pagination.total, 31, 'no se debe haber insertado nada inválido');
});

// ---------- UPDATE ----------
test('update_record: parcial, conserva el resto y actualiza updated_at', async () => {
  const before = (await call(admin, 'get_record', { id: createdId })).data.record;
  await new Promise(r => setTimeout(r, 5));
  const r = await call(editor, 'update_record', { id: createdId, description: 'Nueva descripción' });
  assert.equal(r.data.updated, true);
  const after = r.data.record;
  assert.equal(after.description, 'Nueva descripción');
  assert.equal(after.email, before.email); assert.equal(after.quantity, before.quantity); assert.equal(after.created_at, before.created_at);
  assert.ok(after.updated_at > before.updated_at);
});

test('update_record: varios campos, null en opcional y booleanos', async () => {
  const r = await call(editor, 'update_record', { id: createdId, quantity: 77, amount: null, is_active: true, category: 'soporte' });
  assert.deepEqual([r.data.record.quantity, r.data.record.amount, r.data.record.is_active, r.data.record.category], [77, null, true, 'soporte']);
});

test('update_record: errores (inexistente, sin campos, inválido, no nulable)', async () => {
  assert.equal((await call(editor, 'update_record', { id: 99999, notes: 'x' })).data.error.code, 'NOT_FOUND');
  assert.equal((await call(editor, 'update_record', { id: createdId })).data.error.code, 'VALIDATION_ERROR');
  assert.ok((await call(editor, 'update_record', { id: createdId, email: 'malo' })).isError);
  assert.ok((await call(editor, 'update_record', { id: createdId, first_name: null })).isError);
  assert.ok((await call(editor, 'update_record', { id: 'uno', notes: 'x' })).isError);
});

// ---------- DELETE ----------
test('delete_record: sin confirm NO elimina; con confirm sí', async () => {
  const pre = await call(admin, 'delete_record', { id: createdId });
  assert.equal(pre.data.deleted, false); assert.equal(pre.data.confirmation_required, true);
  assert.equal((await call(admin, 'get_record', { id: createdId })).isError, false);
  const done = await call(admin, 'delete_record', { id: createdId, confirm: true });
  assert.equal(done.data.deleted, true);
  assert.equal((await call(admin, 'get_record', { id: createdId })).data.error.code, 'NOT_FOUND');
  assert.equal((await call(admin, 'delete_record', { id: createdId, confirm: true })).data.error.code, 'NOT_FOUND');
});

// ---------- Autorización por herramienta ----------
test('permisos: reader solo lee; editor no elimina', async () => {
  assert.equal((await call(reader, 'list_records')).isError, false);
  for (const [name, args] of [['create_record', { first_name: 'A', last_name: 'B', email: 'a@b.cl' }], ['update_record', { id: 1, notes: 'x' }], ['delete_record', { id: 1, confirm: true }]]) {
    const r = await call(reader, name, args);
    assert.equal(r.data.error.code, 'FORBIDDEN', name);
  }
  assert.equal((await call(editor, 'delete_record', { id: 1, confirm: true })).data.error.code, 'FORBIDDEN');
  assert.equal((await call(admin, 'get_record', { id: 1 })).isError, false, 'el registro 1 sigue existiendo');
});

test('auditoría registra denegaciones', () => {
  const n = t.app.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE event = 'authz.denied'").get().n;
  assert.ok(n >= 4);
});

// ---------- Seguridad ----------
test('inyección SQL: texto, categoría y campos no ejecutan SQL', async () => {
  const payloads = ["'; DROP TABLE test_records; --", "' OR '1'='1", '" OR 1=1 --', "%' UNION SELECT token_hash FROM access_tokens --"];
  for (const p of payloads) {
    const a = await call(admin, 'search_records', { query: p });
    assert.equal(a.isError, false); assert.equal(a.data.records.length, 0);
    const b = await call(admin, 'search_records', { category: p });
    assert.equal(b.data.records.length, 0);
  }
  // comodines LIKE escapados: "%" literal no debe coincidir con todo
  assert.equal((await call(admin, 'search_records', { query: '%' })).data.records.length, 0);
  assert.equal((await call(admin, 'search_records', { query: '_' })).data.records.length, 0);
  // nombres de columna maliciosos rechazados por lista blanca
  assert.ok((await call(admin, 'list_records', { sort_by: 'id; DROP TABLE test_records' })).isError);
  assert.ok((await call(admin, 'list_records', { fields: ['id', 'token_hash'] })).isError);
  assert.ok((await call(admin, 'search_records', { has_null: '1=1' })).isError);
  // valor malicioso almacenado como texto, no ejecutado
  const c = await call(editor, 'create_record', { first_name: "Robert'); DROP TABLE test_records;--", last_name: 'Tables', email: 'bob@example.com' });
  assert.equal(c.isError, false);
  assert.equal((await call(admin, 'list_records')).data.pagination.total, 30 + 1);
  await call(admin, 'delete_record', { id: c.data.record.id, confirm: true });
});

test('campos desconocidos/no editables no se pueden escribir (mass assignment)', async () => {
  const r = await call(editor, 'update_record', { id: 1, created_at: '1999-01-01T00:00:00Z', notes: 'ok' });
  const rec = (await call(admin, 'get_record', { id: 1 })).data.record;
  assert.notEqual(rec.created_at.slice(0, 4), '1999');
  assert.ok(r.isError || r.data.record.created_at.slice(0, 4) !== '1999');
});

// ---------- Errores de base de datos ----------
test('error de base de datos: respuesta controlada sin filtrar detalles internos', async () => {
  t.app.db.exec('ALTER TABLE test_records RENAME TO test_records_x');
  try {
    const r = await call(admin, 'list_records');
    assert.equal(r.isError, true);
    assert.equal(r.data.error.code, 'DATABASE_ERROR');
    assert.ok(!/test_records|sqlite|no such table/i.test(JSON.stringify(r.data)), 'no debe filtrar detalles');
  } finally { t.app.db.exec('ALTER TABLE test_records_x RENAME TO test_records'); }
  assert.equal((await call(admin, 'list_records')).isError, false, 'se recupera tras restaurar');
});
