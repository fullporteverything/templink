import type { Metadata } from "next";
import Link from "next/link";
import { setMessageStatus, takeDownReported } from "../../actions";
import { ConfirmButton } from "@/components/admin/forms";
import { Badge, Empty, PageHeader, Tabs } from "@/components/admin/ui";
import { all, count, Message } from "@/lib/db";
import { formatDate, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Inbox" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ s?: string; k?: string }> }) {
  const sp = await searchParams;
  const status = sp.s === "resolved" ? "resolved" : "open";
  const kind = sp.k === "report" || sp.k === "contact" ? sp.k : "";
  const msgs = await all<Message & { link_status: string | null }>(
    `SELECT m.*, c.status AS link_status FROM templink.messages m LEFT JOIN templink.collections c ON c.id = m.collection_id
     WHERE m.status = ? ${kind ? "AND m.kind = ?" : ""} ORDER BY m.created_at DESC LIMIT 200`,
    ...(kind ? [status, kind] : [status]),
  );
  const n = (s: string, k?: string) =>
    count(`SELECT COUNT(*) AS n FROM templink.messages WHERE status = ?${k ? " AND kind = ?" : ""}`, ...(k ? [s, k] : [s]));
  const [openCount, resolvedCount] = await Promise.all([n("open", kind || undefined), n("resolved", kind || undefined)]);

  return (
    <>
      <PageHeader title="Inbox" subtitle="Contact form messages and abuse reports. Senders with an email are added to the CRM." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Tabs
          base="/admin/inbox"
          param="s"
          current={status === "resolved" ? "resolved" : ""}
          keep={{ k: kind || undefined }}
          options={[
            { value: "", label: "Open", count: openCount },
            { value: "resolved", label: "Resolved", count: resolvedCount },
          ]}
        />
        <Tabs
          base="/admin/inbox"
          param="k"
          current={kind}
          keep={{ s: status === "resolved" ? "resolved" : undefined }}
          options={[
            { value: "", label: "Everything" },
            { value: "contact", label: "Messages" },
            { value: "report", label: "Abuse reports" },
          ]}
        />
      </div>

      <div className="space-y-3">
        {msgs.length === 0 && (
          <div className="card">
            <Empty>{status === "open" ? "All caught up." : "Nothing resolved yet."}</Empty>
          </div>
        )}
        {msgs.map((m) => (
          <article key={m.id} className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge value={m.kind === "report" ? "report" : "lead"} label={m.kind === "report" ? "Abuse report" : "Message"} />
              <h2 className="font-medium">{m.subject || (m.kind === "report" ? "Report" : "No subject")}</h2>
              <span className="ml-auto text-xs text-faint" title={formatDate(m.created_at)}>
                {timeAgo(m.created_at)}
              </span>
            </div>
            <p className="mt-3 text-sm whitespace-pre-wrap break-words text-muted">{m.body}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-muted">
              <span>
                From{" "}
                {m.contact_id ? (
                  <Link href={`/admin/contacts/${m.contact_id}`} className="text-accent hover:underline">
                    {m.name ? `${m.name} <${m.email}>` : m.email}
                  </Link>
                ) : (
                  "anonymous"
                )}
              </span>
              {m.collection_id && (
                <span>
                  Link{" "}
                  <Link href={`/admin/links/${m.collection_id}`} className="font-mono text-accent hover:underline">
                    {m.collection_id}
                  </Link>{" "}
                  {m.link_status && <Badge value={m.link_status} />}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                {m.email && (
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject ?? ""}`)}`} className="btn-ghost btn-sm">
                    Reply
                  </a>
                )}
                {m.kind === "report" && m.status === "open" && m.link_status && ["active", "disabled"].includes(m.link_status) && (
                  <form action={takeDownReported}>
                    <input type="hidden" name="id" value={m.id} />
                    <ConfirmButton message="Delete the reported files and resolve every report for this link?">Take down link</ConfirmButton>
                  </form>
                )}
                <form action={setMessageStatus}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="status" value={m.status === "open" ? "resolved" : "open"} />
                  <button className="btn-ghost btn-sm">{m.status === "open" ? "Mark resolved" : "Reopen"}</button>
                </form>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
