import "server-only";
import { clientIp } from "./auth";
import { hashIp } from "./crypto";
import { logActivity, upsertContact } from "./crm";
import { now, one, run } from "./db";
import { isEmail } from "./format";

/** Store a contact-form message or abuse report, and link it to a CRM contact when an email is given. */
export async function createMessage(input: {
  kind: "contact" | "report";
  name?: string;
  email?: string;
  subject?: string;
  body: string;
  collectionId?: string;
}): Promise<{ error?: string }> {
  const body = input.body.trim().slice(0, 5000);
  const email = (input.email ?? "").trim().toLowerCase().slice(0, 200);
  const name = (input.name ?? "").trim().slice(0, 120);
  const subject = (input.subject ?? "").trim().slice(0, 200);
  if (body.length < 3) return { error: "Please write a message." };
  if (email && !isEmail(email)) return { error: "That email address doesn't look right." };
  if (input.kind === "contact" && !email) return { error: "Add your email so we can reply." };

  const ip = hashIp(await clientIp());
  const recent =
    one<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE ip = ? AND created_at > ?", ip, now() - 3600_000)?.n ?? 0;
  if (recent >= 10) return { error: "Too many messages. Try again later." };

  let contactId: number | null = null;
  if (email) {
    const contact = upsertContact(email, { name, source: input.kind === "report" ? "report" : "contact form" });
    contactId = contact.id;
    logActivity(
      contact.id,
      input.kind === "report" ? "report" : "message",
      `${subject ? `${subject}: ` : ""}${body.slice(0, 500)}`,
      input.collectionId ?? null,
    );
  }
  run(
    `INSERT INTO messages (kind, name, email, subject, body, collection_id, contact_id, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.kind,
    name || null,
    email || null,
    subject || null,
    body,
    input.collectionId ?? null,
    contactId,
    ip,
    now(),
  );
  return {};
}
