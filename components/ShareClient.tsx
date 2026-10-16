"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";
import { IconFlag, IconLock, IconX } from "./icons";

export function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return <span suppressHydrationWarning>{now == null ? "…" : formatDuration(until - now)}</span>;
}

export function PasswordGate({ id }: { id: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/s/${id}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => ({}))).error || "Wrong password.");
  }

  return (
    <form onSubmit={submit} className="p-6 sm:p-8">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconLock size={16} className="text-accent" /> This link is password protected
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="input h-11"
          type="password"
          autoFocus
          placeholder="Enter the password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn-primary h-11" disabled={!password || busy}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </form>
  );
}

const REASONS = ["Malware or phishing", "Copyright infringement", "Illegal content", "Spam", "Other"];

export function ReportButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setError("");
    const res = await fetch(`/api/s/${id}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason, details, email }),
    });
    if (res.ok) setState("sent");
    else {
      setState("idle");
      setError((await res.json().catch(() => ({}))).error || "Couldn't send the report.");
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 hover:text-bad">
        <IconFlag size={13} /> Report abuse
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div className="card rise w-full max-w-md p-6 text-fg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Report this link</h2>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:bg-surface-2" aria-label="Close">
                <IconX size={18} />
              </button>
            </div>
            {state === "sent" ? (
              <p className="mt-4 text-sm text-muted">Thanks. Our team will review this link shortly.</p>
            ) : (
              <form onSubmit={submit} className="mt-4 space-y-3">
                <div>
                  <label className="label">Reason</label>
                  <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                    {REASONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Details</label>
                  <textarea className="input" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
                </div>
                <div>
                  <label className="label">Your email (optional)</label>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {error && <p className="text-sm text-bad">{error}</p>}
                <button className="btn-danger w-full" disabled={state === "busy"}>
                  {state === "busy" ? "Sending…" : "Send report"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
