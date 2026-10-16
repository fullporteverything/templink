import { isAdmin } from "@/lib/auth";
import { all, Contact } from "@/lib/db";

const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  // Stop spreadsheet apps from treating a value as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const rows = await all<Contact & { links: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM templink.collections col WHERE col.contact_id = c.id AND col.status != 'uploading') AS links
     FROM templink.contacts c ORDER BY c.created_at`,
  );
  const header = ["email", "name", "company", "phone", "status", "tags", "value_usd", "source", "links", "created_at", "last_seen_at"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.email,
        r.name,
        r.company,
        r.phone,
        r.status,
        r.tags.replaceAll(",", "; "),
        (r.value_cents / 100).toFixed(2),
        r.source,
        r.links,
        new Date(r.created_at).toISOString(),
        r.last_seen_at ? new Date(r.last_seen_at).toISOString() : "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
