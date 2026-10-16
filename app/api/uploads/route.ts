import { NextResponse } from "next/server";
import fs from "node:fs";
import { clientIp } from "@/lib/auth";
import { collectionDir, sanitizeFilename, sweepExpired } from "@/lib/collections";
import { hashIp, hashPassword, randomId, randomToken } from "@/lib/crypto";
import { isBlockedEmail } from "@/lib/crm";
import { now, one, run, tx } from "@/lib/db";
import { isEmail } from "@/lib/format";
import { getSettings } from "@/lib/settings";

type Body = {
  files?: { name?: unknown; size?: unknown; type?: unknown }[];
  expiryHours?: unknown;
  password?: unknown;
  maxDownloads?: unknown;
  email?: unknown;
  title?: unknown;
  message?: unknown;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Create a link and reserve its files. The client then PUTs each file's bytes. */
export async function POST(req: Request) {
  sweepExpired();
  const settings = getSettings();
  if (!settings.uploadsEnabled) return bad("Uploads are paused right now. Try again later.", 503);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request.");
  }

  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) return bad("Add at least one file.");
  if (files.length > settings.maxFilesPerLink) return bad(`You can send up to ${settings.maxFilesPerLink} files per link.`);

  const maxBytes = settings.maxFileSizeMb * 1024 * 1024;
  const parsed: { id: string; name: string; size: number; type: string }[] = [];
  for (const f of files) {
    const size = Number(f.size);
    const name = sanitizeFilename(String(f.name ?? "file"));
    if (!Number.isSafeInteger(size) || size < 0) return bad("Invalid file size.");
    if (size > maxBytes) return bad(`"${name}" is larger than the ${settings.maxFileSizeMb} MB limit.`);
    const type = typeof f.type === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(f.type) ? f.type : "application/octet-stream";
    parsed.push({ id: randomId(12), name, size, type });
  }

  const hours = Number(body.expiryHours ?? settings.defaultExpiryHours);
  if (!settings.expiryOptionsHours.includes(hours)) return bad("Pick one of the offered expiry times.");

  const email = str(body.email, 200).toLowerCase();
  if (email && !isEmail(email)) return bad("That email address doesn't look right.");
  if (email && isBlockedEmail(email)) return bad("This address can't upload files.", 403);

  let maxDownloads: number | null = null;
  if (body.maxDownloads !== undefined && body.maxDownloads !== null && body.maxDownloads !== "") {
    maxDownloads = Number(body.maxDownloads);
    if (!Number.isInteger(maxDownloads) || maxDownloads < 1 || maxDownloads > 100000) return bad("Invalid download limit.");
  }

  const password = str(body.password, 200);
  const ip = hashIp(await clientIp());
  const recent =
    one<{ n: number }>("SELECT COUNT(*) AS n FROM collections WHERE uploader_ip = ? AND created_at > ?", ip, now() - 86_400_000)
      ?.n ?? 0;
  if (recent >= settings.uploadsPerIpPerDay) return bad("Daily upload limit reached. Try again tomorrow.", 429);

  const id = randomId(10);
  const token = randomToken();
  const t = now();
  const totalSize = parsed.reduce((s, f) => s + f.size, 0);

  tx(() => {
    run(
      `INSERT INTO collections (id, status, title, message, password_hash, max_downloads, file_count, total_size,
         uploader_email, uploader_ip, manage_token, created_at, expires_at)
       VALUES (?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      str(body.title, 120) || null,
      str(body.message, 1000) || null,
      password ? hashPassword(password) : null,
      maxDownloads,
      parsed.length,
      totalSize,
      email || null,
      ip,
      token,
      t,
      t + hours * 3600_000,
    );
    for (const f of parsed) {
      run(
        "INSERT INTO files (id, collection_id, name, size, mime, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        f.id,
        id,
        f.name,
        f.size,
        f.type,
        t,
      );
    }
  });
  fs.mkdirSync(collectionDir(id), { recursive: true });

  return NextResponse.json({ id, token, files: parsed.map(({ id, name, size }) => ({ id, name, size })) });
}
