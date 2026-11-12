// OAuth 2.0 Authorization Code + PKCE contra un proveedor externo, y vinculación de identidades.
import crypto from 'node:crypto';
import { E } from '../errors.js';

export function createOAuth({ config, db, users, tokens, audit, fetchFn = fetch }) {
  const cfg = config.oauth;
  const pending = new Map();           // state -> { verifier, createdAt }
  const accessCache = new Map();       // sha256(accessToken) -> { user, exp }
  const STATE_TTL = 10 * 60_000, CACHE_TTL = 60_000;
  const q = {
    find: db.prepare('SELECT * FROM oauth_users WHERE provider = ? AND provider_user_id = ?'),
    ins: db.prepare('INSERT INTO oauth_users (provider,provider_user_id,email,name,allowed_user_id,is_authorized,last_login_at) VALUES (?,?,?,?,?,?,strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\'))'),
    login: db.prepare("UPDATE oauth_users SET last_login_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), email=?, name=? WHERE id=?"),
    link: db.prepare('UPDATE oauth_users SET allowed_user_id=? WHERE id=?'),
    setAuth: db.prepare('UPDATE oauth_users SET is_authorized=? WHERE id=?'),
    list: db.prepare('SELECT id,provider,provider_user_id,email,name,allowed_user_id,is_authorized,linked_at,last_login_at FROM oauth_users ORDER BY id'),
  };
  const b64 = b => b.toString('base64url');
  const redirectUri = () => `${config.http.publicUrl}/oauth/callback`;

  function sweep() {
    const now = Date.now();
    for (const [k, v] of pending) if (now - v.createdAt > STATE_TTL) pending.delete(k);
    for (const [k, v] of accessCache) if (v.exp < now) accessCache.delete(k);
  }

  /** Paso 1: URL de autorización con state + PKCE (S256). */
  function startLogin() {
    if (!cfg.enabled) throw E.validation('OAuth no está configurado');
    sweep();
    const state = b64(crypto.randomBytes(24));
    const verifier = b64(crypto.randomBytes(48));
    pending.set(state, { verifier, createdAt: Date.now() });
    const u = new URL(cfg.authorizeUrl);
    u.search = new URLSearchParams({
      response_type: 'code', client_id: cfg.clientId, redirect_uri: redirectUri(),
      scope: cfg.scopes, state, code_challenge: b64(crypto.createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
    }).toString();
    return u.toString();
  }

  async function fetchUserinfo(accessToken) {
    const r = await fetchFn(cfg.userinfoUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    if (!r.ok) throw E.unauthenticated('El proveedor OAuth rechazó el access token');
    const p = await r.json();
    const id = String(p.sub ?? p.id ?? '');
    if (!id) throw E.unauthenticated('Respuesta de proveedor sin identificador');
    return { providerUserId: id, email: p.email ? String(p.email).toLowerCase() : null, name: p.name ?? p.login ?? null };
  }

  /** Vincula/actualiza la identidad OAuth y devuelve el usuario permitido asociado (o lanza FORBIDDEN). */
  function linkIdentity(profile) {
    let row = q.find.get(cfg.provider, profile.providerUserId);
    if (!row) {
      const allowed = profile.email ? users.byEmail(profile.email) : null;
      if (!allowed && cfg.requirePreauthorized) {
        audit('oauth.rejected', { outcome: 'denied', detail: { provider: cfg.provider, reason: 'email no preautorizado' } });
        throw E.forbidden('La identidad OAuth no corresponde a un usuario autorizado');
      }
      q.ins.run(cfg.provider, profile.providerUserId, profile.email, profile.name, allowed?.id ?? null, allowed ? 1 : 0);
      row = q.find.get(cfg.provider, profile.providerUserId);
      audit('oauth.linked', { userId: allowed?.id ?? null, detail: { provider: cfg.provider, oauthUserId: row.id } });
    } else {
      q.login.run(profile.email, profile.name, row.id);
      if (!row.allowed_user_id && profile.email) {        // vinculación tardía
        const allowed = users.byEmail(profile.email);
        if (allowed) { q.link.run(allowed.id, row.id); row.allowed_user_id = allowed.id; }
      }
    }
    if (!row.is_authorized || !row.allowed_user_id) {
      audit('oauth.denied', { outcome: 'denied', detail: { oauthUserId: row.id } });
      throw E.forbidden('Identidad OAuth no autorizada');
    }
    const user = users.byId(row.allowed_user_id);
    if (!user?.is_active) throw E.forbidden('Usuario no autorizado (inactivo)');
    return user;
  }

  /** Paso 2: callback. Intercambia code, obtiene perfil, vincula y emite un token MCP. */
  async function finishLogin({ code, state }) {
    sweep();
    const p = pending.get(state);
    pending.delete(state);                                  // un solo uso (anti-replay)
    if (!p) throw E.validation('state inválido o expirado');
    if (!code) throw E.validation('code ausente');
    const r = await fetchFn(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectUri(),
        client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: p.verifier,
      }),
    });
    if (!r.ok) throw E.unauthenticated('Intercambio de código OAuth fallido');
    const tok = await r.json();
    if (!tok.access_token) throw E.unauthenticated('El proveedor no devolvió access_token');
    const profile = await fetchUserinfo(tok.access_token);
    const user = linkIdentity(profile);
    const issued = tokens.issue(user.id, { label: `oauth:${cfg.provider}` });
    audit('oauth.login', { userId: user.id, detail: { provider: cfg.provider, tokenId: issued.id } });
    return { user, ...issued };
  }

  /** Bearer = access token del proveedor: se valida con userinfo (cache 60 s) y se mapea a un usuario permitido. */
  async function resolveAccessToken(accessToken) {
    sweep();
    const key = crypto.createHash('sha256').update(accessToken).digest('hex');
    const hit = accessCache.get(key);
    if (hit && hit.exp > Date.now()) return users.byId(hit.userId);
    const user = linkIdentity(await fetchUserinfo(accessToken));
    accessCache.set(key, { userId: user.id, exp: Date.now() + CACHE_TTL });
    return user;
  }

  return {
    enabled: cfg.enabled, startLogin, finishLogin, resolveAccessToken,
    list: () => q.list.all(),
    setAuthorized: (id, v) => q.setAuth.run(v ? 1 : 0, id),
    linkTo: (id, userId) => q.link.run(userId, id),
  };
}
