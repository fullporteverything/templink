import fs from "node:fs";
import { Readable } from "node:stream";
import { clientIp } from "@/lib/auth";
import { contentDisposition, filePath, inlineSafe } from "@/lib/collections";
import { FileRow, one } from "@/lib/db";
import { gate, recordDownload, SECURITY_HEADERS } from "@/lib/serve";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const g = await gate(id);
  if (!g.ok) return g.res;

  const file = one<FileRow>("SELECT * FROM files WHERE id = ? AND collection_id = ?", fileId, id);
  const path = file && filePath(id, file.id);
  const stat = path && fs.statSync(path, { throwIfNoEntry: false });
  if (!file || !path || !stat) return new Response("File not found.", { status: 404 });

  const url = new URL(req.url);
  const inline = url.searchParams.has("inline") && inlineSafe(file.mime);
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    // Browsers' built-in PDF viewers refuse to run inside a sandboxed document.
    ...(inline && file.mime === "application/pdf" ? { "Content-Security-Policy": "default-src 'none'; object-src 'self'" } : {}),
    "Content-Type": inline ? file.mime : "application/octet-stream",
    "Content-Disposition": contentDisposition(file.name, inline),
    "Accept-Ranges": "bytes",
  };

  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === "" && m[2] === "")) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    if (m[1] === "") {
      start = Math.max(0, stat.size - Number(m[2]));
    } else {
      start = Number(m[1]);
      if (m[2] !== "") end = Math.min(end, Number(m[2]));
    }
    if (start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers["Content-Length"] = String(stat.size === 0 ? 0 : end - start + 1);

  // Count real downloads once: skip previews and resumed range requests.
  if (!inline && start === 0) recordDownload(id, file.id, await clientIp(), req.headers.get("user-agent"));

  if (stat.size === 0) return new Response(null, { status, headers });
  const stream = fs.createReadStream(path, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers });
}
