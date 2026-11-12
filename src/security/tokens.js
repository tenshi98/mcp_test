// Emisión, validación y revocación de tokens. Solo se persiste HMAC-SHA256(token, pepper).
import crypto from 'node:crypto';
import { E } from '../errors.js';

export const TOKEN_PREFIX = 'mcp_';

export function createTokenService(db, { pepper, ttlDays }) {
  const hash = t => crypto.createHmac('sha256', pepper).update(t).digest('hex');
  const q = {
    ins: db.prepare('INSERT INTO access_tokens (user_id, token_hash, token_prefix, label, scopes, expires_at) VALUES (?,?,?,?,?,?)'),
    byHash: db.prepare('SELECT * FROM access_tokens WHERE token_hash = ?'),
    touch: db.prepare("UPDATE access_tokens SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"),
    revoke: db.prepare("UPDATE access_tokens SET status='revoked', revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), revoked_reason=? WHERE id = ? AND status='active'"),
    revokeUser: db.prepare("UPDATE access_tokens SET status='revoked', revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), revoked_reason=? WHERE user_id = ? AND status='active'"),
    list: db.prepare('SELECT id,user_id,token_prefix,label,scopes,status,issued_at,expires_at,revoked_at,revoked_reason,last_used_at FROM access_tokens WHERE (? IS NULL OR user_id = ?) ORDER BY id DESC'),
  };
  return {
    /** Devuelve { token, id, expiresAt }. El token en claro NO se vuelve a poder recuperar. */
    issue(userId, { label = null, scopes = null, ttlDays: ttl = ttlDays } = {}) {
      const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + ttl * 86400_000).toISOString();
      const r = q.ins.run(userId, hash(token), token.slice(0, 8), label, scopes ? scopes.join(',') : null, expiresAt);
      return { token, id: Number(r.lastInsertRowid), expiresAt };
    },
    /** Valida el token; lanza UNAUTHENTICATED si no existe, expiró o fue revocado. */
    validate(token) {
      if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX) || token.length > 200) throw E.unauthenticated();
      const row = q.byHash.get(hash(token));
      // comparación en tiempo constante innecesaria: se busca por hash (no por el secreto)
      if (!row) throw E.unauthenticated();
      if (row.status !== 'active') throw E.unauthenticated('Token revocado');
      if (new Date(row.expires_at).getTime() <= Date.now()) throw E.unauthenticated('Token expirado');
      q.touch.run(row.id);
      return row;
    },
    revoke(id, reason = 'manual') { return q.revoke.run(reason, id).changes > 0; },
    revokeAllForUser(userId, reason = 'manual') { return Number(q.revokeUser.run(reason, userId).changes); },
    list(userId = null) { return q.list.all(userId, userId); },
  };
}
