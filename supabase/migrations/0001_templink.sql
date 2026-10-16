-- Templink schema (v2). The app also applies this automatically on first run.
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

-- Private bucket for uploaded files (the app creates it too if missing).
INSERT INTO storage.buckets (id, name, public) VALUES ('templink-files', 'templink-files', false)
ON CONFLICT (id) DO NOTHING;
