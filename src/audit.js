// Auditoría: log estructurado + tabla audit_log. Nunca recibe secretos.
import { redact } from './logger.js';

export function createAudit(db, logger) {
  const ins = db.prepare('INSERT INTO audit_log (event, user_id, outcome, detail) VALUES (?, ?, ?, ?)');
  return function audit(event, { userId = null, outcome = 'ok', detail = {} } = {}) {
    const safe = redact(detail);
    try { ins.run(event, userId, outcome, JSON.stringify(safe)); }
    catch (e) { logger.error('audit_write_failed', { error: e }); }
    logger[outcome === 'ok' ? 'info' : 'warn'](event, { userId, outcome, ...safe });
  };
}
