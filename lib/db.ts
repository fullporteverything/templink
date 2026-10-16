import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR || "data");
export const FILES_DIR = path.join(DATA_DIR, "files");

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contacts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT,
  company       TEXT,
  phone         TEXT,
  status        TEXT NOT NULL DEFAULT 'lead',
  tags          TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'manual',
  value_cents   INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_seen_at  INTEGER
);

CREATE TABLE IF NOT EXISTS collections (
  id             TEXT PRIMARY KEY,
  status         TEXT NOT NULL DEFAULT 'uploading',
  title          TEXT,
  message        TEXT,
  password_hash  TEXT,
  max_downloads  INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0,
  views          INTEGER NOT NULL DEFAULT 0,
  file_count     INTEGER NOT NULL DEFAULT 0,
  total_size     INTEGER NOT NULL DEFAULT 0,
  uploader_email TEXT,
  uploader_ip    TEXT,
  contact_id     INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  manage_token   TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  deleted_at     INTEGER
);
CREATE INDEX IF NOT EXISTS collections_status ON collections(status, expires_at);
CREATE INDEX IF NOT EXISTS collections_contact ON collections(contact_id);

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  mime          TEXT NOT NULL,
  downloads     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS files_collection ON files(collection_id);

CREATE TABLE IF NOT EXISTS downloads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id TEXT NOT NULL,
  file_id       TEXT,
  ip            TEXT,
  user_agent    TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS downloads_time ON downloads(created_at);

CREATE TABLE IF NOT EXISTS activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  ref         TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS activities_contact ON activities(contact_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  name          TEXT,
  email         TEXT,
  subject       TEXT,
  body          TEXT NOT NULL,
  collection_id TEXT,
  contact_id    INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  ip            TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_status ON messages(status, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const g = globalThis as unknown as { __templinkDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__templinkDb) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
    const conn = new DatabaseSync(path.join(DATA_DIR, "templink.db"));
    conn.exec(SCHEMA);
    g.__templinkDb = conn;
  }
  return g.__templinkDb;
}

type Param = string | number | bigint | null | Uint8Array;

// node:sqlite returns null-prototype rows; copy them so they can be passed to Client Components.
export function one<T>(sql: string, ...params: Param[]): T | undefined {
  const row = db().prepare(sql).get(...params);
  return row ? ({ ...row } as T) : undefined;
}

export function all<T>(sql: string, ...params: Param[]): T[] {
  return db()
    .prepare(sql)
    .all(...params)
    .map((row) => ({ ...row }) as T);
}

export function run(sql: string, ...params: Param[]) {
  return db().prepare(sql).run(...params);
}

export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

export const now = () => Date.now();

export * from "./types";
