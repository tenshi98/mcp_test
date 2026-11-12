#!/usr/bin/env node
// CLI de administración: base de datos, usuarios, tokens y usuarios OAuth.
import { parseArgs } from 'node:util';
import { createApp } from '../src/app.js';

const [cmd, ...rest] = process.argv.slice(2);
const { values: o, positionals: p } = parseArgs({
  args: rest, allowPositionals: true,
  options: { name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' }, label: { type: 'string' },
    days: { type: 'string' }, scopes: { type: 'string' }, reason: { type: 'string' }, 'no-seed': { type: 'boolean' }, user: { type: 'string' } },
});

const HELP = `Uso: npm run admin -- <comando>
  db-init [--no-seed]                       Crea tablas (y carga 30 registros de prueba)
  user-add --name N --email E [--role reader|editor|admin]
  user-list | user-enable <id> | user-disable <id> | user-role <id> --role R
  token-issue <userId> [--label L] [--days N] [--scopes records:read,...]
  token-list [--user ID] | token-revoke <tokenId> [--reason R] | token-revoke-user <userId>
  oauth-list | oauth-authorize <id> | oauth-deauthorize <id> | oauth-link <id> --user <userId>`;

if (!cmd || cmd === 'help') { console.log(HELP); process.exit(0); }
// db-init necesita crear las tablas antes de que los servicios preparen sus sentencias
const app = createApp({ init: cmd === 'db-init' && !o['no-seed'] ? true : false, schemaOnly: cmd === 'db-init' && o['no-seed'] });
const { users, tokens, oauth, audit, db } = app;
const num = (v) => { const n = Number(v); if (!Number.isInteger(n)) throw new Error('Se esperaba un id numérico'); return n; };

try {
  switch (cmd) {
    case 'db-init': console.log('Base de datos inicializada:', app.config.dbPath); break;
    case 'user-add': { const u = users.create({ name: o.name, email: o.email, role: o.role }); audit('admin.user_add', { detail: { id: u.id } }); console.table([u]); break; }
    case 'user-list': console.table(users.list()); break;
    case 'user-enable': users.setActive(num(p[0]), true); audit('admin.user_enable', { detail: { id: num(p[0]) } }); console.log('OK'); break;
    case 'user-disable': { users.setActive(num(p[0]), false); const n = tokens.revokeAllForUser(num(p[0]), 'usuario desactivado'); audit('admin.user_disable', { detail: { id: num(p[0]), revoked: n } }); console.log(`OK (${n} tokens revocados)`); break; }
    case 'user-role': users.setRole(num(p[0]), o.role); audit('admin.user_role', { detail: { id: num(p[0]), role: o.role } }); console.log('OK'); break;
    case 'token-issue': {
      const uid = num(p[0]); const u = users.byId(uid);
      if (!u) throw new Error('Usuario no existe'); if (!u.is_active) throw new Error('Usuario inactivo');
      const t = tokens.issue(uid, { label: o.label, ttlDays: o.days ? Number(o.days) : undefined, scopes: o.scopes?.split(',') });
      audit('admin.token_issue', { userId: uid, detail: { tokenId: t.id } });
      console.log(`Token (guárdelo ahora, no se podrá ver de nuevo):\n${t.token}\nid=${t.id} expira=${t.expiresAt}`); break;
    }
    case 'token-list': console.table(tokens.list(o.user ? num(o.user) : null)); break;
    case 'token-revoke': { const ok = tokens.revoke(num(p[0]), o.reason || 'manual'); audit('admin.token_revoke', { detail: { tokenId: num(p[0]), ok } }); console.log(ok ? 'Revocado' : 'No encontrado o ya revocado'); break; }
    case 'token-revoke-user': console.log(`${tokens.revokeAllForUser(num(p[0]), o.reason || 'manual')} tokens revocados`); break;
    case 'oauth-list': console.table(oauth.list()); break;
    case 'oauth-authorize': oauth.setAuthorized(num(p[0]), true); console.log('OK'); break;
    case 'oauth-deauthorize': oauth.setAuthorized(num(p[0]), false); console.log('OK'); break;
    case 'oauth-link': oauth.linkTo(num(p[0]), num(o.user)); console.log('OK'); break;
    default: console.error('Comando desconocido\n' + HELP); process.exitCode = 1;
  }
} catch (e) { console.error('Error:', e.message); process.exitCode = 1; }
finally { db.close(); }
