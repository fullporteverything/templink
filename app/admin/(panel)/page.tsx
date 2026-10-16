import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/admin/BarChart";
import { Avatar, Badge, Empty, PageHeader, Stat } from "@/components/admin/ui";
import { storageUsed, sweepExpired } from "@/lib/collections";
import { all, Collection, Contact, Message, now, one } from "@/lib/db";
import { formatBytes, formatMoney, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

const DAY = 86_400_000;
const count = (sql: string, ...p: number[]) => one<{ n: number }>(sql, ...p)?.n ?? 0;

function daily(table: "collections" | "downloads", days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const from = start.getTime() - (days - 1) * DAY;
  const rows = all<{ created_at: number }>(
    `SELECT created_at FROM ${table} WHERE created_at >= ?${table === "collections" ? " AND status != 'uploading'" : ""}`,
    from,
  );
  const buckets = Array.from({ length: days }, (_, i) => ({
    label: new Date(from + i * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    value: 0,
  }));
  for (const r of rows) {
    const i = Math.floor((r.created_at - from) / DAY);
    if (i >= 0 && i < days) buckets[i].value++;
  }
  return buckets;
}

export default function Dashboard() {
  sweepExpired();
  const t = now();
  const active = count("SELECT COUNT(*) AS n FROM collections WHERE status = 'active' AND expires_at > ?", t);
  const links30 = count("SELECT COUNT(*) AS n FROM collections WHERE created_at > ? AND status != 'uploading'", t - 30 * DAY);
  const dl24 = count("SELECT COUNT(*) AS n FROM downloads WHERE created_at > ?", t - DAY);
  const dl30 = count("SELECT COUNT(*) AS n FROM downloads WHERE created_at > ?", t - 30 * DAY);
  const contacts = count("SELECT COUNT(*) AS n FROM contacts");
  const newContacts = count("SELECT COUNT(*) AS n FROM contacts WHERE created_at > ?", t - 7 * DAY);
  const pipeline =
    one<{ v: number | null }>("SELECT SUM(value_cents) AS v FROM contacts WHERE status IN ('lead','qualified')")?.v ?? 0;
  const openMsgs = all<Message>("SELECT * FROM messages WHERE status = 'open' ORDER BY created_at DESC LIMIT 5");
  const recent = all<Collection>(
    "SELECT * FROM collections WHERE status != 'uploading' ORDER BY created_at DESC LIMIT 6",
  );
  const recentContacts = all<Contact>("SELECT * FROM contacts ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 5");

  return (
    <>
      <PageHeader title="Dashboard" subtitle="What's happening across your links and customers." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Live links" value={active} hint={`${links30} created in 30 days`} />
        <Stat label="Storage in use" value={formatBytes(storageUsed())} hint="Freed automatically on expiry" />
        <Stat label="Downloads, 24 h" value={dl24} hint={`${dl30} in 30 days`} />
        <Stat label="Contacts" value={contacts} hint={`${newContacts} new this week · ${formatMoney(pipeline)} open pipeline`} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <BarChart title="Links created per day" unit="links" data={daily("collections", 14)} />
        <BarChart title="Downloads per day" unit="downloads" data={daily("downloads", 14)} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium">Latest links</h2>
            <Link href="/admin/links" className="text-xs text-accent hover:underline">
              View all
            </Link>
          </div>
          {recent.length ? (
            <ul>
              {recent.map((c) => (
                <li key={c.id} className="border-b border-line last:border-b-0">
                  <Link href={`/admin/links/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.title || `${c.file_count} file${c.file_count === 1 ? "" : "s"}`}</span>
                      <span className="block text-xs text-muted">
                        {formatBytes(c.total_size)} · {c.download_count} downloads · {timeAgo(c.created_at)}
                      </span>
                    </span>
                    <Badge value={c.status === "active" && c.expires_at <= t ? "expired" : c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No links yet. Upload something from the public page to see it here.</Empty>
          )}
        </section>

        <div className="space-y-3">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-medium">Needs attention</h2>
              <Link href="/admin/inbox" className="text-xs text-accent hover:underline">
                Inbox
              </Link>
            </div>
            {openMsgs.length ? (
              <ul>
                {openMsgs.map((m) => (
                  <li key={m.id} className="border-b border-line px-4 py-2.5 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <Badge value={m.kind === "report" ? "report" : "open"} label={m.kind === "report" ? "Report" : "Message"} />
                      <span className="min-w-0 flex-1 truncate text-sm">{m.subject || m.body}</span>
                      <span className="text-xs text-faint">{timeAgo(m.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Inbox zero.</Empty>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-medium">Recently active contacts</h2>
              <Link href="/admin/contacts" className="text-xs text-accent hover:underline">
                CRM
              </Link>
            </div>
            {recentContacts.length ? (
              <ul>
                {recentContacts.map((c) => (
                  <li key={c.id} className="border-b border-line last:border-b-0">
                    <Link href={`/admin/contacts/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                      <Avatar name={c.name} email={c.email} size={28} />
                      <span className="min-w-0 flex-1 truncate text-sm">{c.name || c.email}</span>
                      <Badge value={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Contacts appear when uploaders leave an email or someone writes in.</Empty>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
