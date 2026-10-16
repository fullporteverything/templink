import "server-only";
import { all, Collection, FileRow, now, one, run } from "./db";
import { removeFolder } from "./storage";

/** Largest link we zip on the fly; bigger links download file by file. */
export const ZIP_MAX_BYTES = 2 * 1024 ** 3;

/** Object key of a file in the storage bucket. */
export const objectPath = (collectionId: string, fileId: string) => `${collectionId}/${fileId}`;

export async function getCollection(id: string): Promise<Collection | undefined> {
  if (!/^[A-Za-z0-9]{4,32}$/.test(id)) return undefined;
  return one<Collection>("SELECT * FROM templink.collections WHERE id = ?", id);
}

export function getFiles(collectionId: string): Promise<FileRow[]> {
  return all<FileRow>("SELECT * FROM templink.files WHERE collection_id = ? ORDER BY created_at, name", collectionId);
}

export type Availability =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "deleted" | "disabled" | "limit" | "uploading" };

export function availability(c: Collection | undefined): Availability {
  if (!c) return { ok: false, reason: "missing" };
  if (c.status === "deleted") return { ok: false, reason: "deleted" };
  if (c.status === "disabled") return { ok: false, reason: "disabled" };
  if (c.status === "uploading") return { ok: false, reason: "uploading" };
  if (c.status === "expired" || c.expires_at <= now()) return { ok: false, reason: "expired" };
  if (c.max_downloads != null && c.download_count >= c.max_downloads) return { ok: false, reason: "limit" };
  return { ok: true };
}

/** Remove a collection's files from storage and mark it with the given terminal status. */
export async function purgeCollection(id: string, status: "expired" | "deleted") {
  await removeFolder(id);
  await run("UPDATE templink.collections SET status = ?, deleted_at = ? WHERE id = ?", status, now(), id);
}

const g = globalThis as unknown as { __tlLastSweep?: number };

/**
 * Delete files of links that expired, hit their download limit, or were abandoned mid-upload.
 * Runs from the daily cron and opportunistically on busy routes (at most once a minute per instance).
 */
export async function sweepExpired(force = false): Promise<number> {
  const t = now();
  if (!force && t - (g.__tlLastSweep ?? 0) < 60_000) return 0;
  g.__tlLastSweep = t;
  const stale = await all<{ id: string }>(
    `SELECT id FROM templink.collections
     WHERE (status IN ('active','disabled') AND (expires_at <= ? OR (max_downloads IS NOT NULL AND download_count >= max_downloads)))
        OR (status = 'uploading' AND created_at <= ?)
     LIMIT 200`,
    t,
    t - 26 * 3600_000,
  );
  for (const { id } of stale) {
    try {
      await purgeCollection(id, "expired");
    } catch (e) {
      console.error(`[templink] could not purge ${id}`, e);
    }
  }
  await run("DELETE FROM templink.hits WHERE created_at < ?", t - 2 * 86_400_000);
  return stale.length;
}

export async function storageUsed(): Promise<number> {
  const row = await one<{ s: number | null }>(
    "SELECT SUM(total_size)::float8 AS s FROM templink.collections WHERE status IN ('active','disabled','uploading')",
  );
  return row?.s ?? 0;
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[\\/]/g, "_").replace(/[\x00-\x1f\x7f]/g, "").trim();
  return (base || "file").slice(0, 200);
}

export function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Types we preview on the share page. */
export function inlineSafe(mime: string): boolean {
  if (mime === "image/svg+xml") return false;
  return (
    /^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(mime) ||
    /^video\/(mp4|webm|ogg|quicktime)$/.test(mime) ||
    /^audio\/(mpeg|mp4|ogg|wav|webm|aac|flac|x-wav)$/.test(mime) ||
    mime === "application/pdf"
  );
}
