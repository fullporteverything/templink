"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdminPassword, endAdminSession, requireAdmin, startAdminSession } from "@/lib/auth";
import { getCollection, purgeCollection, sweepExpired } from "@/lib/collections";
import { logActivity, normalizeTags } from "@/lib/crm";
import { CONTACT_STATUSES, ContactStatus, Contact, now, one, run } from "@/lib/db";
import { isEmail } from "@/lib/format";
import { saveSettings, Settings } from "@/lib/settings";

const s = (fd: FormData, k: string, max = 500) => String(fd.get(k) ?? "").trim().slice(0, max);

// ---------- session ----------

const loginAttempts = { n: 0, until: 0 };

export async function login(_: unknown, fd: FormData): Promise<{ error?: string }> {
  if (loginAttempts.n >= 8 && loginAttempts.until > Date.now()) return { error: "Too many attempts. Wait a few minutes." };
  if (!checkAdminPassword(s(fd, "password"))) {
    if (loginAttempts.until < Date.now()) Object.assign(loginAttempts, { n: 0, until: Date.now() + 10 * 60_000 });
    loginAttempts.n++;
    await new Promise((r) => setTimeout(r, 400));
    return { error: "Wrong password." };
  }
  loginAttempts.n = 0;
  await startAdminSession();
  redirect("/admin");
}

export async function logout() {
  await endAdminSession();
  redirect("/admin/login");
}

// ---------- links ----------

export async function setLinkStatus(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const to = s(fd, "to");
  const c = getCollection(id);
  if (!c) return;
  if (to === "delete") {
    purgeCollection(id, "deleted");
  } else if (to === "disable" && c.status === "active") {
    run("UPDATE collections SET status = 'disabled' WHERE id = ?", id);
  } else if (to === "enable" && c.status === "disabled") {
    run("UPDATE collections SET status = 'active' WHERE id = ?", id);
  }
  if (c.contact_id && to !== "enable") {
    logActivity(c.contact_id, "status", `Admin ${to === "delete" ? "deleted" : "disabled"} link ${id}`, id);
  }
  revalidatePath("/admin", "layout");
}

export async function extendLink(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const hours = Number(s(fd, "hours"));
  const c = getCollection(id);
  if (!c || !["active", "disabled"].includes(c.status) || !(hours > 0 && hours <= 24 * 365)) return;
  run("UPDATE collections SET expires_at = MAX(expires_at, ?) + ? WHERE id = ?", now(), hours * 3600_000, id);
  revalidatePath(`/admin/links/${id}`);
}

export async function runCleanup() {
  await requireAdmin();
  sweepExpired(true);
  revalidatePath("/admin", "layout");
}

// ---------- CRM ----------

function contactFields(fd: FormData) {
  const status = s(fd, "status") as ContactStatus;
  const value = Number(s(fd, "value") || 0);
  return {
    name: s(fd, "name", 120) || null,
    company: s(fd, "company", 120) || null,
    phone: s(fd, "phone", 40) || null,
    status: CONTACT_STATUSES.includes(status) ? status : "lead",
    tags: normalizeTags(s(fd, "tags")),
    value_cents: Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) : 0,
  };
}

export async function createContact(_: unknown, fd: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const email = s(fd, "email", 200).toLowerCase();
  if (!isEmail(email)) return { error: "Enter a valid email." };
  const existing = one<{ id: number }>("SELECT id FROM contacts WHERE email = ?", email);
  if (existing) redirect(`/admin/contacts/${existing.id}`);
  const f = contactFields(fd);
  const t = now();
  const res = run(
    `INSERT INTO contacts (email, name, company, phone, status, tags, value_cents, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
    email,
    f.name,
    f.company,
    f.phone,
    f.status,
    f.tags,
    f.value_cents,
    t,
    t,
  );
  const id = Number(res.lastInsertRowid);
  const note = s(fd, "note", 5000);
  if (note) logActivity(id, "note", note);
  redirect(`/admin/contacts/${id}`);
}

export async function updateContact(_: unknown, fd: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const id = Number(s(fd, "id"));
  const before = one<Contact>("SELECT * FROM contacts WHERE id = ?", id);
  if (!before) return { error: "Contact not found." };
  const f = contactFields(fd);
  run(
    `UPDATE contacts SET name = ?, company = ?, phone = ?, status = ?, tags = ?, value_cents = ?, updated_at = ? WHERE id = ?`,
    f.name,
    f.company,
    f.phone,
    f.status,
    f.tags,
    f.value_cents,
    now(),
    id,
  );
  if (before.status !== f.status) logActivity(id, "status", `Status changed from ${before.status} to ${f.status}`);
  revalidatePath(`/admin/contacts/${id}`);
  return { ok: true };
}

export async function addNote(fd: FormData) {
  await requireAdmin();
  const id = Number(s(fd, "id"));
  const body = s(fd, "body", 5000);
  const type = s(fd, "type") === "email" ? "email" : "note";
  if (!body || !one("SELECT id FROM contacts WHERE id = ?", id)) return;
  logActivity(id, type, body);
  run("UPDATE contacts SET updated_at = ? WHERE id = ?", now(), id);
  revalidatePath(`/admin/contacts/${id}`);
}

export async function deleteActivity(fd: FormData) {
  await requireAdmin();
  const id = Number(s(fd, "id"));
  const contactId = Number(s(fd, "contact"));
  run("DELETE FROM activities WHERE id = ? AND contact_id = ? AND type IN ('note','email')", id, contactId);
  revalidatePath(`/admin/contacts/${contactId}`);
}

export async function deleteContact(fd: FormData) {
  await requireAdmin();
  run("DELETE FROM contacts WHERE id = ?", Number(s(fd, "id")));
  redirect("/admin/contacts");
}

export async function setContactStatus(fd: FormData) {
  await requireAdmin();
  const id = Number(s(fd, "id"));
  const status = s(fd, "status") as ContactStatus;
  const before = one<Contact>("SELECT * FROM contacts WHERE id = ?", id);
  if (!before || !CONTACT_STATUSES.includes(status) || before.status === status) return;
  run("UPDATE contacts SET status = ?, updated_at = ? WHERE id = ?", status, now(), id);
  logActivity(id, "status", `Status changed from ${before.status} to ${status}`);
  revalidatePath("/admin/contacts");
  revalidatePath(`/admin/contacts/${id}`);
}

// ---------- inbox ----------

export async function setMessageStatus(fd: FormData) {
  await requireAdmin();
  const status = s(fd, "status") === "resolved" ? "resolved" : "open";
  run("UPDATE messages SET status = ? WHERE id = ?", status, Number(s(fd, "id")));
  revalidatePath("/admin", "layout");
}

export async function takeDownReported(fd: FormData) {
  await requireAdmin();
  const msgId = Number(s(fd, "id"));
  const m = one<{ collection_id: string | null }>("SELECT collection_id FROM messages WHERE id = ?", msgId);
  if (m?.collection_id) {
    const c = getCollection(m.collection_id);
    if (c && c.status !== "deleted" && c.status !== "expired") purgeCollection(c.id, "deleted");
    run("UPDATE messages SET status = 'resolved' WHERE kind = 'report' AND collection_id = ?", m.collection_id);
    if (c?.contact_id) logActivity(c.contact_id, "status", `Link ${c.id} taken down after an abuse report`, c.id);
  }
  revalidatePath("/admin", "layout");
}

// ---------- settings ----------

export async function updateSettings(_: unknown, fd: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const expiry = s(fd, "expiryOptionsHours")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 24 * 365);
  const uniqueExpiry = Array.from(new Set(expiry)).sort((a, b) => a - b);
  if (!uniqueExpiry.length) return { error: "Add at least one expiry option (in hours)." };
  const defaultExpiry = Number(s(fd, "defaultExpiryHours"));
  const num = (k: string, min: number, max: number) => {
    const n = Number(s(fd, k));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
  };
  const patch: Partial<Settings> = {
    siteName: s(fd, "siteName", 60) || "Templink",
    tagline: s(fd, "tagline", 140),
    announcement: s(fd, "announcement", 300),
    maxFileSizeMb: num("maxFileSizeMb", 1, 1024 * 1024),
    maxFilesPerLink: num("maxFilesPerLink", 1, 1000),
    uploadsPerIpPerDay: num("uploadsPerIpPerDay", 1, 100000),
    expiryOptionsHours: uniqueExpiry,
    defaultExpiryHours: uniqueExpiry.includes(defaultExpiry) ? defaultExpiry : uniqueExpiry[0],
    uploadsEnabled: fd.get("uploadsEnabled") === "on",
  };
  saveSettings(patch);
  revalidatePath("/", "layout");
  return { ok: true };
}
