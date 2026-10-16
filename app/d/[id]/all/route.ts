import archiver from "archiver";
import fs from "node:fs";
import { PassThrough, Readable } from "node:stream";
import { clientIp } from "@/lib/auth";
import { contentDisposition, filePath, getFiles } from "@/lib/collections";
import { gate, recordDownload, SECURITY_HEADERS } from "@/lib/serve";

/** Stream every file in the link as one zip (stored, not recompressed, so it starts instantly). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if (!g.ok) return g.res;

  const files = getFiles(id).filter((f) => fs.existsSync(filePath(id, f.id)));
  if (files.length === 0) return new Response("No files.", { status: 404 });

  const zip = archiver("zip", { store: true, forceZip64: g.c.total_size > 0xfffffff0 });
  const out = new PassThrough();
  zip.on("error", (err) => out.destroy(err));
  zip.pipe(out);

  const used = new Map<string, number>();
  for (const f of files) {
    // Keep names unique inside the archive.
    const n = used.get(f.name) ?? 0;
    used.set(f.name, n + 1);
    const name = n === 0 ? f.name : f.name.replace(/(\.[^.]*)?$/, ` (${n})$1`);
    zip.file(filePath(id, f.id), { name });
  }
  void zip.finalize();

  recordDownload(id, null, await clientIp(), req.headers.get("user-agent"));
  const zipName = `${(g.c.title || id).replace(/[^\w .-]/g, "_").slice(0, 80)}.zip`;
  return new Response(Readable.toWeb(out) as ReadableStream, {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(zipName, false),
    },
  });
}
