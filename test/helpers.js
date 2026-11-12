import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createHttpServer } from '../src/http.js';

export const logLines = [];

export async function startTestApp({ env = {}, fetchFn } = {}) {
  const config = loadConfig({ TOKEN_PEPPER: 'test-pepper-0123456789abcdef', PUBLIC_URL: 'http://127.0.0.1:0', ...env });
  const logger = createLogger({ level: 'debug', sink: l => logLines.push(l) });
  const app = createApp({ config, db: openDb(':memory:'), logger, init: true, fetchFn });
  const server = createHttpServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  config.http.publicUrl = url;                      // el callback OAuth usa la URL real
  const mk = (name, role, active = true) => {
    const u = app.users.create({ name, email: `${name}@example.com`, role });
    if (!active) app.users.setActive(u.id, false);
    return u;
  };
  return { app, url, mk, close: () => new Promise(r => { server.close(r); server.closeAllConnections?.(); }) };
}

export async function connect(url, token) {
  const client = new Client({ name: 'test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(url + '/mcp'), { requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} } });
  await client.connect(transport);
  return client;
}

/** Llama a una herramienta y devuelve { isError, data } con el JSON estructurado. */
export async function call(client, name, args = {}) {
  try {
    const r = await client.callTool({ name, arguments: args });
    return { isError: !!r.isError, data: r.structuredContent ?? JSON.parse(r.content[0].text) };
  } catch (e) {            // errores de protocolo (p.ej. parámetros que no cumplen el esquema)
    return { isError: true, protocolError: true, message: e.message, data: null };
  }
}

export const mockProvider = async (profiles) => {
  // Proveedor OAuth falso: /authorize no se usa (se invoca el callback a mano); /token y /userinfo sí.
  const codes = new Map();
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/token') {
      let b = ''; for await (const c of req) b += c;
      const p = new URLSearchParams(b);
      const entry = codes.get(p.get('code'));
      if (!entry || !p.get('code_verifier')) { res.writeHead(400); return res.end('{}'); }
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ access_token: entry, token_type: 'Bearer' }));
    }
    if (u.pathname === '/userinfo') {
      const t = (req.headers.authorization || '').replace('Bearer ', '');
      if (!profiles[t]) { res.writeHead(401); return res.end('{}'); }
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(profiles[t]));
    }
    res.writeHead(404); res.end();
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, codes, close: () => new Promise(r => { srv.close(r); srv.closeAllConnections?.(); }) };
};
