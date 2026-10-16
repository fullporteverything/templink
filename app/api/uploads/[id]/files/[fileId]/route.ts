import { NextResponse } from "next/server";
import fs from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { filePath, getCollection } from "@/lib/collections";
import { safeEqual } from "@/lib/crypto";
import { FileRow, one } from "@/lib/db";

/** Stream one file's bytes straight to disk. Never buffers the whole file in memory. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const c = getCollection(id);
  const token = req.headers.get("x-upload-token") ?? "";
  if (!c || !safeEqual(token, c.manage_token)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (c.status !== "uploading") return NextResponse.json({ error: "This link is already finished." }, { status: 409 });

  const file = one<FileRow>("SELECT * FROM files WHERE id = ? AND collection_id = ?", fileId, id);
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!req.body) return NextResponse.json({ error: "Empty body." }, { status: 400 });

  const dest = filePath(id, file.id);
  const tmp = `${dest}.part`;
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > file.size) cb(new Error("too-large"));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(req.body as unknown as WebReadableStream), limiter, fs.createWriteStream(tmp));
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    const msg = (e as Error).message === "too-large" ? "File is bigger than declared." : "Upload interrupted.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (received !== file.size) {
    fs.rmSync(tmp, { force: true });
    return NextResponse.json({ error: "Upload incomplete." }, { status: 400 });
  }
  fs.renameSync(tmp, dest);
  return NextResponse.json({ ok: true, size: received });
}
