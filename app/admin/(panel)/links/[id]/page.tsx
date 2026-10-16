import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { extendLink, setLinkStatus } from "../../../actions";
import { ConfirmButton } from "@/components/admin/forms";
import { Badge, Empty, PageHeader } from "@/components/admin/ui";
import { FileIcon } from "@/components/icons";
import { getCollection, getFiles } from "@/lib/collections";
import { all, Message, now } from "@/lib/db";
import { fileKind, formatBytes, formatDate, formatDuration, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Link" };

export default async function LinkDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCollection(id);
  if (!c) notFound();
  const files = getFiles(id);
  const t = now();
  const live = c.status === "active" && c.expires_at > t;
  const exists = c.status === "active" || c.status === "disabled";
  const reports = all<Message>("SELECT * FROM messages WHERE kind = 'report' AND collection_id = ? ORDER BY created_at DESC", id);
  const dls = all<{ created_at: number; user_agent: string | null; file_id: string | null }>(
    "SELECT created_at, user_agent, file_id FROM downloads WHERE collection_id = ? ORDER BY created_at DESC LIMIT 25",
    id,
  );
  const fileName = new Map(files.map((f) => [f.id, f.name]));

  const facts: [string, React.ReactNode][] = [
    ["Status", <Badge key="s" value={c.status === "active" && !live ? "expired" : c.status} />],
    ["Created", formatDate(c.created_at)],
    ["Expires", exists ? `${formatDate(c.expires_at)} (${formatDuration(c.expires_at - t)})` : "—"],
    ["Size", `${formatBytes(c.total_size)} in ${c.file_count} file${c.file_count === 1 ? "" : "s"}`],
    ["Page views", c.views],
    ["Downloads", `${c.download_count}${c.max_downloads ? ` of ${c.max_downloads} allowed` : ""}`],
    ["Password", c.password_hash ? "Yes" : "No"],
    [
      "Uploader",
      c.contact_id ? (
        <Link key="u" href={`/admin/contacts/${c.contact_id}`} className="text-accent hover:underline">
          {c.uploader_email}
        </Link>
      ) : (
        "Anonymous"
      ),
    ],
    ["Uploader IP hash", <code key="ip" className="font-mono text-xs">{c.uploader_ip}</code>],
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/admin/links", label: "Links & files" }}
        title={c.title || `${c.file_count} file${c.file_count === 1 ? "" : "s"}`}
        subtitle={<span className="font-mono">{c.id}</span>}
        actions={
          <>
            {live && (
              <Link href={`/s/${id}`} target="_blank" className="btn-ghost btn-sm">
                Open share page ↗
              </Link>
            )}
            {c.status === "active" && (
              <form action={setLinkStatus}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value="disable" />
                <button className="btn-ghost btn-sm">Disable</button>
              </form>
            )}
            {c.status === "disabled" && (
              <form action={setLinkStatus}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value="enable" />
                <button className="btn-ghost btn-sm">Re-enable</button>
              </form>
            )}
            {exists && (
              <form action={setLinkStatus}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="to" value="delete" />
                <ConfirmButton message="Delete these files permanently?">Delete files</ConfirmButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <section className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 text-sm font-medium">Files</h2>
            <ul>
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                  <FileIcon kind={fileKind(f.mime, f.name)} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{f.name}</span>
                    <span className="block text-xs text-faint">{f.mime}</span>
                  </span>
                  <span className="text-xs text-muted tabular-nums">{f.downloads}×</span>
                  <span className="w-16 text-right text-xs text-muted tabular-nums">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          </section>

          {c.message && (
            <section className="card p-4">
              <h2 className="text-sm font-medium">Message to recipients</h2>
              <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{c.message}</p>
            </section>
          )}

          <section className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 text-sm font-medium">Abuse reports</h2>
            {reports.length ? (
              <ul>
                {reports.map((r) => (
                  <li key={r.id} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                    <div className="flex items-center gap-2">
                      <Badge value={r.status} />
                      <strong>{r.subject}</strong>
                      <span className="ml-auto text-xs text-faint">{timeAgo(r.created_at)}</span>
                    </div>
                    <p className="mt-1 text-muted">{r.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No reports.</Empty>
            )}
          </section>

          <section className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 text-sm font-medium">Recent downloads</h2>
            {dls.length ? (
              <ul>
                {dls.map((d, i) => (
                  <li key={i} className="flex gap-3 border-b border-line px-4 py-2 text-xs last:border-b-0">
                    <span className="w-20 shrink-0 text-muted">{timeAgo(d.created_at)}</span>
                    <span className="w-40 shrink-0 truncate">{d.file_id ? fileName.get(d.file_id) : "All files (.zip)"}</span>
                    <span className="min-w-0 flex-1 truncate text-faint">{d.user_agent}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No downloads yet.</Empty>
            )}
          </section>
        </div>

        <div className="space-y-3">
          <section className="card p-4">
            <dl className="divide-y divide-line text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          {exists && (
            <section className="card p-4">
              <h2 className="text-sm font-medium">Extend expiry</h2>
              <form action={extendLink} className="mt-3 flex gap-2">
                <input type="hidden" name="id" value={id} />
                <select name="hours" className="input" defaultValue="24">
                  <option value="1">+1 hour</option>
                  <option value="24">+1 day</option>
                  <option value="72">+3 days</option>
                  <option value="168">+7 days</option>
                  <option value="720">+30 days</option>
                </select>
                <button className="btn-ghost">Extend</button>
              </form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
