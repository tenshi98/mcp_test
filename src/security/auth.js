// AUTENTICACIÓN (¿quién eres?) y AUTORIZACIÓN (¿qué puedes hacer?).
import { E } from '../errors.js';
import { ALL_PERMISSIONS } from '../config.js';

export function createAuth({ config, tokens, users, oauth, audit }) {
  /** Permisos efectivos = permisos del rol ∩ scopes del token (si el token los limita). */
  function effectivePermissions(user, tokenRow) {
    const rolePerms = config.roles[user.role] || [];
    if (!tokenRow?.scopes) return rolePerms;
    const scopes = tokenRow.scopes.split(',').map(s => s.trim());
    return rolePerms.filter(p => scopes.includes(p));
  }

  /** Autentica un bearer token y devuelve el principal. Lanza UNAUTHENTICATED / FORBIDDEN. */
  async function authenticate(bearer) {
    let user, tokenRow = null, via = 'token';
    try {
      if (bearer?.startsWith('mcp_')) {
        tokenRow = tokens.validate(bearer);
        user = users.byId(tokenRow.user_id);
      } else if (bearer && oauth?.enabled) {
        via = 'oauth';
        user = await oauth.resolveAccessToken(bearer); // valida contra el proveedor
      } else {
        throw E.unauthenticated();
      }
    } catch (e) {
      audit('auth.failed', { outcome: 'denied', detail: { via, reason: e.message } });
      throw e;
    }
    if (!user) { audit('auth.failed', { outcome: 'denied', detail: { via, reason: 'usuario inexistente' } }); throw E.unauthenticated(); }
    if (!user.is_active) {
      audit('auth.denied', { userId: user.id, outcome: 'denied', detail: { reason: 'usuario inactivo' } });
      throw E.forbidden('Usuario no autorizado (inactivo)');
    }
    return {
      userId: user.id, email: user.email, name: user.name, role: user.role, via,
      tokenId: tokenRow?.id ?? null,
      permissions: effectivePermissions(user, tokenRow),
    };
  }

  function requirePermission(principal, permission) {
    if (!principal) throw E.unauthenticated();
    if (!ALL_PERMISSIONS.includes(permission) || !principal.permissions.includes(permission)) {
      audit('authz.denied', { userId: principal.userId, outcome: 'denied', detail: { permission } });
      throw E.forbidden(`Permiso requerido: ${permission}`);
    }
  }
  return { authenticate, requirePermission, effectivePermissions };
}
