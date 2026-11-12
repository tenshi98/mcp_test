// Composición de dependencias (composition root).
import { loadConfig, validateConfig } from './config.js';
import { createLogger } from './logger.js';
import { openDb, initDb } from './db.js';
import { createAudit } from './audit.js';
import { createUserService } from './security/users.js';
import { createTokenService } from './security/tokens.js';
import { createOAuth } from './security/oauth.js';
import { createAuth } from './security/auth.js';
import { createRecordRepository } from './records/repository.js';

export function createApp({ config = validateConfig(loadConfig()), db, logger, fetchFn, init = false, schemaOnly = false } = {}) {
  logger ??= createLogger({ level: config.logLevel, file: config.logFile });
  db ??= openDb(config.dbPath);
  if (init || schemaOnly) initDb(db, { seed: init });
  const audit = createAudit(db, logger);
  const users = createUserService(db);
  const tokens = createTokenService(db, { pepper: config.tokenPepper, ttlDays: config.tokenTtlDays });
  const oauth = createOAuth({ config, db, users, tokens, audit, fetchFn });
  const auth = createAuth({ config, tokens, users, oauth, audit });
  const records = createRecordRepository(db);
  return { config, db, logger, audit, users, tokens, oauth, auth, records };
}
