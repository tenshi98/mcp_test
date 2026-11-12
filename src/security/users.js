// Gestión de usuarios permitidos (allowed_users).
import { E } from '../errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['reader', 'editor', 'admin'];

export function createUserService(db) {
  const q = {
    byId: db.prepare('SELECT * FROM allowed_users WHERE id = ?'),
    byEmail: db.prepare('SELECT * FROM allowed_users WHERE email = ?'),
    list: db.prepare('SELECT id,name,email,role,is_active,external_ref,created_at,updated_at FROM allowed_users ORDER BY id'),
    ins: db.prepare('INSERT INTO allowed_users (name,email,role,external_ref,notes) VALUES (?,?,?,?,?)'),
    setActive: db.prepare("UPDATE allowed_users SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"),
    setRole: db.prepare("UPDATE allowed_users SET role = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"),
  };
  return {
    byId: id => q.byId.get(id),
    byEmail: email => q.byEmail.get(email),
    list: () => q.list.all(),
    create({ name, email, role = 'reader', externalRef = null, notes = null }) {
      if (!name?.trim()) throw E.validation('name es obligatorio');
      if (!EMAIL_RE.test(email || '')) throw E.validation('email inválido');
      if (!ROLES.includes(role)) throw E.validation(`role debe ser uno de ${ROLES.join(', ')}`);
      if (q.byEmail.get(email)) throw E.validation('Ya existe un usuario con ese email');
      const r = q.ins.run(name.trim(), email.trim(), role, externalRef, notes);
      return q.byId.get(Number(r.lastInsertRowid));
    },
    setActive(id, active) {
      if (!q.byId.get(id)) throw E.notFound(`Usuario ${id} no existe`);
      q.setActive.run(active ? 1 : 0, id);
    },
    setRole(id, role) {
      if (!ROLES.includes(role)) throw E.validation(`role debe ser uno de ${ROLES.join(', ')}`);
      if (!q.byId.get(id)) throw E.notFound(`Usuario ${id} no existe`);
      q.setRole.run(role, id);
    },
  };
}
