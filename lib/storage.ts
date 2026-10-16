import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * File bytes live in a private Supabase Storage bucket. Browsers upload straight to Supabase with
 * one-time signed tokens (resumable TUS), and downloads are short-lived signed URLs, so file data
 * never passes through a Vercel function.
 */

export const BUCKET = process.env.SUPABASE_BUCKET || "templink-files";

const g = globalThis as unknown as { __tlSupa?: SupabaseClient; __tlBucket?: Promise<void> };

function env(...names: string[]): string | undefined {
  for (const n of names) if (process.env[n]) return process.env[n];
}

export function supabaseUrl(): string {
  const url = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  if (!url) throw new Error("Set SUPABASE_URL to your Supabase project URL.");
  return url.replace(/\/+$/, "");
}

/** Public (publishable / anon) key. Safe to hand to browsers; the upload endpoint requires it. */
export function publishableKey(): string {
  const key = env(
    "SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
  if (!key) throw new Error("Set SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY).");
  return key;
}

function supa(): SupabaseClient {
  if (!g.__tlSupa) {
    const key = env("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
    if (!key) throw new Error("Set SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
    g.__tlSupa = createClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return g.__tlSupa;
}

const bucket = () => supa().storage.from(BUCKET);

/** Create the private bucket the first time it's needed. */
async function ensureBucket() {
  if (!g.__tlBucket) {
    g.__tlBucket = (async () => {
      const { error } = await supa().storage.getBucket(BUCKET);
      if (!error) return;
      const res = await supa().storage.createBucket(BUCKET, { public: false });
      if (res.error && !/already exists/i.test(res.error.message)) throw res.error;
    })().catch((e) => {
      g.__tlBucket = undefined;
      throw e;
    });
  }
  return g.__tlBucket;
}

/**
 * Supabase recommends the direct storage hostname for large uploads:
 * https://<ref>.supabase.co → https://<ref>.storage.supabase.co
 */
function uploadHost(): string {
  const url = supabaseUrl();
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(url);
  return m ? `https://${m[1]}.storage.supabase.co` : url;
}

export type UploadTarget = {
  endpoint: string;
  apikey: string;
  token: string;
  bucket: string;
  objectName: string;
};

export async function uploadTarget(objectName: string): Promise<UploadTarget> {
  await ensureBucket();
  const { data, error } = await bucket().createSignedUploadUrl(objectName);
  if (error || !data) throw new Error(`Storage: ${error?.message ?? "could not sign upload"}`);
  return {
    endpoint: `${uploadHost()}/storage/v1/upload/resumable/sign`,
    apikey: publishableKey(),
    token: data.token,
    bucket: BUCKET,
    objectName,
  };
}

/** Sizes of the objects under a folder, keyed by object name. */
export async function folderSizes(folder: string): Promise<Map<string, number>> {
  const { data, error } = await bucket().list(folder, { limit: 1000 });
  if (error) throw new Error(`Storage: ${error.message}`);
  return new Map((data ?? []).map((o) => [o.name, Number(o.metadata?.size ?? -1)]));
}

/** A short-lived URL for one object. Pass a filename to force a download with that name. */
export async function signedUrl(path: string, opts: { download?: string; expiresIn?: number } = {}): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, opts.expiresIn ?? 3600, {
    download: opts.download ?? false,
  });
  if (error || !data) throw new Error(`Storage: ${error?.message ?? "could not sign url"}`);
  return data.signedUrl;
}

/** Delete every object in a folder. */
export async function removeFolder(folder: string): Promise<void> {
  for (;;) {
    const { data, error } = await bucket().list(folder, { limit: 1000 });
    if (error) throw new Error(`Storage: ${error.message}`);
    if (!data?.length) return;
    const { error: rmError } = await bucket().remove(data.map((o) => `${folder}/${o.name}`));
    if (rmError) throw new Error(`Storage: ${rmError.message}`);
    if (data.length < 1000) return;
  }
}

/** Stream one object's bytes (used to build zips). */
export async function readStream(path: string): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(await signedUrl(path, { expiresIn: 600 }));
  if (!res.ok || !res.body) throw new Error(`Storage: download failed (${res.status})`);
  return res.body;
}
