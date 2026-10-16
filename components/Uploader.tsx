"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { expiryLabel, fileKind, formatBytes } from "@/lib/format";
import { FileIcon, IconCheck, IconCopy, IconLink, IconLock, IconPlus, IconUpload, IconX } from "./icons";

type Limits = {
  maxFileSizeMb: number;
  maxFilesPerLink: number;
  expiryOptionsHours: number[];
  defaultExpiryHours: number;
  uploadsEnabled: boolean;
};

type Picked = { key: string; file: File };
type Done = { id: string; url: string; manageUrl: string; expiresAt: number; count: number; size: number; title: string };
type Recent = Done & { savedAt: number };
type UploadTarget = { endpoint: string; apikey: string; token: string; bucket: string; objectName: string };

const RECENT_KEY = "templink:recent";

function loadRecent(): Recent[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as Recent[];
    return list.filter((r) => r.expiresAt > Date.now()).slice(0, 8);
  } catch {
    return [];
  }
}

function saveRecent(d: Done) {
  try {
    const list = [{ ...d, savedAt: Date.now() }, ...loadRecent()].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

/** Resumable upload straight to Supabase Storage using a one-time signed token. */
async function sendFile(
  file: File,
  type: string,
  target: UploadTarget,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
) {
  const { Upload } = await import("tus-js-client");
  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: target.endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 6 * 1024 * 1024, // Supabase requires exactly 6 MB chunks
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: { apikey: target.apikey, "x-signature": target.token },
      metadata: { bucketName: target.bucket, objectName: target.objectName, contentType: type, cacheControl: "3600" },
      onProgress: (sent) => onProgress(sent),
      onSuccess: () => {
        onProgress(file.size);
        resolve();
      },
      onError: (err) => {
        const status = (err as { originalResponse?: { getStatus(): number } }).originalResponse?.getStatus();
        reject(new Error(status === 413 ? `"${file.name}" is too large for storage.` : `Upload of "${file.name}" failed.`));
      },
    });
    signal.addEventListener("abort", () => {
      void upload.abort(true);
      reject(new Error("Upload cancelled."));
    });
    upload.start();
  });
}

function eta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${Math.ceil(seconds % 60)}s left`;
  return `${Math.floor(m / 60)}h ${m % 60}m left`;
}

/**
 * `pill` is the compact call to action on the homepage; `panel` is the roomy drop zone used on
 * the dedicated /send page. Both share the same upload flow once files are picked.
 */
export default function Uploader({ limits, variant = "pill" }: { limits: Limits; variant?: "pill" | "panel" }) {
  const [files, setFiles] = useState<Picked[]>([]);
  const [dragDepth, setDragDepth] = useState(0);
  const [expiry, setExpiry] = useState(limits.defaultExpiryHours);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [phase, setPhase] = useState<"pick" | "uploading" | "done">("pick");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [rate, setRate] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sentRef = useRef(0);

  useEffect(() => setRecent(loadRecent()), []);

  const maxBytes = limits.maxFileSizeMb * 1024 * 1024;
  const total = files.reduce((s, f) => s + f.file.size, 0);
  const sent = Object.values(progress).reduce((s, n) => s + n, 0);
  sentRef.current = sent;
  const pct = total ? Math.min(100, (sent / total) * 100) : phase === "uploading" ? 100 : 0;

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      setError("");
      const incoming = Array.from(list);
      const tooBig = incoming.find((f) => f.size > maxBytes);
      if (tooBig) setError(`"${tooBig.name}" is over the ${formatBytes(maxBytes)} per-file limit.`);
      setFiles((prev) => {
        const next = [...prev];
        for (const f of incoming) {
          if (f.size > maxBytes) continue;
          const key = `${f.name}:${f.size}:${f.lastModified}`;
          if (!next.some((p) => p.key === key)) next.push({ key, file: f });
        }
        if (next.length > limits.maxFilesPerLink) {
          setError(`You can send up to ${limits.maxFilesPerLink} files per link.`);
          return next.slice(0, limits.maxFilesPerLink);
        }
        return next;
      });
    },
    [maxBytes, limits.maxFilesPerLink],
  );

  // Paste and drop anywhere on the page.
  useEffect(() => {
    if (phase !== "pick" || !limits.uploadsEnabled) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onPaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files.length) addFiles(e.clipboardData.files);
    };
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragDepth((d) => d + 1);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      setDragDepth((d) => Math.max(0, d - 1));
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragDepth(0);
      if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [addFiles, phase, limits.uploadsEnabled]);

  // Transfer speed, smoothed.
  useEffect(() => {
    if (phase !== "uploading") return;
    let last = sentRef.current;
    let lastT = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const inst = ((sentRef.current - last) / (now - lastT)) * 1000;
      last = sentRef.current;
      lastT = now;
      setRate((r) => (r ? r * 0.7 + inst * 0.3 : inst));
    }, 500);
    return () => clearInterval(t);
  }, [phase]);

  async function start() {
    if (!files.length) return;
    setError("");
    setPhase("uploading");
    setProgress({});
    setRate(0);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({ name: f.file.name, size: f.file.size, type: f.file.type })),
          expiryHours: expiry,
          password: usePassword ? password : "",
          maxDownloads: maxDownloads || null,
          email,
          title,
          message,
        }),
        signal: ac.signal,
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error || "Couldn't start the upload.");

      // Upload three files at a time.
      const queue = files.map((f, i) => ({
        picked: f,
        remote: created.files[i] as { id: string; type: string; upload: UploadTarget },
      }));
      const worker = async () => {
        while (queue.length) {
          const job = queue.shift()!;
          await sendFile(
            job.picked.file,
            job.remote.type,
            job.remote.upload,
            (loaded) => setProgress((p) => ({ ...p, [job.picked.key]: loaded })),
            ac.signal,
          );
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));

      const fin = await fetch(`/api/uploads/${created.id}/complete`, {
        method: "POST",
        headers: { "x-upload-token": created.token },
      });
      const finished = await fin.json();
      if (!fin.ok) throw new Error(finished.error || "Couldn't finish the upload.");

      const d: Done = {
        id: created.id,
        url: `${location.origin}${finished.url}`,
        manageUrl: `${location.origin}${finished.manageUrl}`,
        expiresAt: finished.expiresAt,
        count: files.length,
        size: total,
        title: title || (files.length === 1 ? files[0].file.name : `${files.length} files`),
      };
      saveRecent(d);
      setRecent(loadRecent());
      // Let the live globe/ticker refresh now so the sender sees their own ping.
      window.dispatchEvent(new Event("templink:activity"));
      setDone(d);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("pick");
    } finally {
      abortRef.current = null;
    }
  }

  function reset() {
    setFiles([]);
    setProgress({});
    setDone(null);
    setPassword("");
    setUsePassword(false);
    setMaxDownloads("");
    setTitle("");
    setMessage("");
    setError("");
    setPhase("pick");
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      className="hidden"
      onChange={(e) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  const dropOverlay = dragDepth > 0 && (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-bg/70 p-6 backdrop-blur-sm">
      <div className="grid h-full w-full place-items-center rounded-3xl border-2 border-dashed border-accent bg-accent-soft/40">
        <div className="text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent text-accent-fg">
            <IconUpload size={28} />
          </span>
          <p className="mt-4 text-2xl font-semibold tracking-tight">Drop to add files</p>
        </div>
      </div>
    </div>
  );

  if (!limits.uploadsEnabled) {
    return (
      <div className="card max-w-md p-6">
        <p className="font-medium">Uploads are paused</p>
        <p className="mt-1 text-sm text-muted">We&apos;re doing some maintenance. Existing links still work.</p>
      </div>
    );
  }

  if (phase === "done" && done) return <DoneCard done={done} onAgain={reset} />;

  if (phase === "uploading") {
    const R = 44;
    const C = 2 * Math.PI * R;
    return (
      <div className="card rise p-6 shadow-[var(--shadow-lg)] sm:p-7">
        <div className="flex items-center gap-6">
          <div className="relative size-28 shrink-0">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - pct / 100)}
                className="transition-[stroke-dashoffset] duration-300"
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-2xl font-semibold tabular-nums tracking-tight">
              {Math.floor(pct)}%
            </span>
          </div>
          <div className="min-w-0">
            <p className="eyebrow text-accent">Uploading</p>
            <p className="mt-1 text-lg font-medium tabular-nums">
              {formatBytes(sent)} <span className="text-faint">of</span> {formatBytes(total)}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted tabular-nums">
              {rate > 0 ? `${formatBytes(rate)}/s` : "Starting…"}
              {rate > 0 && ` · ${eta((total - sent) / rate)}`}
            </p>
          </div>
        </div>
        <ul className="mt-6 max-h-52 space-y-2.5 overflow-auto">
          {files.map((f) => {
            const p = f.file.size ? ((progress[f.key] ?? 0) / f.file.size) * 100 : 100;
            return (
              <li key={f.key} className="text-sm">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{f.file.name}</span>
                  {p >= 100 ? (
                    <IconCheck size={14} className="text-ok" />
                  ) : (
                    <span className="font-mono text-xs text-muted tabular-nums">{Math.floor(p)}%</span>
                  )}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${p}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <button className="btn-ghost mt-6 w-full" onClick={() => abortRef.current?.abort()}>
          Cancel
        </button>
      </div>
    );
  }

  // Nothing picked yet, /send page: a big drop zone.
  if (!files.length && variant === "panel") {
    const dragging = dragDepth > 0;
    return (
      <div className="space-y-4">
        {fileInput}
        <button
          onClick={() => inputRef.current?.click()}
          className={`group relative grid min-h-[22rem] w-full place-items-center overflow-hidden rounded-3xl border-2 border-dashed p-8 text-center transition-colors duration-300 ${
            dragging ? "border-accent bg-accent-soft/60" : "border-line bg-surface hover:border-accent/50"
          }`}
        >
          <span className="dot-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(circle_at_center,#000,transparent_70%)]" />
          <span className="relative">
            <span
              className={`mx-auto grid size-20 place-items-center rounded-2xl bg-accent text-accent-fg shadow-[0_18px_40px_-14px_var(--accent)] transition duration-300 ${
                dragging ? "scale-110 rotate-6" : "group-hover:-translate-y-1"
              }`}
            >
              <IconUpload size={32} />
            </span>
            <span className="mt-6 block text-2xl font-semibold tracking-tight">
              {dragging ? "Let go to add them" : "Drop files to start a transfer"}
            </span>
            <span className="mt-2 block text-sm text-muted">
              or <span className="font-medium text-accent underline-offset-4 group-hover:underline">browse your device</span>, or
              paste with <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">Ctrl/⌘ V</kbd>
            </span>
            <span className="mt-6 flex flex-wrap justify-center gap-2 font-mono text-[11px] text-faint">
              <span className="rounded-full border border-line px-2.5 py-1">{formatBytes(maxBytes)} per file</span>
              <span className="rounded-full border border-line px-2.5 py-1">up to {limits.maxFilesPerLink} files</span>
              <span className="rounded-full border border-line px-2.5 py-1">
                expires in {expiryLabel(Math.max(...limits.expiryOptionsHours))} max
              </span>
            </span>
          </span>
        </button>
        {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        {recent.length > 0 && <RecentLinks recent={recent} />}
      </div>
    );
  }

  // Nothing picked yet: the compact call to action.
  if (!files.length) {
    return (
      <div className="space-y-4">
        {dropOverlay}
        {fileInput}
        <button
          onClick={() => inputRef.current?.click()}
          className="group flex w-full max-w-md items-center gap-4 rounded-full border border-dashed border-line bg-surface/80 p-2.5 pr-6 text-left shadow-[var(--shadow-lg)] backdrop-blur transition hover:border-accent/60"
        >
          <span className="relative grid size-16 shrink-0 place-items-center rounded-full bg-accent text-accent-fg transition group-hover:scale-105">
            <span className="ping-soft absolute inset-0 rounded-full bg-accent" />
            <IconPlus size={26} className="relative" />
          </span>
          <span>
            <span className="block text-lg font-semibold tracking-tight">Choose files</span>
            <span className="block text-sm text-muted">or drop / paste anywhere on this page</span>
          </span>
        </button>
        {error && <p className="max-w-md rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        {recent.length > 0 && <RecentLinks recent={recent} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dropOverlay}
      {fileInput}
      <div className="card rise overflow-hidden shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="text-sm font-medium">
            {files.length} file{files.length === 1 ? "" : "s"} <span className="text-faint">·</span>{" "}
            <span className="text-muted">{formatBytes(total)}</span>
          </p>
          <button onClick={() => inputRef.current?.click()} className="btn-ghost btn-sm">
            <IconPlus size={14} /> Add more
          </button>
        </div>
        <ul className="max-h-56 overflow-auto">
          {files.map((f) => (
            <li key={f.key} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-b-0">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                <FileIcon kind={fileKind(f.file.type, f.file.name)} size={15} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{f.file.name}</span>
              <span className="font-mono text-xs text-muted tabular-nums">{formatBytes(f.file.size)}</span>
              <button
                onClick={() => setFiles((all) => all.filter((x) => x.key !== f.key))}
                className="rounded-md p-1 text-faint hover:bg-surface-2 hover:text-fg"
                aria-label={`Remove ${f.file.name}`}
              >
                <IconX size={15} />
              </button>
            </li>
          ))}
        </ul>

        <div className="space-y-4 border-t border-line bg-surface-2/40 p-5">
          <div>
            <span className="label">Link expires after</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 sm:grid-cols-4">
              {limits.expiryOptionsHours.map((h) => (
                <button
                  key={h}
                  onClick={() => setExpiry(h)}
                  className={`h-8 rounded-lg text-sm transition ${
                    expiry === h ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-fg"
                  }`}
                >
                  {expiryLabel(h)}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setMoreOpen((o) => !o)}
            className="text-sm font-medium text-accent hover:underline"
            aria-expanded={moreOpen}
          >
            {moreOpen ? "Hide options" : "Password, download limit, message…"}
          </button>

          {moreOpen && (
            <div className="rise grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={usePassword}
                    onChange={(e) => setUsePassword(e.target.checked)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <IconLock size={15} className="text-muted" /> Protect with a password
                </label>
                {usePassword && (
                  <input
                    className="input mt-2"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Password the recipient must enter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </div>
              <div>
                <label className="label" htmlFor="title">
                  Title
                </label>
                <input
                  id="title"
                  className="input"
                  placeholder="e.g. Final renders"
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="maxdl">
                  Delete after this many downloads
                </label>
                <input
                  id="maxdl"
                  className="input"
                  type="number"
                  min={1}
                  placeholder="No limit"
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="msg">
                  Message for the recipient
                </label>
                <textarea
                  id="msg"
                  className="input"
                  rows={2}
                  maxLength={1000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="email">
                  Your email <span className="text-faint">(optional, so we can reach you about this link)</span>
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
          )}

          {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

          <div className="flex gap-2">
            <button className="btn-ghost h-12" onClick={reset} aria-label="Clear files">
              <IconX size={16} />
            </button>
            <button
              className="btn-primary h-12 flex-1 text-base"
              disabled={!files.length || (usePassword && !password)}
              onClick={start}
            >
              <IconLink size={18} /> Get a link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentLinks({ recent }: { recent: Recent[] }) {
  return (
    <div className="max-w-md rounded-2xl border border-line bg-surface/80 p-3 backdrop-blur">
      <p className="eyebrow px-1 pb-1.5 text-faint">Your recent links</p>
      <ul>
        {recent.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm">
            <a href={r.url} className="min-w-0 flex-1 truncate hover:underline">
              {r.title}
            </a>
            <span className="font-mono text-xs text-faint">{formatBytes(r.size)}</span>
            <a href={r.manageUrl} className="text-xs text-accent hover:underline">
              Manage
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-primary h-11 shrink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
      {copied ? "Copied" : label}
    </button>
  );
}

function QrCode({ text }: { text: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((q) =>
        q.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111113", light: "#ffffff" } }),
      )
      .then((s) => live && setSvg(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [text]);
  return (
    <div
      className="size-28 shrink-0 rounded-xl border border-line bg-white p-2 [&_svg]:size-full"
      role="img"
      aria-label="QR code for the link"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function DoneCard({ done, onAgain }: { done: Done; onAgain: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
    const el = ref.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const expires = new Date(done.expiresAt).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div ref={ref} className="card rise scroll-mt-20 p-6 shadow-[var(--shadow-lg)] sm:p-7">
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <span className="relative grid size-11 place-items-center rounded-full bg-ok/15 text-ok">
            <span className="ping-soft absolute inset-0 rounded-full bg-ok/30" />
            <IconCheck size={22} className="relative" />
          </span>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">Your link is live</h2>
          <p className="mt-1 text-sm text-muted">
            {done.count} file{done.count === 1 ? "" : "s"} · {formatBytes(done.size)} · expires {expires}
          </p>
        </div>
        <div className="hidden sm:block">
          <QrCode text={done.url} />
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input className="input h-11 font-mono text-[13px]" readOnly value={done.url} onFocus={(e) => e.target.select()} />
        <CopyButton text={done.url} label="Copy link" />
      </div>
      <div className="mt-3 flex gap-2">
        <a href={done.url} className="btn-ghost flex-1">
          Open
        </a>
        {canShare && (
          <button
            className="btn-ghost flex-1"
            onClick={() => navigator.share({ title: done.title, url: done.url }).catch(() => {})}
          >
            Share…
          </button>
        )}
        <button className="btn-ghost flex-1" onClick={onAgain}>
          Send more
        </button>
      </div>
      <details className="mt-5 rounded-xl bg-surface-2 p-4 text-sm">
        <summary className="cursor-pointer font-medium">Private manage link</summary>
        <p className="mt-1 text-muted">Use it to delete the files early. Don&apos;t share it.</p>
        <a href={done.manageUrl} className="mt-2 block truncate font-mono text-xs text-accent hover:underline">
          {done.manageUrl}
        </a>
      </details>
    </div>
  );
}
