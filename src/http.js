// Transporte Streamable HTTP (MCP 2025-06-18+) con Bearer auth, metadatos OAuth y endpoints de login.
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { AppError } from './errors.js';
import { createMcpServer } from './server.js';

const MAX_BODY = 1_000_000;
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new AppError('VALIDATION_ERROR', 'Cuerpo demasiado grande')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined); } catch { reject(new AppError('VALIDATION_ERROR', 'JSON inválido')); } });
  req.on('error', reject);
});

export function createHttpServer(app) {
  const { config, auth, oauth, logger } = app;
  const base = config.http.publicUrl;
  const challenge = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`;

  const handler = async (req, res) => {
    const url = new URL(req.url, base);
    try {
      if (url.pathname === '/health') return json(res, 200, { status: 'ok' });

      if (url.pathname === '/.well-known/oauth-protected-resource') {
        return json(res, 200, {
          resource: `${base}/mcp`,
          ...(config.oauth.enabled ? { authorization_servers: [new URL(config.oauth.authorizeUrl).origin] } : {}),
          bearer_methods_supported: ['header'],
        });
      }

      if (url.pathname === '/oauth/login' && req.method === 'GET') {
        if (!oauth.enabled) return json(res, 404, { error: { code: 'NOT_FOUND', message: 'OAuth no configurado' } });
        res.writeHead(302, { Location: oauth.startLogin(), 'Cache-Control': 'no-store' });
        return res.end();
      }
      if (url.pathname === '/oauth/callback' && req.method === 'GET') {
        if (url.searchParams.get('error')) return json(res, 400, { error: { code: 'OAUTH_ERROR', message: 'El proveedor devolvió un error' } });
        const r = await oauth.finishLogin({ code: url.searchParams.get('code'), state: url.searchParams.get('state') });
        // El token se muestra UNA vez; no se registra en logs.
        return json(res, 200, { access_token: r.token, token_type: 'Bearer', expires_at: r.expiresAt, user: r.user.email });
      }

      if (url.pathname === '/mcp') {
        const m = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
        let principal;
        try { principal = await auth.authenticate(m?.[1]); }
        catch (e) {
          const status = e.code === 'FORBIDDEN' ? 403 : 401;
          return json(res, status, { error: { code: e.code, message: e.message } }, status === 401 ? { 'WWW-Authenticate': challenge } : {});
        }
        if (req.method !== 'POST') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Solo POST (servidor sin estado)' } }, { Allow: 'POST' });
        const body = await readBody(req);
        req.auth = { token: m[1], clientId: String(principal.userId), scopes: principal.permissions, extra: { email: principal.email } };
        // Modo sin estado: una instancia de servidor y transporte por petición.
        const server = createMcpServer(app);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => { transport.close(); server.close(); });
        await server.connect(transport);
        return await transport.handleRequest(req, res, body);
      }
      return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof AppError) {
        const status = { VALIDATION_ERROR: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404 }[e.code] || 500;
        logger.warn('http.error', { path: url.pathname, code: e.code, message: e.message });
        return json(res, status, { error: { code: e.code, message: e.message } });
      }
      logger.error('http.unexpected', { path: url.pathname, error: e });
      return json(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Error interno' } });
    }
  };
  return http.createServer(handler);
}
