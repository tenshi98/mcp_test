import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, connect, call, mockProvider, logLines } from './helpers.js';

let t, prov, user;
const profiles = {
  'at-ok': { sub: 'g-1', email: 'Ana@Example.com', name: 'Ana' },
  'at-unknown': { sub: 'g-2', email: 'intruso@example.com', name: 'Intruso' },
};
before(async () => {
  prov = await mockProvider(profiles);
  t = await startTestApp({ env: {
    OAUTH_CLIENT_ID: 'cid', OAUTH_CLIENT_SECRET: 'csecret', OAUTH_AUTHORIZE_URL: prov.base + '/authorize',
    OAUTH_TOKEN_URL: prov.base + '/token', OAUTH_USERINFO_URL: prov.base + '/userinfo' } });
  user = t.mk('ana', 'editor'); t.app.db.prepare('UPDATE allowed_users SET email = ? WHERE id = ?').run('ana@example.com', user.id);
});
after(async () => { await t.close(); await prov.close(); });

async function login(accessToken) {
  const r = await fetch(t.url + '/oauth/login', { redirect: 'manual' });
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(loc.searchParams.get('code_challenge') && loc.searchParams.get('state'));
  assert.equal(loc.searchParams.get('redirect_uri'), t.url + '/oauth/callback');
  prov.codes.set('code-' + accessToken, accessToken);
  return { state: loc.searchParams.get('state'), code: 'code-' + accessToken };
}
const callback = ({ state, code }) => fetch(`${t.url}/oauth/callback?code=${code}&state=${state}`);

test('flujo completo: login → vinculación → token MCP utilizable', async () => {
  const res = await callback(await login('at-ok'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.access_token.startsWith('mcp_'));
  const row = t.app.db.prepare('SELECT * FROM oauth_users WHERE provider_user_id = ?').get('g-1');
  assert.equal(row.allowed_user_id, user.id); assert.equal(row.is_authorized, 1); assert.ok(row.last_login_at);
  const c = await connect(t.url, body.access_token);
  assert.equal((await call(c, 'list_records')).isError, false);
  assert.equal((await call(c, 'delete_record', { id: 1, confirm: true })).data.error.code, 'FORBIDDEN');   // rol editor
  await c.close();
});

test('state se usa una sola vez (anti-replay) y state falso es rechazado', async () => {
  const s = await login('at-ok');
  assert.equal((await callback(s)).status, 200);
  assert.equal((await callback(s)).status, 400);
  assert.equal((await callback({ state: 'falso', code: 'x' })).status, 400);
});

test('identidad OAuth sin usuario preautorizado → 403 y no se vincula', async () => {
  const res = await callback(await login('at-unknown'));
  assert.equal(res.status, 403);
  assert.equal(t.app.db.prepare("SELECT COUNT(*) n FROM oauth_users WHERE provider_user_id='g-2'").get().n, 0);
});

test('identidad OAuth desautorizada → 403', async () => {
  const row = t.app.db.prepare('SELECT id FROM oauth_users WHERE provider_user_id = ?').get('g-1');
  t.app.oauth.setAuthorized(row.id, false);
  assert.equal((await callback(await login('at-ok'))).status, 403);
  t.app.oauth.setAuthorized(row.id, true);
});

test('code inválido en el proveedor → 401', async () => {
  const r = await fetch(t.url + '/oauth/login', { redirect: 'manual' });
  const state = new URL(r.headers.get('location')).searchParams.get('state');
  assert.equal((await callback({ state, code: 'nunca-emitido' })).status, 401);
});

test('Bearer = access token del proveedor se valida con userinfo', async () => {
  const c = await connect(t.url, 'at-ok');
  assert.equal((await call(c, 'get_record', { id: 1 })).isError, false);
  await c.close();
  const bad = await fetch(t.url + '/mcp', { method: 'POST', headers: { Authorization: 'Bearer at-falso', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
  assert.equal(bad.status, 401);
  const unk = await fetch(t.url + '/mcp', { method: 'POST', headers: { Authorization: 'Bearer at-unknown', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
  assert.equal(unk.status, 403);
});

test('los secretos OAuth no aparecen en los logs', () => {
  const all = logLines.join('\n');
  assert.ok(!all.includes('csecret') && !all.includes('at-ok') && !/mcp_[A-Za-z0-9_-]{20,}/.test(all));
});

test('OAuth deshabilitado → /oauth/login responde 404', async () => {
  const t2 = await startTestApp();
  assert.equal((await fetch(t2.url + '/oauth/login', { redirect: 'manual' })).status, 404);
  await t2.close();
});
