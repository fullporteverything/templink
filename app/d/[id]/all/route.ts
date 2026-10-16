import archiver from "archiver";
import { PassThrough, Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { clientIp } from "@/lib/auth";
import { contentDisposition, getFiles, objectPath, ZIP_MAX_BYTES } from "@/lib/collections";
import { gate, recordDownload, SECURITY_HEADERS } from "@/lib/serve";
import { readStream } from "@/lib/storage";

// Zips stream through the function, so give large ones room (Vercel's limit on the plan applies).
export const maxDuration = 300;

/** Stream every file in the link as one zip (stored, not recompressed, so it starts instantly). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if (!g.ok) return g.res;
  if (g.c.total_size > ZIP_MAX_BYTES) return new Response("Too large to zip. Download files individually.", { status: 413 });

  const files = await getFiles(id);
  if (files.length === 0) return new Response("No files.", { status: 404 });
  if (!(await recordDownload(id, null, await clientIp(), req.headers.get("user-agent")))) {
    return new Response("This link has reached its download limit.", { status: 410 });
  }

  const zip = archiver("zip", { store: true });
  const out = new PassThrough();
  zip.on("error", (err: Error) => out.destroy(err));
  zip.pipe(out);

  // Add files one after another; each source stream is opened only when its turn comes.
  void (async () => {
    const used = new Map<string, number>();
    try {
      for (const f of files) {
        const n = used.get(f.name) ?? 0;
        used.set(f.name, n + 1);
        const name = n === 0 ? f.name : f.name.replace(/(\.[^.]*)?$/, ` (${n})$1`);
        const body = Readable.fromWeb((await readStream(objectPath(id, f.id))) as unknown as WebReadableStream);
        zip.append(body, { name });
        await new Promise<void>((resolve, reject) => {
          body.once("end", resolve);
          body.once("error", reject);
        });
      }
      await zip.finalize();
    } catch (e) {
      out.destroy(e as Error);
    }
  })();

  const zipName = `${(g.c.title || id).replace(/[^\w .-]/g, "_").slice(0, 80)}.zip`;
  return new Response(Readable.toWeb(out) as ReadableStream, {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(zipName, false),
    },
  });
}
