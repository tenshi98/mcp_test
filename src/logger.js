// Logger JSON con redacción de secretos. Escribe en STDERR (stdout es del protocolo en modo stdio).
import fs from 'node:fs';
import path from 'node:path';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /^(access_?|refresh_?|bearer_?|id_?)?token$|secret|password|authorization|verifier|^code$|pepper|cookie|api[_-]?key/i;
const SENSITIVE_VALUE = /\b(mcp_[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._~+\/=-]+)/g;

export function redact(value, depth = 0) {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return value.replace(SENSITIVE_VALUE, '[REDACTED]');
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message) };
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

export function createLogger({ level = 'info', file = '', sink } = {}) {
  const min = LEVELS[level] ?? 20;
  let stream = null;
  if (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    stream = fs.createWriteStream(file, { flags: 'a' });
  }
  const write = (lvl, event, data) => {
    if (LEVELS[lvl] < min) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level: lvl, event, ...redact(data || {}) });
    if (sink) sink(line);
    else process.stderr.write(line + '\n');
    stream?.write(line + '\n');
  };
  return {
    debug: (e, d) => write('debug', e, d),
    info: (e, d) => write('info', e, d),
    warn: (e, d) => write('warn', e, d),
    error: (e, d) => write('error', e, d),
    close: () => stream?.end(),
  };
}
