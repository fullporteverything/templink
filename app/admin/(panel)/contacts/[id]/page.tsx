import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addNote, deleteActivity, deleteContact } from "../../../actions";
import { ConfirmButton, EditContactForm, Submit } from "@/components/admin/forms";
import { Avatar, Badge, Empty, PageHeader } from "@/components/admin/ui";
import { IconFlag, IconLink, IconMail, IconNote, IconSettings, IconTrash, IconInbox } from "@/components/icons";
import { Activity, all, Collection, Contact, now, one } from "@/lib/db";
import { formatBytes, formatDate, formatMoney, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Contact" };

const ACTIVITY_ICON = {
  note: IconNote,
  email: IconMail,
  upload: IconLink,
  message: IconInbox,
  report: IconFlag,
  status: IconSettings,
} as const;

const ACTIVITY_LABEL: Record<Activity["type"], string> = {
  note: "Note",
  email: "Email logged",
  upload: "Uploaded files",
  message: "Sent a message",
  report: "Reported a link",
  status: "Update",
};

export default async function ContactDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cid = Number(id);
  if (!Number.isSafeInteger(cid)) notFound();
  const contact = await one<Contact>("SELECT * FROM templink.contacts WHERE id = ?", cid);
  if (!contact) notFound();
  const [activities, links, totals] = await Promise.all([
    all<Activity>("SELECT * FROM templink.activities WHERE contact_id = ? ORDER BY created_at DESC, id DESC", contact.id),
    all<Collection>(
      "SELECT * FROM templink.collections WHERE contact_id = ? AND status != 'uploading' ORDER BY created_at DESC LIMIT 50",
      contact.id,
    ),
    one<{ n: number; bytes: number | null; dls: number | null }>(
      `SELECT COUNT(*) AS n, SUM(total_size)::float8 AS bytes, SUM(download_count)::float8 AS dls
       FROM templink.collections WHERE contact_id = ? AND status != 'uploading'`,
      contact.id,
    ),
  ]);
  const t = now();

  return (
    <>
      <PageHeader
        back={{ href: "/admin/contacts", label: "CRM" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={contact.name} email={contact.email} size={40} />
            <span className="min-w-0">
              <span className="block truncate">{contact.name || contact.email}</span>
              <span className="block text-sm font-normal text-muted">
                {contact.email}
                {contact.company ? ` · ${contact.company}` : ""}
              </span>
            </span>
          </span>
        }
        actions={
          <>
            <a href={`mailto:${contact.email}`} className="btn-ghost btn-sm">
              <IconMail size={15} /> Email
            </a>
            <form action={deleteContact}>
              <input type="hidden" name="id" value={contact.id} />
              <ConfirmButton message="Delete this contact and its timeline? Their links stay.">
                <IconTrash size={15} /> Delete
              </ConfirmButton>
            </form>
          </>
        }
      />

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Stage", <Badge key="s" value={contact.status} />],
          ["Deal value", contact.value_cents ? formatMoney(contact.value_cents) : "—"],
          ["Links shared", `${totals?.n ?? 0} · ${formatBytes(totals?.bytes ?? 0)}`],
          ["Downloads received", totals?.dls ?? 0],
        ].map(([k, v]) => (
          <div key={k as string} className="card p-4">
            <p className="text-xs text-muted">{k}</p>
            <div className="mt-1.5 text-lg font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <section className="card p-4">
            <form action={addNote} className="space-y-2">
              <input type="hidden" name="id" value={contact.id} />
              <textarea name="body" rows={3} required placeholder="Add a note, call summary or next step…" className="input" />
              <div className="flex items-center justify-between gap-2">
                <select name="type" className="input h-9 w-auto text-xs" defaultValue="note">
                  <option value="note">Note</option>
                  <option value="email">Email sent / received</option>
                </select>
                <Submit className="btn-primary btn-sm">Add to timeline</Submit>
              </div>
            </form>
          </section>

          <section className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 text-sm font-medium">Timeline</h2>
            {activities.length ? (
              <ol className="relative px-4 py-2">
                {activities.map((a) => {
                  const Icon = ACTIVITY_ICON[a.type] ?? IconNote;
                  return (
                    <li key={a.id} className="group relative flex gap-3 py-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-muted">
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 text-xs">
                          <span className="font-medium">{ACTIVITY_LABEL[a.type]}</span>
                          <span className="text-faint" title={formatDate(a.created_at)}>
                            {timeAgo(a.created_at)}
                          </span>
                          {(a.type === "note" || a.type === "email") && (
                            <form action={deleteActivity} className="ml-auto opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                              <input type="hidden" name="id" value={a.id} />
                              <input type="hidden" name="contact" value={contact.id} />
                              <button className="text-faint hover:text-bad" aria-label="Delete note">
                                <IconTrash size={13} />
                              </button>
                            </form>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm whitespace-pre-wrap break-words text-muted">{a.body}</p>
                        {a.ref && (a.type === "upload" || a.type === "report" || a.type === "status") && (
                          <Link href={`/admin/links/${a.ref}`} className="mt-1 inline-block font-mono text-xs text-accent hover:underline">
                            {a.ref}
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <Empty>Nothing on the timeline yet.</Empty>
            )}
          </section>
        </div>

        <div className="space-y-3">
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-medium">Details</h2>
            <EditContactForm contact={contact} />
            <dl className="mt-5 space-y-1 border-t border-line pt-4 text-xs text-muted">
              <div className="flex justify-between">
                <dt>Source</dt>
                <dd className="capitalize">{contact.source}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Added</dt>
                <dd>{formatDate(contact.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Last seen</dt>
                <dd>{formatDate(contact.last_seen_at)}</dd>
              </div>
            </dl>
            {contact.status === "blocked" && (
              <p className="mt-4 rounded-lg bg-bad/10 p-3 text-xs text-bad">Blocked contacts can&apos;t create new links with this email.</p>
            )}
          </section>

          <section className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 text-sm font-medium">Links</h2>
            {links.length ? (
              <ul>
                {links.map((c) => (
                  <li key={c.id} className="border-b border-line last:border-b-0">
                    <Link href={`/admin/links/${c.id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{c.title || `${c.file_count} files`}</span>
                        <span className="block text-xs text-faint">
                          {formatBytes(c.total_size)} · {c.download_count} dl · {timeAgo(c.created_at)}
                        </span>
                      </span>
                      <Badge value={c.status === "active" && c.expires_at <= t ? "expired" : c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No links.</Empty>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
