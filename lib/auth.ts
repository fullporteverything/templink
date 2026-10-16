import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeEqual, sign, unsign } from "./crypto";

const ADMIN_COOKIE = "tl_admin";
const SESSION_HOURS = 12;

export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  if (p) return p;
  return process.env.NODE_ENV === "production" ? null : "admin";
}

export function checkAdminPassword(input: string): boolean {
  const expected = adminPassword();
  return !!expected && safeEqual(input, expected);
}

export async function startAdminSession() {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, sign(`admin:${exp}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function endAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const value = unsign((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!value?.startsWith("admin:")) return false;
  return Number(value.slice(6)) > Date.now();
}

/** Guard for admin pages and server actions. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Cookie that proves a visitor entered the password for one link. */
export const unlockCookieName = (id: string) => `tl_u_${id}`;

export async function isUnlocked(id: string): Promise<boolean> {
  return unsign((await cookies()).get(unlockCookieName(id))?.value) === `unlock:${id}`;
}

/**
 * The visitor's IP as seen by the reverse proxy in front of us. The left-most X-Forwarded-For
 * entries are client-supplied and can be spoofed, so take the one the nearest proxy appended.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const hops = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return h.get("x-real-ip") || hops[hops.length - 1] || "unknown";
}
