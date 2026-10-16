import "server-only";
import postgres from "postgres";

/**
 * Postgres access (Supabase). Every table lives in the `templink` schema so the app can share a
 * Supabase project with other apps without name clashes. Timestamps are epoch milliseconds (bigint).
 * The same SQL ships as supabase/migrations/0001_templink.sql for anyone who prefers migrations.
 */
export const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS templink;

CREATE TABLE IF NOT EXISTS templink.contacts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL,
  name          text,
  company       text,
  phone         text,
  status        text NOT NULL DEFAULT 'lead',
  tags          text NOT NULL DEFAULT '',
  source        text NOT NULL DEFAULT 'manual',
  value_cents   bigint NOT NULL DEFAULT 0,
  created_at    bigint NOT NULL,
  updated_at    bigint NOT NULL,
  last_seen_at  bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email ON templink.contacts (lower(email));

CREATE TABLE IF NOT EXISTS templink.collections (
  id             text PRIMARY KEY,
  status         text NOT NULL DEFAULT 'uploading',
  title          text,
  message        text,
  password_hash  text,
  max_downloads  bigint,
  download_count bigint NOT NULL DEFAULT 0,
  views          bigint NOT NULL DEFAULT 0,
  file_count     bigint NOT NULL DEFAULT 0,
  total_size     bigint NOT NULL DEFAULT 0,
  uploader_email text,
  uploader_ip    text,
  contact_id     bigint REFERENCES templink.contacts(id) ON DELETE SET NULL,
  manage_token   text NOT NULL,
  created_at     bigint NOT NULL,
  expires_at     bigint NOT NULL,
  deleted_at     bigint
);
CREATE INDEX IF NOT EXISTS collections_status ON templink.collections (status, expires_at);
CREATE INDEX IF NOT EXISTS collections_contact ON templink.collections (contact_id);
CREATE INDEX IF NOT EXISTS collections_ip ON templink.collections (uploader_ip, created_at);

CREATE TABLE IF NOT EXISTS templink.files (
  id            text PRIMARY KEY,
  collection_id text NOT NULL REFERENCES templink.collections(id) ON DELETE CASCADE,
  name          text NOT NULL,
  size          bigint NOT NULL,
  mime          text NOT NULL,
  downloads     bigint NOT NULL DEFAULT 0,
  created_at    bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS files_collection ON templink.files (collection_id);

CREATE TABLE IF NOT EXISTS templink.downloads (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  collection_id text NOT NULL,
  file_id       text,
  ip            text,
  user_agent    text,
  created_at    bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS downloads_time ON templink.downloads (created_at);
CREATE INDEX IF NOT EXISTS downloads_collection ON templink.downloads (collection_id, created_at);

CREATE TABLE IF NOT EXISTS templink.activities (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id  bigint NOT NULL REFERENCES templink.contacts(id) ON DELETE CASCADE,
  type        text NOT NULL,
  body        text NOT NULL DEFAULT '',
  ref         text,
  created_at  bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS activities_contact ON templink.activities (contact_id, created_at);

CREATE TABLE IF NOT EXISTS templink.messages (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          text NOT NULL,
  status        text NOT NULL DEFAULT 'open',
  name          text,
  email         text,
  subject       text,
  body          text NOT NULL,
  collection_id text,
  contact_id    bigint REFERENCES templink.contacts(id) ON DELETE SET NULL,
  ip            text,
  created_at    bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_status ON templink.messages (status, created_at);

CREATE TABLE IF NOT EXISTS templink.settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Rate-limit hits, shared across serverless instances.
CREATE TABLE IF NOT EXISTS templink.hits (
  key        text NOT NULL,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS hits_key ON templink.hits (key, created_at);

-- v2: coarse location (city level, from Vercel's edge headers) for the live globe and ticker.
ALTER TABLE templink.collections ADD COLUMN IF NOT EXISTS geo_city text;
ALTER TABLE templink.collections ADD COLUMN IF NOT EXISTS geo_country text;
ALTER TABLE templink.collections ADD COLUMN IF NOT EXISTS geo_lat double precision;
ALTER TABLE templink.collections ADD COLUMN IF NOT EXISTS geo_lon double precision;
ALTER TABLE templink.downloads ADD COLUMN IF NOT EXISTS geo_city text;
ALTER TABLE templink.downloads ADD COLUMN IF NOT EXISTS geo_country text;
ALTER TABLE templink.downloads ADD COLUMN IF NOT EXISTS geo_lat double precision;
ALTER TABLE templink.downloads ADD COLUMN IF NOT EXISTS geo_lon double precision;

-- The app connects to Postgres directly. Keep these tables away from Supabase's public API roles.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contacts','collections','files','downloads','activities','messages','settings','hits'] LOOP
    EXECUTE format('ALTER TABLE templink.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA templink FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA templink FROM anon, authenticated;
  END IF;
END $$;
`;

type Sql = postgres.Sql<Record<string, never>>;

const g = globalThis as unknown as { __tlSql?: Sql; __tlReady?: Promise<void> };

function client(): Sql {
  if (!g.__tlSql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("Set DATABASE_URL (or POSTGRES_URL) to your Supabase Postgres connection string.");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    g.__tlSql = postgres(url, {
      // Supabase's transaction pooler (port 6543) doesn't support prepared statements.
      prepare: false,
      max: process.env.VERCEL ? 1 : 5,
      idle_timeout: 20,
      ssl: local || /sslmode=disable/.test(url) ? false : "require",
      onnotice: () => {},
      types: {
        // bigint columns and COUNT(*) come back as JS numbers; every value we store fits.
        bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      },
    }) as unknown as Sql;
  }
  return g.__tlSql;
}

/** Bump when SCHEMA_SQL changes; every statement in it must stay idempotent. */
const SCHEMA_VERSION = "2";

/** Create or upgrade the schema on first use, so a Supabase project needs no manual setup. */
function ready(): Promise<void> {
  if (!g.__tlReady) {
    g.__tlReady = (async () => {
      const sql = client();
      const [row] = await sql.unsafe(
        `SELECT CASE WHEN to_regclass('templink.settings') IS NULL THEN NULL
                ELSE (SELECT value FROM templink.settings WHERE key = '_schema') END AS v`,
      );
      if (row?.v === JSON.stringify(SCHEMA_VERSION)) return;
      await sql.unsafe(SCHEMA_SQL);
      await sql.unsafe(
        `INSERT INTO templink.settings (key, value) VALUES ('_schema', $1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        [JSON.stringify(SCHEMA_VERSION)],
      );
    })().catch((e) => {
      g.__tlReady = undefined;
      throw e;
    });
  }
  return g.__tlReady;
}

export type Param = string | number | null;

/** Turn `?` placeholders into `$1, $2, …`. Our SQL never contains a literal question mark. */
function numbered(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

export type Q = {
  all<T>(text: string, ...params: Param[]): Promise<T[]>;
  one<T>(text: string, ...params: Param[]): Promise<T | undefined>;
  run(text: string, ...params: Param[]): Promise<number>;
};

function executor(sql: Sql | postgres.TransactionSql<Record<string, never>>): Q {
  const exec = (text: string, params: Param[]) => sql.unsafe(numbered(text), params as never[]);
  return {
    async all<T>(text: string, ...params: Param[]) {
      return (await exec(text, params)).map((r) => ({ ...r }) as T);
    },
    async one<T>(text: string, ...params: Param[]) {
      const [row] = await exec(text, params);
      return row ? ({ ...row } as T) : undefined;
    },
    async run(text: string, ...params: Param[]) {
      return (await exec(text, params)).count;
    },
  };
}

export async function all<T>(text: string, ...params: Param[]): Promise<T[]> {
  await ready();
  return executor(client()).all<T>(text, ...params);
}

export async function one<T>(text: string, ...params: Param[]): Promise<T | undefined> {
  await ready();
  return executor(client()).one<T>(text, ...params);
}

export async function run(text: string, ...params: Param[]): Promise<number> {
  await ready();
  return executor(client()).run(text, ...params);
}

export async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  await ready();
  return client().begin((t) => fn(executor(t))) as Promise<T>;
}

/** COUNT(*) shorthand. */
export async function count(text: string, ...params: Param[]): Promise<number> {
  return (await one<{ n: number }>(text, ...params))?.n ?? 0;
}

export const now = () => Date.now();

export * from "./types";
