import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { openDb, initDb } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-stdio-'));
const dbPath = path.join(dir, 't.db');
const env = { ...process.env, DB_PATH: dbPath, TOKEN_PEPPER: 'stdio-pepper-0123456789abcdef', LOG_FILE: '', LOG_LEVEL: 'warn' };
const app = createApp({ config: loadConfig(env), db: openDb(dbPath), init: true });
const user = app.users.create({ name: 'Stdio', email: 'stdio@example.com', role: 'reader' });
const token = app.tokens.issue(user.id).token;

const spawn = (tok) => {
  const c = new Client({ name: 'test', version: '1' });
  return [c, new StdioClientTransport({ command: process.execPath, args: ['src/index.js', 'stdio'], env: { ...env, MCP_TOKEN: tok }, stderr: 'pipe' })];
};

test('stdio: conexión autenticada y llamada a herramienta', async () => {
  const [c, tr] = spawn(token);
  await c.connect(tr);
  const r = await c.callTool({ name: 'get_record', arguments: { id: 1 } });
  assert.equal(r.structuredContent.record.id, 1);
  const d = await c.callTool({ name: 'delete_record', arguments: { id: 1, confirm: true } });
  assert.equal(d.structuredContent.error.code, 'FORBIDDEN');
  await c.close();
});

test('stdio: token inválido impide el arranque', async () => {
  const [c, tr] = spawn('mcp_invalido');
  await assert.rejects(() => c.connect(tr));
});
