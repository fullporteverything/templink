import type { Metadata } from "next";
import Link from "next/link";
import { runCleanup } from "../../actions";
import { Badge, Empty, PageHeader, SearchBox, Tabs } from "@/components/admin/ui";
import { IconLock } from "@/components/icons";
import { all, Collection, count, now } from "@/lib/db";
import { formatBytes, formatDuration, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Links & files" };

const FILTERS = {
  live: "c.status = 'active' AND c.expires_at > $now",
  disabled: "c.status = 'disabled'",
  gone: "c.status IN ('expired','deleted') OR (c.status = 'active' AND c.expires_at <= $now)",
  all: "c.status != 'uploading'",
} as const;
type Filter = keyof typeof FILTERS;

export default async function LinksPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const sp = await searchParams;
  const f: Filter = (sp.f as Filter) in FILTERS ? (sp.f as Filter) : "live";
  const q = (sp.q ?? "").trim();
  const t = now();

  const where = (cond: string) => cond.replaceAll("$now", String(t));
  const keys = Object.keys(FILTERS) as Filter[];
  const totals = await Promise.all(keys.map((k) => count(`SELECT COUNT(*) AS n FROM templink.collections c WHERE ${where(FILTERS[k])}`)));
  const counts = Object.fromEntries(keys.map((k, i) => [k, totals[i]])) as Record<Filter, number>;

  const like = `%${q}%`;
  const rows = await all<Collection & { contact_name: string | null }>(
    `SELECT c.*, ct.name AS contact_name FROM templink.collections c LEFT JOIN templink.contacts ct ON ct.id = c.contact_id
     WHERE (${where(FILTERS[f])})
       ${q ? "AND (c.id ILIKE ? OR c.title ILIKE ? OR c.uploader_email ILIKE ? OR EXISTS (SELECT 1 FROM templink.files fl WHERE fl.collection_id = c.id AND fl.name ILIKE ?))" : ""}
     ORDER BY c.created_at DESC LIMIT 200`,
    ...(q ? [like, like, like, like] : []),
  );

  return (
    <>
      <PageHeader
        title="Links & files"
        subtitle="Every link people have created. Disable or delete anything that breaks the rules."
        actions={
          <form action={runCleanup}>
            <button className="btn-ghost btn-sm">Run cleanup now</button>
          </form>
        }
      />
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <Tabs
          base="/admin/links"
          param="f"
          current={f}
          keep={{ q }}
          options={[
            { value: "live", label: "Live", count: counts.live },
            { value: "disabled", label: "Disabled", count: counts.disabled },
            { value: "gone", label: "Expired / deleted", count: counts.gone },
            { value: "all", label: "All", count: counts.all },
          ]}
        />
        <SearchBox action="/admin/links" q={q} placeholder="Search id, title, file name, email" hidden={{ f }} />
      </div>
      <div className="card overflow-x-auto">
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Link</th>
                <th>Size</th>
                <th>Downloads</th>
                <th>Uploader</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const expired = c.status === "active" && c.expires_at <= t;
                return (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <td className="max-w-72">
                      <Link href={`/admin/links/${c.id}`} className="block truncate font-medium hover:underline">
                        {c.title || `${c.file_count} file${c.file_count === 1 ? "" : "s"}`}
                      </Link>
                      <span className="flex items-center gap-1 font-mono text-xs text-faint">
                        {c.id} {c.password_hash && <IconLock size={11} />}
                      </span>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">{formatBytes(c.total_size)}</td>
                    <td className="tabular-nums">
                      {c.download_count}
                      {c.max_downloads ? <span className="text-faint"> / {c.max_downloads}</span> : null}
                    </td>
                    <td className="max-w-48 truncate">
                      {c.contact_id ? (
                        <Link href={`/admin/contacts/${c.contact_id}`} className="text-accent hover:underline">
                          {c.contact_name || c.uploader_email}
                        </Link>
                      ) : (
                        <span className="text-faint">Anonymous</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-muted">{timeAgo(c.created_at)}</td>
                    <td className="whitespace-nowrap text-muted">
                      {c.status === "active" || c.status === "disabled" ? formatDuration(c.expires_at - t) : "—"}
                    </td>
                    <td>
                      <Badge value={expired ? "expired" : c.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Empty>{q ? `Nothing matches "${q}".` : "No links here."}</Empty>
        )}
      </div>
    </>
  );
}
