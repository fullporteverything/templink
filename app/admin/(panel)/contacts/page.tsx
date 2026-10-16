import type { Metadata } from "next";
import Link from "next/link";
import { StatusSelect } from "@/components/admin/StatusSelect";
import { Avatar, Badge, Empty, PageHeader, SearchBox, Tabs } from "@/components/admin/ui";
import { IconPlus } from "@/components/icons";
import { parseTags } from "@/lib/crm";
import { all, Contact, CONTACT_STATUSES } from "@/lib/db";
import { formatBytes, formatMoney, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "CRM" };

type Row = Contact & { links: number; bytes: number | null };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; tag?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = CONTACT_STATUSES.includes(sp.status as never) ? sp.status! : "";
  const tag = (sp.tag ?? "").trim().toLowerCase();
  const view = sp.view === "board" ? "board" : "table";

  const conds: string[] = [];
  const params: string[] = [];
  if (q) {
    conds.push("(c.email LIKE ? OR c.name LIKE ? OR c.company LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status && view === "table") {
    conds.push("c.status = ?");
    params.push(status);
  }
  if (tag) {
    conds.push("(',' || c.tags || ',') LIKE ?");
    params.push(`%,${tag},%`);
  }
  const rows = all<Row>(
    `SELECT c.*, COUNT(col.id) AS links, SUM(col.total_size) AS bytes
     FROM contacts c LEFT JOIN collections col ON col.contact_id = c.id AND col.status != 'uploading'
     ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}
     GROUP BY c.id ORDER BY COALESCE(c.last_seen_at, c.updated_at) DESC LIMIT 500`,
    ...params,
  );

  const statusCounts = Object.fromEntries(
    all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM contacts GROUP BY status").map((r) => [r.status, r.n]),
  ) as Record<string, number>;
  const total = Object.values(statusCounts).reduce((s, n) => s + n, 0);
  const allTags = Array.from(new Set(all<{ tags: string }>("SELECT tags FROM contacts WHERE tags != ''").flatMap((r) => parseTags(r.tags)))).sort();
  const keep = { q, tag, view: view === "board" ? "board" : undefined };

  return (
    <>
      <PageHeader
        title="CRM"
        subtitle="Everyone who uploaded with an email, wrote in, or reported a link, plus anyone you add."
        actions={
          <>
            <a href="/admin/export/contacts" className="btn-ghost btn-sm">
              Export CSV
            </a>
            <Link href="/admin/contacts/new" className="btn-primary btn-sm">
              <IconPlus size={15} /> New contact
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {view === "table" && (
            <Tabs
              base="/admin/contacts"
              param="status"
              current={status}
              keep={keep}
              options={[
                { value: "", label: "All", count: total },
                ...CONTACT_STATUSES.map((s) => ({ value: s, label: s, count: statusCounts[s] ?? 0 })),
              ]}
            />
          )}
          <Tabs
            base="/admin/contacts"
            param="view"
            current={view === "board" ? "board" : ""}
            keep={{ q, tag }}
            options={[
              { value: "", label: "Table" },
              { value: "board", label: "Pipeline" },
            ]}
          />
        </div>
        <SearchBox action="/admin/contacts" q={q} placeholder="Search name, email, company" hidden={{ tag, view: keep.view }} />
      </div>

      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 text-muted">Tags:</span>
          {allTags.map((t) => {
            const on = t === tag;
            const qs = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(keep.view && { view: "board" }), ...(!on && { tag: t }) });
            return (
              <Link
                key={t}
                href={`/admin/contacts${qs.size ? `?${qs}` : ""}`}
                className={`rounded-full border px-2 py-0.5 ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg"}`}
              >
                {t}
              </Link>
            );
          })}
        </div>
      )}

      {view === "board" ? (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {CONTACT_STATUSES.map((s) => {
            const col = rows.filter((r) => r.status === s);
            const value = col.reduce((sum, r) => sum + r.value_cents, 0);
            return (
              <section key={s} className="w-64 shrink-0 snap-start rounded-2xl bg-surface-2/70 p-2 xl:w-auto xl:min-w-52 xl:flex-1">
                <header className="flex items-center justify-between px-2 py-1.5">
                  <Badge value={s} />
                  <span className="text-xs text-muted tabular-nums">
                    {col.length}
                    {value ? ` · ${formatMoney(value)}` : ""}
                  </span>
                </header>
                <ul className="mt-1 space-y-2">
                  {col.map((c) => (
                    <li key={c.id} className="card p-3">
                      <Link href={`/admin/contacts/${c.id}`} className="flex items-center gap-2.5 hover:underline">
                        <Avatar name={c.name} email={c.email} size={26} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name || c.email}</span>
                      </Link>
                      {c.company && <p className="mt-1 truncate text-xs text-muted">{c.company}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-faint">{c.value_cents ? formatMoney(c.value_cents) : `${c.links} link${c.links === 1 ? "" : "s"}`}</span>
                        <StatusSelect id={c.id} status={c.status} />
                      </div>
                    </li>
                  ))}
                  {!col.length && <li className="px-2 py-4 text-center text-xs text-faint">Empty</li>}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          {rows.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Stage</th>
                  <th>Tags</th>
                  <th>Links</th>
                  <th>Value</th>
                  <th>Source</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/60">
                    <td>
                      <Link href={`/admin/contacts/${c.id}`} className="flex items-center gap-3">
                        <Avatar name={c.name} email={c.email} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium hover:underline">{c.name || c.email}</span>
                          <span className="block truncate text-xs text-muted">
                            {c.name ? c.email : ""}
                            {c.company ? `${c.name ? " · " : ""}${c.company}` : ""}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <StatusSelect id={c.id} status={c.status} />
                    </td>
                    <td>
                      <div className="flex max-w-48 flex-wrap gap-1">
                        {parseTags(c.tags).map((t) => (
                          <span key={t} className="chip">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">
                      {c.links}
                      {c.bytes ? <span className="text-faint"> · {formatBytes(c.bytes)}</span> : null}
                    </td>
                    <td className="tabular-nums">{c.value_cents ? formatMoney(c.value_cents) : <span className="text-faint">—</span>}</td>
                    <td className="whitespace-nowrap text-muted capitalize">{c.source}</td>
                    <td className="whitespace-nowrap text-muted">{timeAgo(c.last_seen_at ?? c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>{q || tag || status ? "No contacts match these filters." : "No contacts yet."}</Empty>
          )}
        </div>
      )}
    </>
  );
}
