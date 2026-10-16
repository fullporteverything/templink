import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { BarChart } from "@/components/admin/BarChart";
import Globe from "@/components/globe/Globe";
import { getLive } from "@/lib/live";
import { Avatar, Badge, Empty, PageHeader, Stat } from "@/components/admin/ui";
import { storageUsed, sweepExpired } from "@/lib/collections";
import { all, Collection, Contact, count, Message, now, one } from "@/lib/db";
import { formatBytes, formatMoney, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

const DAY = 86_400_000;
async function daily(table: "collections" | "downloads", days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const from = start.getTime() - (days - 1) * DAY;
  // Bucket in SQL so we only pull one row per day.
  const rows = await all<{ i: number; n: number }>(
    `SELECT ((created_at - ?) / ?)::int AS i, COUNT(*) AS n FROM templink.${table}
     WHERE created_at >= ?${table === "collections" ? " AND status != 'uploading'" : ""} GROUP BY 1`,
    from,
    DAY,
    from,
  );
  const buckets = Array.from({ length: days }, (_, i) => ({
    label: new Date(from + i * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    value: 0,
  }));
  for (const r of rows) if (r.i >= 0 && r.i < days) buckets[r.i].value = r.n;
  return buckets;
}

export default async function Dashboard() {
  after(() => sweepExpired().catch(() => {}));
  const t = now();
  const [active, links30, dl24, dl30, contacts, newContacts, pipelineRow, openMsgs, recent, recentContacts, used, linksDaily, dlDaily] =
    await Promise.all([
      count("SELECT COUNT(*) AS n FROM templink.collections WHERE status = 'active' AND expires_at > ?", t),
      count("SELECT COUNT(*) AS n FROM templink.collections WHERE created_at > ? AND status != 'uploading'", t - 30 * DAY),
      count("SELECT COUNT(*) AS n FROM templink.downloads WHERE created_at > ?", t - DAY),
      count("SELECT COUNT(*) AS n FROM templink.downloads WHERE created_at > ?", t - 30 * DAY),
      count("SELECT COUNT(*) AS n FROM templink.contacts"),
      count("SELECT COUNT(*) AS n FROM templink.contacts WHERE created_at > ?", t - 7 * DAY),
      one<{ v: number | null }>("SELECT SUM(value_cents)::float8 AS v FROM templink.contacts WHERE status IN ('lead','qualified')"),
      all<Message>("SELECT * FROM templink.messages WHERE status = 'open' ORDER BY created_at DESC LIMIT 5"),
      all<Collection>("SELECT * FROM templink.collections WHERE status != 'uploading' ORDER BY created_at DESC LIMIT 6"),
      all<Contact>("SELECT * FROM templink.contacts ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 5"),
      storageUsed(),
      daily("collections", 14),
      daily("downloads", 14),
    ]);
  const live = await getLive();
  const pipeline = pipelineRow?.v ?? 0;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="What's happening across your links and customers." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Live links" value={active} hint={`${links30} created in 30 days`} />
        <Stat label="Storage in use" value={formatBytes(used)} hint="Freed automatically on expiry" />
        <Stat label="Downloads, 24 h" value={dl24} hint={`${dl30} in 30 days`} />
        <Stat label="Contacts" value={contacts} hint={`${newContacts} new this week · ${formatMoney(pipeline)} open pipeline`} />
      </div>

      <section className="card mt-3 grid overflow-hidden lg:grid-cols-[1fr_1.1fr]">
        <div className="relative h-72 border-b border-line bg-bg lg:h-auto lg:min-h-80 lg:border-r lg:border-b-0">
          <Globe arcs={live.arcs} points={live.points} className="absolute inset-0 size-full" />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <span className="live-dot size-1.5 rounded-full bg-accent" /> Live activity
            </h2>
            <span className="font-mono text-xs text-muted">{live.counters.countries} countries</span>
          </div>
          {live.events.length ? (
            <ul className="flex-1 overflow-auto font-mono text-xs">
              {live.events.slice(0, 8).map((e) => (
                <li key={e.key} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                  <span className={`w-16 shrink-0 ${e.kind === "download" ? "text-accent" : "text-ok"}`}>
                    {e.kind === "download" ? "download" : "upload"}
                  </span>
                  <span className="w-36 shrink-0 truncate">
                    {e.label} · {formatBytes(e.size)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {e.kind === "download" ? `${e.from ?? "?"} → ${e.to ?? "?"}` : e.from ?? "unknown location"}
                  </span>
                  <span className="text-faint">{timeAgo(e.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Activity appears here as people upload and download.</Empty>
          )}
        </div>
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <BarChart title="Links created per day" unit="links" data={linksDaily} />
        <BarChart title="Downloads per day" unit="downloads" data={dlDaily} />
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
                        {formatBytes(c.total_size)} · {c.download_count} download{c.download_count === 1 ? "" : "s"} · {timeAgo(c.created_at)}
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
