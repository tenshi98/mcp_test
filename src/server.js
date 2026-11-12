// Construye el servidor MCP: registra las herramientas con control de acceso, validación y auditoría.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError } from 'zod';
import { AppError, E } from './errors.js';
import { toolDefinitions } from './tools/definitions.js';

export const SERVER_INFO = { name: 'mcp-crud-server', version: '1.0.0' };

const result = (data, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
  ...(isError ? { isError: true } : {}),
});

function toAppError(e, logger) {
  if (e instanceof AppError) return e;
  if (e instanceof ZodError) return E.validation('Parámetros inválidos', e.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  logger.error('tool.unexpected_error', { error: e, cause: e?.cause });
  return E.db('Error interno del servidor');
}

export function createMcpServer({ auth, records, audit, logger }) {
  const server = new McpServer(SERVER_INFO, {
    instructions: 'CRUD sobre test_records. Use search_records para buscar, delete_record requiere confirm=true tras aprobación del usuario.',
  });
  for (const def of toolDefinitions({ records })) {
    server.registerTool(def.name, {
      title: def.title, description: `${def.description} [Permiso: ${def.permission}]`,
      inputSchema: def.inputShape, annotations: def.annotations,
    }, async (args, extra) => {
      let principal;
      try {
        // Autenticación en cada llamada: una revocación o desactivación surte efecto de inmediato.
        principal = await auth.authenticate(extra.authInfo?.token);
        auth.requirePermission(principal, def.permission);           // Autorización
        const data = def.handler(args, { principal });
        audit(`tool.${def.name}`, { userId: principal.userId, detail: { id: args.id, via: principal.via } });
        return result(data);
      } catch (e) {
        const err = toAppError(e, logger);
        if (!['UNAUTHENTICATED', 'FORBIDDEN'].includes(err.code))
          audit(`tool.${def.name}`, { userId: principal?.userId, outcome: 'error', detail: { code: err.code, id: args?.id } });
        return result({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }, true);
      }
    });
  }
  return server;
}
