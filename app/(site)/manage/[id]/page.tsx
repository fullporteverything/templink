import type { Metadata } from "next";
import Link from "next/link";
import { availability, getCollection } from "@/lib/collections";
import { safeEqual } from "@/lib/crypto";
import { formatBytes, formatDate } from "@/lib/format";
import { DeleteLink } from "@/components/ManageClient";

export const metadata: Metadata = { title: "Manage link", robots: { index: false } };

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { id } = await params;
  const { k } = await searchParams;
  const c = getCollection(id);
  if (!c || !k || !safeEqual(k, c.manage_token)) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Manage link not valid</h1>
        <p className="mt-2 text-muted">Check that you copied the whole address.</p>
      </div>
    );
  }
  const a = availability(c);
  const rows: [string, string][] = [
    ["Status", a.ok ? "Live" : a.reason],
    ["Files", `${c.file_count} · ${formatBytes(c.total_size)}`],
    ["Created", formatDate(c.created_at)],
    ["Expires", formatDate(c.expires_at)],
    ["Page views", String(c.views)],
    ["Downloads", `${c.download_count}${c.max_downloads ? ` of ${c.max_downloads}` : ""}`],
    ["Password", c.password_hash ? "Yes" : "No"],
  ];

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-16 sm:px-6 sm:pt-12">
      <div className="card p-6 sm:p-8">
        <p className="text-sm text-muted">Manage your link</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words">{c.title || id}</h1>
        <dl className="mt-6 divide-y divide-line text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium capitalize">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {a.ok && (
            <Link href={`/s/${id}`} className="btn-ghost flex-1">
              Open share page
            </Link>
          )}
          {c.status !== "deleted" && c.status !== "expired" && <DeleteLink id={id} token={k} />}
        </div>
      </div>
    </div>
  );
}
