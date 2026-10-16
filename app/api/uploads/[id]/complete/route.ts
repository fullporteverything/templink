import { NextResponse } from "next/server";
import fs from "node:fs";
import { filePath, getCollection, getFiles } from "@/lib/collections";
import { safeEqual } from "@/lib/crypto";
import { logActivity, upsertContact } from "@/lib/crm";
import { now, run } from "@/lib/db";
import { formatBytes } from "@/lib/format";

/** Mark an upload finished once every reserved file is on disk, and start its expiry clock. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCollection(id);
  const token = req.headers.get("x-upload-token") ?? "";
  if (!c || !safeEqual(token, c.manage_token)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (c.status !== "uploading") return NextResponse.json({ error: "This link is already finished." }, { status: 409 });

  const files = getFiles(id);
  for (const f of files) {
    const stat = fs.statSync(filePath(id, f.id), { throwIfNoEntry: false });
    if (!stat || stat.size !== f.size) {
      return NextResponse.json({ error: `"${f.name}" didn't finish uploading.` }, { status: 400 });
    }
  }

  const t = now();
  const expiresAt = t + (c.expires_at - c.created_at);
  let contactId: number | null = null;
  if (c.uploader_email) {
    const contact = upsertContact(c.uploader_email, { source: "upload" });
    contactId = contact.id;
    logActivity(
      contact.id,
      "upload",
      `Shared ${files.length} file${files.length === 1 ? "" : "s"} (${formatBytes(c.total_size)})${c.title ? ` — ${c.title}` : ""}`,
      id,
    );
  }
  run("UPDATE collections SET status = 'active', expires_at = ?, contact_id = ? WHERE id = ?", expiresAt, contactId, id);

  return NextResponse.json({ id, url: `/s/${id}`, manageUrl: `/manage/${id}?k=${encodeURIComponent(c.manage_token)}`, expiresAt });
}
