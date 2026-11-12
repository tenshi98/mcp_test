// Carga y valida la configuración desde variables de entorno.
const csv = (v, d = '') => (v ?? d).split(',').map(s => s.trim()).filter(Boolean);
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

export const ALL_PERMISSIONS = ['records:read', 'records:create', 'records:update', 'records:delete'];

export function loadConfig(env = process.env) {
  const cfg = {
    dbPath: env.DB_PATH || './data/mcp.db',
    http: {
      host: env.HTTP_HOST || '127.0.0.1',
      port: Number(env.HTTP_PORT || 3000),
      publicUrl: (env.PUBLIC_URL || `http://127.0.0.1:${env.HTTP_PORT || 3000}`).replace(/\/$/, ''),
    },
    tokenPepper: env.TOKEN_PEPPER || '',
    tokenTtlDays: Number(env.TOKEN_TTL_DAYS || 30),
    stdioToken: env.MCP_TOKEN || '',
    roles: {
      reader: csv(env.ROLE_READER, 'records:read'),
      editor: csv(env.ROLE_EDITOR, 'records:read,records:create,records:update'),
      admin: csv(env.ROLE_ADMIN, ALL_PERMISSIONS.join(',')),
    },
    oauth: {
      provider: env.OAUTH_PROVIDER || 'generic',
      clientId: env.OAUTH_CLIENT_ID || '',
      clientSecret: env.OAUTH_CLIENT_SECRET || '',
      authorizeUrl: env.OAUTH_AUTHORIZE_URL || '',
      tokenUrl: env.OAUTH_TOKEN_URL || '',
      userinfoUrl: env.OAUTH_USERINFO_URL || '',
      scopes: env.OAUTH_SCOPES || 'openid email profile',
      requirePreauthorized: bool(env.OAUTH_REQUIRE_PREAUTHORIZED, true),
    },
    logLevel: env.LOG_LEVEL || 'info',
    logFile: env.LOG_FILE || '',
  };
  cfg.oauth.enabled = !!(cfg.oauth.clientId && cfg.oauth.authorizeUrl && cfg.oauth.tokenUrl && cfg.oauth.userinfoUrl);
  return cfg;
}

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg.tokenPepper || cfg.tokenPepper.length < 16) errors.push('TOKEN_PEPPER es obligatorio (mínimo 16 caracteres)');
  if (!(cfg.tokenTtlDays > 0)) errors.push('TOKEN_TTL_DAYS debe ser > 0');
  for (const [role, perms] of Object.entries(cfg.roles))
    for (const p of perms) if (!ALL_PERMISSIONS.includes(p)) errors.push(`Permiso desconocido "${p}" en rol ${role}`);
  if (errors.length) throw new Error('Configuración inválida:\n - ' + errors.join('\n - '));
  return cfg;
}
