import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { isUnlocked } from "@/lib/auth";
import { availability, getCollection, getFiles, inlineSafe, ZIP_MAX_BYTES } from "@/lib/collections";
import { run } from "@/lib/db";
import { fileKind, formatBytes } from "@/lib/format";
import { FileIcon, IconClock, IconDownload, IconEye, IconLock } from "@/components/icons";
import { Countdown, ExpiryBar, PasswordGate, ReportButton } from "@/components/ShareClient";

export const metadata: Metadata = { title: "Shared files", robots: { index: false } };

const REASONS: Record<string, [string, string]> = {
  missing: ["Link not found", "Double-check the address. Links are case-sensitive."],
  expired: ["This link has expired", "The files were deleted automatically. Ask the sender for a new link."],
  deleted: ["This link was deleted", "The sender removed these files."],
  disabled: ["This link is unavailable", "It has been disabled by the site administrators."],
  limit: ["Download limit reached", "This link allowed a limited number of downloads and they've all been used."],
  uploading: ["Still uploading", "The sender hasn't finished uploading yet. Try again in a moment."],
};

const KIND_TINT: Record<string, string> = {
  image: "text-[oklch(0.62_0.15_160)]",
  video: "text-[oklch(0.6_0.17_300)]",
  audio: "text-[oklch(0.65_0.15_50)]",
  pdf: "text-[oklch(0.6_0.18_25)]",
  archive: "text-[oklch(0.62_0.12_80)]",
};

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCollection(id);
  const a = availability(c);

  if (!a.ok || !c) {
    const [title, body] = REASONS[a.ok ? "missing" : a.reason];
    return (
      <div className="dot-grid">
        <div className="mx-auto max-w-md px-4 py-28 text-center sm:px-6">
          <span className="mx-auto grid size-14 place-items-center rounded-full border border-line bg-surface text-muted">
            <IconClock size={26} />
          </span>
          <h1 className="display mt-6 text-4xl">{title}</h1>
          <p className="mt-3 text-muted">{body}</p>
          <Link href="/send" className="btn-ink mt-8 h-11 px-5">
            Send your own files
          </Link>
        </div>
      </div>
    );
  }

  const locked = !!c.password_hash && !(await isUnlocked(id));
  if (!locked) after(() => run("UPDATE templink.collections SET views = views + 1 WHERE id = ?", id).catch(() => {}));
  const files = locked ? [] : await getFiles(id);
  const left = c.max_downloads != null ? c.max_downloads - c.download_count : null;
  const images = files.filter((f) => fileKind(f.mime, f.name) === "image" && inlineSafe(f.mime));
  const gallery = images.length >= 2;
  const canZip = files.length > 1 && c.total_size <= ZIP_MAX_BYTES;
  const title = c.title || (locked ? "Protected files" : files.length === 1 ? files[0].name : `${files.length} files`);

  return (
    <div className={canZip ? "pb-24 sm:pb-0" : ""}>
      <div className="dot-grid border-b border-line">
        <div className="mx-auto max-w-3xl px-4 pt-12 pb-10 sm:px-6 sm:pt-16">
          <p className="eyebrow rise flex items-center gap-2 text-accent">
            {locked ? <IconLock size={12} /> : <span className="live-dot size-1.5 rounded-full bg-accent" />}
            Shared with you
          </p>
          <h1 className="display rise rise-1 mt-4 text-[clamp(2.2rem,6vw,3.75rem)] break-words">{title}</h1>
          <div className="rise rise-2 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted">
            {!locked && (
              <span>
                {c.file_count} file{c.file_count === 1 ? "" : "s"} · {formatBytes(c.total_size)}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <IconClock size={12} /> expires in <Countdown until={c.expires_at} />
            </span>
            {left != null && (
              <span>
                {left} download{left === 1 ? "" : "s"} left
              </span>
            )}
          </div>
          <ExpiryBar from={c.created_at} until={c.expires_at} />
          {c.message && !locked && (
            <blockquote className="rise rise-3 mt-6 border-l-2 border-accent pl-4 text-[15px] leading-relaxed whitespace-pre-wrap text-fg">
              {c.message}
            </blockquote>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {locked ? (
          <div className="card rise overflow-hidden shadow-[var(--shadow-lg)]">
            <PasswordGate id={id} />
          </div>
        ) : (
          <>
            {gallery && (
              <div className={`rise mb-4 grid grid-cols-2 gap-2 ${images.length % 3 === 0 ? "sm:grid-cols-3" : ""}`}>
                {images.map((f) => (
                  <a
                    key={f.id}
                    href={`/d/${id}/${f.id}?inline`}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/d/${id}/${f.id}?inline`}
                      alt={f.name}
                      loading="lazy"
                      className="size-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2.5 pt-6 pb-2 text-xs text-white opacity-0 transition group-hover:opacity-100">
                      {f.name}
                    </span>
                  </a>
                ))}
              </div>
            )}

            <ul className="card rise overflow-hidden shadow-[var(--shadow-lg)]">
              {files.map((f) => {
                const kind = fileKind(f.mime, f.name);
                const preview = inlineSafe(f.mime);
                return (
                  <li key={f.id} className="border-b border-line last:border-b-0">
                    {!gallery && kind === "image" && preview && (
                      <a href={`/d/${id}/${f.id}?inline`} target="_blank" rel="noreferrer" className="dot-grid block bg-surface-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/d/${id}/${f.id}?inline`} alt={f.name} className="mx-auto max-h-96 object-contain" loading="lazy" />
                      </a>
                    )}
                    {kind === "video" && preview && (
                      <video src={`/d/${id}/${f.id}?inline`} controls preload="metadata" className="max-h-[28rem] w-full bg-black" />
                    )}
                    {kind === "audio" && preview && (
                      <div className="px-5 pt-4">
                        <audio src={`/d/${id}/${f.id}?inline`} controls preload="none" className="w-full" />
                      </div>
                    )}
                    <div className="group flex items-center gap-3.5 px-5 py-3.5 transition hover:bg-surface-2/50">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 ${KIND_TINT[kind] ?? "text-muted"}`}>
                        <FileIcon kind={kind} size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.name}</p>
                        <p className="font-mono text-xs text-muted">{formatBytes(f.size)}</p>
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
                      <a href={`/d/${id}/${f.id}`} className="btn-ghost btn-sm group-hover:border-accent/40" download>
                        <IconDownload size={15} /> <span className="hidden sm:inline">Download</span>
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>

            {canZip && (
              <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 p-3 backdrop-blur-xl sm:static sm:mt-4 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                <a href={`/d/${id}/all`} className="btn-ink h-12 w-full text-base" download>
                  <IconDownload size={18} /> Download all · {formatBytes(c.total_size)}
                </a>
              </div>
            )}
          </>
        )}
        <div className="mt-6 flex items-center justify-between px-1 text-xs text-faint">
          <span>Only download files from people you trust.</span>
          <ReportButton id={id} />
        </div>
      </div>
    </div>
  );
}
