import "server-only";
import { Activity, Contact, now, one, run } from "./db";

/** Find a contact by email, creating a lead if none exists. Touches last_seen_at. */
export function upsertContact(email: string, fields: { name?: string | null; source: string }): Contact {
  const clean = email.trim().toLowerCase();
  const existing = one<Contact>("SELECT * FROM contacts WHERE email = ?", clean);
  const t = now();
  if (existing) {
    run(
      "UPDATE contacts SET last_seen_at = ?, name = COALESCE(name, ?), updated_at = ? WHERE id = ?",
      t,
      fields.name || null,
      t,
      existing.id,
    );
    return { ...existing, last_seen_at: t, name: existing.name ?? fields.name ?? null };
  }
  const res = run(
    `INSERT INTO contacts (email, name, source, status, created_at, updated_at, last_seen_at)
     VALUES (?, ?, ?, 'lead', ?, ?, ?)`,
    clean,
    fields.name || null,
    fields.source,
    t,
    t,
    t,
  );
  return one<Contact>("SELECT * FROM contacts WHERE id = ?", Number(res.lastInsertRowid))!;
}

export function logActivity(contactId: number, type: Activity["type"], body: string, ref?: string | null) {
  run(
    "INSERT INTO activities (contact_id, type, body, ref, created_at) VALUES (?, ?, ?, ?, ?)",
    contactId,
    type,
    body,
    ref ?? null,
    now(),
  );
}

export function isBlockedEmail(email: string): boolean {
  const c = one<{ status: string }>("SELECT status FROM contacts WHERE email = ?", email.trim().toLowerCase());
  return c?.status === "blocked";
}

export function parseTags(tags: string): string[] {
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function normalizeTags(input: string): string {
  return Array.from(new Set(parseTags(input.toLowerCase()))).join(",");
}
