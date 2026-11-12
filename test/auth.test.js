import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, connect, call, logLines } from './helpers.js';

let t, admin, reader, adminTok, readerTok;
before(async () => {
  t = await startTestApp();
  admin = t.mk('admin', 'admin'); reader = t.mk('reader', 'reader');
  adminTok = t.app.tokens.issue(admin.id).token; readerTok = t.app.tokens.issue(reader.id).token;
});
after(() => t.close());

const post = (token, body = { jsonrpc: '2.0', id: 1, method: 'tools/list' }) => fetch(t.url + '/mcp', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

test('conexión MCP y listado de herramientas', async () => {
  const c = await connect(t.url, adminTok);
  const { tools } = await c.listTools();
  assert.deepEqual(tools.map(x => x.name).sort(), ['create_record', 'delete_record', 'get_record', 'list_records', 'search_records', 'update_record']);
  for (const x of tools) assert.ok(x.description && x.inputSchema?.type === 'object');
  await c.close();
});

test('sin token → 401 con WWW-Authenticate', async () => {
  const r = await post(null);
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate'), /resource_metadata=/);
});

test('token inválido / malformado → 401', async () => {
  assert.equal((await post('mcp_inventado')).status, 401);
  assert.equal((await post('x'.repeat(500))).status, 401);
  assert.equal((await post("' OR 1=1 --")).status, 401);
});

test('token expirado → 401', async () => {
  const { token, id } = t.app.tokens.issue(admin.id);
  t.app.db.prepare("UPDATE access_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(id);
  const r = await post(token);
  assert.equal(r.status, 401);
  assert.match((await r.json()).error.message, /expirado/);
});

test('token revocado → 401 y se refleja de inmediato', async () => {
  const { token, id } = t.app.tokens.issue(admin.id);
  assert.equal((await post(token)).status, 200);
  assert.ok(t.app.tokens.revoke(id, 'test'));
  const r = await post(token);
  assert.equal(r.status, 401);
  assert.match((await r.json()).error.message, /revocado/);
});

test('usuario inactivo → 403 aunque el token sea vigente', async () => {
  const u = t.mk('inactivo', 'admin', false);
  const tok = t.app.tokens.issue(u.id).token;
  assert.equal((await post(tok)).status, 403);
});

test('usuario desactivado después de conectar: la siguiente llamada falla', async () => {
  const u = t.mk('temporal', 'admin');
  const c = await connect(t.url, t.app.tokens.issue(u.id).token);
  assert.equal((await call(c, 'list_records')).isError, false);
  t.app.users.setActive(u.id, false);
  const r = await call(c, 'list_records');
  assert.ok(r.isError && r.protocolError, 'la llamada debe ser rechazada');
  await c.close().catch(() => {});
});

test('el token solo se almacena como hash', () => {
  const rows = t.app.db.prepare('SELECT token_hash FROM access_tokens').all();
  assert.ok(rows.every(r => /^[0-9a-f]{64}$/.test(r.token_hash) && !r.token_hash.startsWith('mcp_')));
});

test('scopes del token limitan el rol', async () => {
  const tok = t.app.tokens.issue(admin.id, { scopes: ['records:read'] }).token;
  const c = await connect(t.url, tok);
  assert.equal((await call(c, 'list_records')).isError, false);
  const r = await call(c, 'delete_record', { id: 1, confirm: true });
  assert.equal(r.data.error.code, 'FORBIDDEN');
  await c.close();
});

test('los logs no contienen tokens', () => {
  const all = logLines.join('\n');
  assert.ok(!all.includes(adminTok) && !all.includes(readerTok));
  assert.ok(!/mcp_[A-Za-z0-9_-]{20,}/.test(all));
  assert.ok(logLines.some(l => l.includes('auth.failed')));
});

test('metadatos OAuth del recurso protegido', async () => {
  const r = await fetch(t.url + '/.well-known/oauth-protected-resource');
  assert.equal(r.status, 200);
  assert.ok((await r.json()).resource.endsWith('/mcp'));
});
