import "server-only";
import { isUnlocked } from "./auth";
import { availability, getCollection } from "./collections";
import { hashIp } from "./crypto";
import { Collection, now, tx } from "./db";

export type Gate = { ok: true; c: Collection } | { ok: false; res: Response };

/** Shared checks for every download: link exists, is live, and is unlocked if it has a password. */
export async function gate(id: string): Promise<Gate> {
  const c = await getCollection(id);
  const a = availability(c);
  if (!a.ok || !c) return { ok: false, res: new Response("This link is no longer available.", { status: 410 }) };
  if (c.password_hash && !(await isUnlocked(id))) {
    return { ok: false, res: new Response("This link is password protected.", { status: 401 }) };
  }
  return { ok: true, c };
}

/**
 * Count a download. Returns false when the link's download limit was reached in the meantime,
 * so two people racing for the last download can't both get it.
 */
export async function recordDownload(collectionId: string, fileId: string | null, ip: string, ua: string | null) {
  return tx(async (q) => {
    const updated = await q.run(
      `UPDATE templink.collections SET download_count = download_count + 1
       WHERE id = ? AND (max_downloads IS NULL OR download_count < max_downloads)`,
      collectionId,
    );
    if (!updated) return false;
    if (fileId) await q.run("UPDATE templink.files SET downloads = downloads + 1 WHERE id = ?", fileId);
    await q.run(
      "INSERT INTO templink.downloads (collection_id, file_id, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?)",
      collectionId,
      fileId,
      hashIp(ip),
      ua?.slice(0, 300) ?? null,
      now(),
    );
    return true;
  });
}

export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
};
