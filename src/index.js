// Punto de entrada: `node src/index.js http|stdio`
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApp } from './app.js';
import { createHttpServer } from './http.js';
import { createMcpServer } from './server.js';

const mode = process.argv[2] || 'http';
const app = createApp();
const { config, logger } = app;

if (mode === 'stdio') {
  // En stdio no hay cabeceras HTTP: el token llega por la variable MCP_TOKEN y se valida igualmente.
  if (!config.stdioToken) { logger.error('startup.failed', { reason: 'MCP_TOKEN requerido en modo stdio' }); process.exit(1); }
  try { await app.auth.authenticate(config.stdioToken); }
  catch (e) { logger.error('startup.auth_failed', { code: e.code, message: e.message }); process.exit(1); }
  const server = createMcpServer(app);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Inyecta authInfo en cada mensaje entrante
  const handle = transport.onmessage;
  transport.onmessage = (msg, extra) => handle?.(msg, { ...extra, authInfo: { token: config.stdioToken, clientId: 'stdio', scopes: [] } });
  logger.info('server.started', { mode: 'stdio' });
} else {
  const srv = createHttpServer(app);
  srv.listen(config.http.port, config.http.host, () => logger.info('server.started', { mode: 'http', host: config.http.host, port: config.http.port }));
  const stop = () => srv.close(() => { app.db.close(); process.exit(0); });
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
