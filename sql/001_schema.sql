-- =====================================================================
-- 001_schema.sql  -  Esquema completo (SQLite 3)
-- Idempotente: puede ejecutarse varias veces.
-- =====================================================================
PRAGMA foreign_keys = ON;

-- 2.1 Usuarios permitidos (AUTORIZACIÓN) ------------------------------
CREATE TABLE IF NOT EXISTS allowed_users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  role        TEXT    NOT NULL DEFAULT 'reader' CHECK (role IN ('reader','editor','admin')),
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  external_ref TEXT,                       -- info adicional de identificación (ej. RUT/ID interno)
  notes       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 2.2 Tokens de acceso (AUTENTICACIÓN) --------------------------------
-- Solo se guarda el HASH del token (HMAC-SHA256). El token en claro se
-- muestra una única vez al emitirlo.
CREATE TABLE IF NOT EXISTS access_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES allowed_users(id) ON DELETE CASCADE,
  token_hash  TEXT    NOT NULL UNIQUE,
  token_prefix TEXT   NOT NULL,            -- primeros caracteres, solo para identificarlo en listados
  label       TEXT,
  scopes      TEXT,                        -- NULL = todos los del rol; si no, lista separada por comas
  status      TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  issued_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT    NOT NULL,
  revoked_at  TEXT,
  revoked_reason TEXT,
  last_used_at TEXT,
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON access_tokens(user_id);

-- 2.3 Usuarios OAuth ---------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  provider         TEXT    NOT NULL,
  provider_user_id TEXT    NOT NULL,
  email            TEXT    COLLATE NOCASE,
  name             TEXT,
  allowed_user_id  INTEGER REFERENCES allowed_users(id) ON DELETE SET NULL,
  is_authorized    INTEGER NOT NULL DEFAULT 1 CHECK (is_authorized IN (0,1)),
  linked_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at    TEXT,
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_email ON oauth_users(email);

-- 2.4 Tabla de datos de prueba ----------------------------------------
CREATE TABLE IF NOT EXISTS test_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name  TEXT    NOT NULL,
  last_name   TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  birth_date  TEXT,                         -- YYYY-MM-DD (opcional)
  short_text  TEXT,                         -- texto corto (opcional)
  description TEXT,                         -- descripción extensa (opcional)
  quantity    INTEGER NOT NULL DEFAULT 0,   -- entero
  amount      REAL,                         -- decimal (opcional)
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  category    TEXT    NOT NULL DEFAULT 'general',
  notes       TEXT,                         -- observaciones (opcional)
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_records_category ON test_records(category);
CREATE INDEX IF NOT EXISTS idx_records_name ON test_records(last_name, first_name);

-- Auditoría (sin secretos) --------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  event     TEXT NOT NULL,
  user_id   INTEGER,
  outcome   TEXT NOT NULL,
  detail    TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
