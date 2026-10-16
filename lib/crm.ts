import "server-only";
import { Activity, Contact, now, one, run } from "./db";

/** Find a contact by email, creating a lead if none exists. Touches last_seen_at. */
export async function upsertContact(email: string, fields: { name?: string | null; source: string }): Promise<Contact> {
  const clean = email.trim().toLowerCase();
  const t = now();
  const row = await one<Contact>(
    `INSERT INTO templink.contacts (email, name, source, status, created_at, updated_at, last_seen_at)
     VALUES (?, ?, ?, 'lead', ?, ?, ?)
     ON CONFLICT ((lower(email))) DO UPDATE
       SET last_seen_at = excluded.last_seen_at,
           updated_at = excluded.updated_at,
           name = COALESCE(templink.contacts.name, excluded.name)
     RETURNING *`,
    clean,
    fields.name || null,
    fields.source,
    t,
    t,
    t,
  );
  return row!;
}

export async function logActivity(contactId: number, type: Activity["type"], body: string, ref?: string | null) {
  await run(
    "INSERT INTO templink.activities (contact_id, type, body, ref, created_at) VALUES (?, ?, ?, ?, ?)",
    contactId,
    type,
    body,
    ref ?? null,
    now(),
  );
}

export async function isBlockedEmail(email: string): Promise<boolean> {
  const c = await one<{ status: string }>(
    "SELECT status FROM templink.contacts WHERE lower(email) = ?",
    email.trim().toLowerCase(),
  );
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
