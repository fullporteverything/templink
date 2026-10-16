import type { Metadata } from "next";
import Link from "next/link";
import { isUnlocked } from "@/lib/auth";
import { availability, getCollection, getFiles, inlineSafe } from "@/lib/collections";
import { run } from "@/lib/db";
import { fileKind, formatBytes } from "@/lib/format";
import { FileIcon, IconClock, IconDownload, IconEye } from "@/components/icons";
import { Countdown, PasswordGate, ReportButton } from "@/components/ShareClient";

export const metadata: Metadata = { title: "Shared files", robots: { index: false } };

const REASONS: Record<string, [string, string]> = {
  missing: ["Link not found", "Double-check the address. Links are case-sensitive."],
  expired: ["This link has expired", "The files were deleted automatically. Ask the sender for a new link."],
  deleted: ["This link was deleted", "The sender removed these files."],
  disabled: ["This link is unavailable", "It has been disabled by the site administrators."],
  limit: ["Download limit reached", "This link allowed a limited number of downloads and they've all been used."],
  uploading: ["Still uploading", "The sender hasn't finished uploading yet. Try again in a moment."],
};

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCollection(id);
  const a = availability(c);

  if (!a.ok || !c) {
    const [title, body] = REASONS[a.ok ? "missing" : a.reason];
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-surface-2 text-muted">
          <IconClock size={26} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted">{body}</p>
        <Link href="/" className="btn-primary mt-8">
          Send your own files
        </Link>
      </div>
    );
  }

  const locked = !!c.password_hash && !(await isUnlocked(id));
  if (!locked) run("UPDATE collections SET views = views + 1 WHERE id = ?", id);
  const files = locked ? [] : getFiles(id);
  const left = c.max_downloads != null ? c.max_downloads - c.download_count : null;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-16 sm:px-6 sm:pt-12">
      <div className="card rise overflow-hidden">
        <div className="border-b border-line p-6 sm:p-8">
          <p className="text-sm text-muted">Someone shared {locked ? "files" : `${c.file_count} file${c.file_count === 1 ? "" : "s"}`} with you</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words sm:text-3xl">
            {c.title || (locked ? "Protected files" : files.length === 1 ? files[0].name : `${files.length} files`)}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="chip">
              <IconClock size={12} /> Expires in <Countdown until={c.expires_at} />
            </span>
            {!locked && <span className="chip">{formatBytes(c.total_size)}</span>}
            {left != null && (
              <span className="chip">
                {left} download{left === 1 ? "" : "s"} left
              </span>
            )}
          </div>
          {c.message && !locked && (
            <p className="mt-5 rounded-xl bg-surface-2 p-4 text-sm whitespace-pre-wrap">{c.message}</p>
          )}
        </div>

        {locked ? (
          <PasswordGate id={id} />
        ) : (
          <>
            <ul>
              {files.map((f) => {
                const kind = fileKind(f.mime, f.name);
                const preview = inlineSafe(f.mime);
                return (
                  <li key={f.id} className="border-b border-line last:border-b-0">
                    {kind === "image" && preview && (
                      <a href={`/d/${id}/${f.id}?inline`} target="_blank" rel="noreferrer" className="block bg-surface-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/d/${id}/${f.id}?inline`} alt={f.name} className="mx-auto max-h-80 object-contain" loading="lazy" />
                      </a>
                    )}
                    {kind === "video" && preview && (
                      <video src={`/d/${id}/${f.id}?inline`} controls preload="metadata" className="max-h-96 w-full bg-black" />
                    )}
                    {kind === "audio" && preview && (
                      <div className="px-6 pt-4">
                        <audio src={`/d/${id}/${f.id}?inline`} controls preload="none" className="w-full" />
                      </div>
                    )}
                    <div className="flex items-center gap-3 px-6 py-3.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                        <FileIcon kind={kind} size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.name}</p>
                        <p className="text-xs text-muted">{formatBytes(f.size)}</p>
                      </div>
                      {kind === "pdf" && (
                        <a
                          href={`/d/${id}/${f.id}?inline`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost btn-sm"
                          aria-label={`Preview ${f.name}`}
                        >
                          <IconEye size={15} />
                        </a>
                      )}
                      <a href={`/d/${id}/${f.id}`} className="btn-ghost btn-sm" download>
                        <IconDownload size={15} /> <span className="hidden sm:inline">Download</span>
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
            {files.length > 1 && (
              <div className="border-t border-line p-4 sm:p-6">
                <a href={`/d/${id}/all`} className="btn-primary h-12 w-full text-base" download>
                  <IconDownload size={18} /> Download all as .zip · {formatBytes(c.total_size)}
                </a>
              </div>
            )}
          </>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between px-1 text-xs text-faint">
        <span>Only download files from people you trust.</span>
        <ReportButton id={id} />
      </div>
    </div>
  );
}
