import { clientIp } from "@/lib/auth";
import { inlineSafe, objectPath } from "@/lib/collections";
import { FileRow, one } from "@/lib/db";
import { gate, recordDownload, SECURITY_HEADERS } from "@/lib/serve";
import { signedUrl } from "@/lib/storage";

/**
 * Checks access, counts the download, then redirects to a short-lived Supabase Storage URL.
 * The bytes (and range requests for resuming or video seeking) are served by Supabase's CDN.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const g = await gate(id);
  if (!g.ok) return g.res;

  const file = await one<FileRow>("SELECT * FROM templink.files WHERE id = ? AND collection_id = ?", fileId, id);
  if (!file) return new Response("File not found.", { status: 404 });

  const inline = new URL(req.url).searchParams.has("inline") && inlineSafe(file.mime);
  if (!inline && !(await recordDownload(id, file.id, await clientIp(), req.headers.get("user-agent")))) {
    return new Response("This link has reached its download limit.", { status: 410 });
  }

  const url = await signedUrl(objectPath(id, file.id), {
    download: inline ? undefined : file.name,
    expiresIn: inline ? 600 : 6 * 3600,
  });
  return new Response(null, { status: 302, headers: { ...SECURITY_HEADERS, Location: url } });
}
