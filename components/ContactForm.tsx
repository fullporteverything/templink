"use client";

import { useState } from "react";
import { IconCheck } from "./icons";

export default function ContactForm() {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy");
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) setState("sent");
    else {
      setState("idle");
      setError((await res.json().catch(() => ({}))).error || "Something went wrong.");
    }
  }

  if (state === "sent") {
    return (
      <div className="card rise p-8">
        <span className="grid size-12 place-items-center rounded-full bg-ok/15 text-ok">
          <IconCheck size={24} />
        </span>
        <h2 className="mt-4 text-xl font-semibold">Message sent</h2>
        <p className="mt-1 text-sm text-muted">Thanks. We&apos;ll get back to you by email.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="subject">
          Subject
        </label>
        <input id="subject" name="subject" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="message">
          Message
        </label>
        <textarea id="message" name="message" required rows={5} className="input" />
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className="btn-primary w-full" disabled={state === "busy"}>
        {state === "busy" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
