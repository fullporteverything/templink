import "server-only";
import { isUnlocked } from "./auth";
import { availability, getCollection } from "./collections";
import { hashIp } from "./crypto";
import { Collection, now, run, tx } from "./db";

export type Gate = { ok: true; c: Collection } | { ok: false; res: Response };

/** Shared checks for every download: link exists, is live, and is unlocked if it has a password. */
export async function gate(id: string): Promise<Gate> {
  const c = getCollection(id);
  const a = availability(c);
  if (!a.ok || !c) return { ok: false, res: new Response("This link is no longer available.", { status: 410 }) };
  if (c.password_hash && !(await isUnlocked(id))) {
    return { ok: false, res: new Response("This link is password protected.", { status: 401 }) };
  }
  return { ok: true, c };
}

export function recordDownload(collectionId: string, fileId: string | null, ip: string, ua: string | null) {
  tx(() => {
    run("UPDATE collections SET download_count = download_count + 1 WHERE id = ?", collectionId);
    if (fileId) run("UPDATE files SET downloads = downloads + 1 WHERE id = ?", fileId);
    run(
      "INSERT INTO downloads (collection_id, file_id, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?)",
      collectionId,
      fileId,
      hashIp(ip),
      ua?.slice(0, 300) ?? null,
      now(),
    );
  });
}

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
};
