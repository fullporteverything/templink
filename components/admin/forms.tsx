"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { createContact, login, updateContact, updateSettings } from "@/app/admin/actions";
import { CONTACT_STATUSES, type Contact } from "@/lib/types";
import type { Settings } from "@/lib/settings";

export function Submit({ children, className = "btn-primary" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? "Saving…" : children}
    </button>
  );
}

/** Button that asks before submitting its form. */
export function ConfirmButton({
  children,
  message,
  className = "btn-danger btn-sm",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Flashes "Saved" each time an action returns ok (each result is a new object). */
function Saved({ state }: { state: { ok?: boolean } | undefined }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!state?.ok) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(t);
  }, [state]);
  return visible ? <span className="text-sm text-ok">Saved</span> : null;
}

export function LoginForm() {
  const [state, action] = useActionState(login, {});
  return (
    <form action={action} className="space-y-3">
      <label className="label" htmlFor="password">
        Admin password
      </label>
      <input id="password" name="password" type="password" className="input" autoFocus required autoComplete="current-password" />
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      <Submit className="btn-primary w-full">Sign in</Submit>
    </form>
  );
}

function ContactFields({ c }: { c?: Contact }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label">Name</label>
        <input name="name" className="input" defaultValue={c?.name ?? ""} />
      </div>
      <div>
        <label className="label">Company</label>
        <input name="company" className="input" defaultValue={c?.company ?? ""} />
      </div>
      <div>
        <label className="label">Phone</label>
        <input name="phone" className="input" defaultValue={c?.phone ?? ""} />
      </div>
      <div>
        <label className="label">Status</label>
        <select name="status" className="input capitalize" defaultValue={c?.status ?? "lead"}>
          {CONTACT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Deal value (USD)</label>
        <input name="value" type="number" min={0} step="1" className="input" defaultValue={c ? c.value_cents / 100 : ""} />
      </div>
      <div>
        <label className="label">Tags (comma separated)</label>
        <input name="tags" className="input" placeholder="vip, agency" defaultValue={c?.tags.split(",").join(", ") ?? ""} />
      </div>
    </div>
  );
}

export function NewContactForm() {
  const [state, action] = useActionState(createContact, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">Email *</label>
        <input name="email" type="email" required className="input" />
      </div>
      <ContactFields />
      <div>
        <label className="label">First note</label>
        <textarea name="note" rows={3} className="input" />
      </div>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      <Submit>Create contact</Submit>
    </form>
  );
}

export function EditContactForm({ contact }: { contact: Contact }) {
  const [state, action] = useActionState(updateContact, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={contact.id} />
      <ContactFields c={contact} />
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Submit>Save changes</Submit>
        <Saved state={state} />
      </div>
    </form>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action] = useActionState(updateSettings, {});
  return (
    <form action={action} className="space-y-6">
      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">Brand</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Site name</label>
            <input name="siteName" className="input" defaultValue={settings.siteName} />
          </div>
          <div>
            <label className="label">Headline (use | to split into two tones)</label>
            <input name="tagline" className="input" defaultValue={settings.tagline} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Announcement bar (leave empty to hide)</label>
            <input name="announcement" className="input" defaultValue={settings.announcement} />
          </div>
        </div>
      </section>
      <section className="card space-y-4 p-6">
        <h2 className="font-semibold">Upload limits</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="uploadsEnabled" defaultChecked={settings.uploadsEnabled} className="size-4 accent-[var(--accent)]" />
          Accept new uploads
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Max file size (MB)</label>
            <input name="maxFileSizeMb" type="number" min={1} className="input" defaultValue={settings.maxFileSizeMb} />
          </div>
          <div>
            <label className="label">Max files per link</label>
            <input name="maxFilesPerLink" type="number" min={1} className="input" defaultValue={settings.maxFilesPerLink} />
          </div>
          <div>
            <label className="label">Links per visitor per day</label>
            <input
              name="uploadsPerIpPerDay"
              type="number"
              min={1}
              className="input"
              defaultValue={settings.uploadsPerIpPerDay}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Expiry options (hours, comma separated)</label>
            <input name="expiryOptionsHours" className="input" defaultValue={settings.expiryOptionsHours.join(", ")} />
          </div>
          <div>
            <label className="label">Default expiry (hours)</label>
            <input
              name="defaultExpiryHours"
              type="number"
              min={1}
              className="input"
              defaultValue={settings.defaultExpiryHours}
            />
          </div>
        </div>
      </section>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Submit>Save settings</Submit>
        <Saved state={state} />
      </div>
    </form>
  );
}
