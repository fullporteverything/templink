import "server-only";
import fs from "node:fs";
import path from "node:path";
import { all, Collection, FILES_DIR, FileRow, now, one, run } from "./db";

export const collectionDir = (id: string) => path.join(FILES_DIR, id);
export const filePath = (collectionId: string, fileId: string) => path.join(collectionDir(collectionId), fileId);

export function getCollection(id: string): Collection | undefined {
  if (!/^[A-Za-z0-9]{4,32}$/.test(id)) return undefined;
  return one<Collection>("SELECT * FROM collections WHERE id = ?", id);
}

export function getFiles(collectionId: string): FileRow[] {
  return all<FileRow>("SELECT * FROM files WHERE collection_id = ? ORDER BY created_at, name", collectionId);
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

/** Remove a collection's bytes from disk and mark it with the given terminal status. */
export function purgeCollection(id: string, status: "expired" | "deleted") {
  fs.rmSync(collectionDir(id), { recursive: true, force: true });
  run("UPDATE collections SET status = ?, deleted_at = ? WHERE id = ?", status, now(), id);
}

let lastSweep = 0;

/**
 * Delete files of links that have expired, hit their download limit, or were abandoned mid-upload.
 * Cheap to call often; it only does work once a minute.
 */
export function sweepExpired(force = false): number {
  const t = now();
  if (!force && t - lastSweep < 60_000) return 0;
  lastSweep = t;
  const stale = all<{ id: string }>(
    `SELECT id FROM collections
     WHERE (status IN ('active','disabled') AND (expires_at <= ? OR (max_downloads IS NOT NULL AND download_count >= max_downloads)))
        OR (status = 'uploading' AND created_at <= ?)`,
    t,
    t - 6 * 3600_000,
  );
  for (const { id } of stale) purgeCollection(id, "expired");
  return stale.length;
}

export function storageUsed(): number {
  return (
    one<{ s: number | null }>("SELECT SUM(total_size) AS s FROM collections WHERE status IN ('active','disabled','uploading')")
      ?.s ?? 0
  );
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[\\/]/g, "_").replace(/[\x00-\x1f\x7f]/g, "").trim();
  return (base || "file").slice(0, 200);
}

export function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Types that are safe to render inline on our origin (no HTML, no SVG). */
export function inlineSafe(mime: string): boolean {
  if (mime === "image/svg+xml") return false;
  return (
    /^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(mime) ||
    /^video\/(mp4|webm|ogg|quicktime)$/.test(mime) ||
    /^audio\/(mpeg|mp4|ogg|wav|webm|aac|flac|x-wav)$/.test(mime) ||
    mime === "application/pdf"
  );
}
