"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { expiryLabel, fileKind, formatBytes } from "@/lib/format";
import {
  FileIcon,
  IconCheck,
  IconCopy,
  IconLink,
  IconLock,
  IconPlus,
  IconUpload,
  IconX,
} from "./icons";

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

function putFile(url: string, token: string, file: File, onProgress: (loaded: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upload-token", token);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolve();
      } else {
        let msg = "Upload failed.";
        try {
          msg = JSON.parse(xhr.responseText).error || msg;
        } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

export default function Uploader({ limits }: { limits: Limits }) {
  const [files, setFiles] = useState<Picked[]>([]);
  const [drag, setDrag] = useState(false);
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
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setRecent(loadRecent()), []);

  const total = files.reduce((s, f) => s + f.file.size, 0);
  const sent = Object.values(progress).reduce((s, n) => s + n, 0);
  const pct = total ? Math.min(100, Math.round((sent / total) * 100)) : phase === "uploading" ? 100 : 0;

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      setError("");
      const incoming = Array.from(list);
      const tooBig = incoming.find((f) => f.size > limits.maxFileSizeMb * 1024 * 1024);
      if (tooBig) setError(`"${tooBig.name}" is over the ${formatBytes(limits.maxFileSizeMb * 1024 * 1024)} limit.`);
      setFiles((prev) => {
        const next = [...prev];
        for (const f of incoming) {
          if (f.size > limits.maxFileSizeMb * 1024 * 1024) continue;
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
    [limits.maxFileSizeMb, limits.maxFilesPerLink],
  );

  useEffect(() => {
    if (phase !== "pick") return;
    const onPaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files.length) addFiles(e.clipboardData.files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles, phase]);

  async function start() {
    if (!files.length) return;
    setError("");
    setPhase("uploading");
    setProgress({});
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
      const queue = files.map((f, i) => ({ picked: f, remote: created.files[i] as { id: string } }));
      const worker = async () => {
        while (queue.length) {
          const job = queue.shift()!;
          await putFile(
            `/api/uploads/${created.id}/files/${job.remote.id}`,
            created.token,
            job.picked.file,
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
    setPhase("pick");
  }

  if (!limits.uploadsEnabled) {
    return (
      <div className="card p-10 text-center">
        <p className="font-medium">Uploads are paused</p>
        <p className="mt-1 text-sm text-muted">We&apos;re doing some maintenance. Existing links still work.</p>
      </div>
    );
  }

  if (phase === "done" && done) return <DoneCard done={done} onAgain={reset} />;

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden shadow-[0_1px_0_rgba(0,0,0,0.02),0_20px_50px_-30px_rgba(20,20,60,0.35)]">
        {phase === "uploading" ? (
          <div className="p-6 sm:p-8">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-muted">Uploading</p>
                <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{pct}%</p>
              </div>
              <p className="text-sm text-muted tabular-nums">
                {formatBytes(sent)} of {formatBytes(total)}
              </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <ul className="mt-6 max-h-60 space-y-2 overflow-auto">
              {files.map((f) => {
                const p = f.file.size ? Math.round(((progress[f.key] ?? 0) / f.file.size) * 100) : 100;
                return (
                  <li key={f.key} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{f.file.name}</span>
                    <span className="w-10 text-right text-xs text-muted tabular-nums">{p}%</span>
                  </li>
                );
              })}
            </ul>
            <button className="btn-ghost mt-6 w-full" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              className={`m-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center transition-colors ${
                files.length ? "py-8" : "py-16"
              } ${drag ? "border-accent bg-accent-soft" : "border-line hover:border-accent/50 hover:bg-surface-2/60"}`}
            >
              <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
                {files.length ? <IconPlus size={22} /> : <IconUpload size={22} />}
              </span>
              <p className="mt-4 font-medium">{files.length ? "Add more files" : "Drop files here or click to browse"}</p>
              <p className="mt-1 text-sm text-muted">
                Up to {limits.maxFilesPerLink} files, {formatBytes(limits.maxFileSizeMb * 1024 * 1024)} each. You can also
                paste.
              </p>
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
            </div>

            {files.length > 0 && (
              <ul className="max-h-64 overflow-auto border-t border-line">
                {files.map((f) => (
                  <li key={f.key} className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-b-0">
                    <FileIcon kind={fileKind(f.file.type, f.file.name)} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm">{f.file.name}</span>
                    <span className="text-xs text-muted tabular-nums">{formatBytes(f.file.size)}</span>
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
            )}

            <div className="space-y-4 border-t border-line p-5">
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
                {moreOpen ? "Hide options" : "More options: password, download limit, message"}
              </button>

              {moreOpen && (
                <div className="grid gap-4 sm:grid-cols-2">
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

              <button
                className="btn-primary h-12 w-full text-base"
                disabled={!files.length || (usePassword && !password)}
                onClick={start}
              >
                <IconLink size={18} />
                {files.length
                  ? `Get a link for ${files.length} file${files.length === 1 ? "" : "s"} · ${formatBytes(total)}`
                  : "Get a link"}
              </button>
            </div>
          </>
        )}
      </div>

      {recent.length > 0 && phase === "pick" && (
        <div className="card p-4">
          <p className="px-1 pb-2 text-xs font-medium text-muted">Your recent links on this device</p>
          <ul>
            {recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-sm">
                <a href={r.url} className="min-w-0 flex-1 truncate hover:underline">
                  {r.title}
                </a>
                <span className="text-xs text-faint">{formatBytes(r.size)}</span>
                <a href={r.manageUrl} className="text-xs text-accent hover:underline">
                  Manage
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn-primary shrink-0"
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

function DoneCard({ done, onAgain }: { done: Done; onAgain: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
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
    <div ref={ref} className="card rise scroll-mt-6 p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-full bg-ok/15 text-ok">
        <IconCheck size={24} />
      </span>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight">Your link is ready</h2>
      <p className="mt-1 text-sm text-muted">
        {done.count} file{done.count === 1 ? "" : "s"} · {formatBytes(done.size)} · expires {expires}
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input className="input h-11 font-mono text-[13px]" readOnly value={done.url} onFocus={(e) => e.target.select()} />
        <CopyButton text={done.url} label="Copy link" />
      </div>
      <div className="mt-6 rounded-xl bg-surface-2 p-4 text-sm">
        <p className="font-medium">Keep this private manage link</p>
        <p className="mt-0.5 text-muted">Use it to delete the files early. Don&apos;t share it.</p>
        <a href={done.manageUrl} className="mt-2 block truncate font-mono text-xs text-accent hover:underline">
          {done.manageUrl}
        </a>
      </div>
      <div className="mt-6 flex gap-2">
        <a href={done.url} className="btn-ghost flex-1">
          Open link
        </a>
        <button className="btn-ghost flex-1" onClick={onAgain}>
          Send more files
        </button>
      </div>
    </div>
  );
}
