import "server-only";
import { cache } from "react";
import { all, run } from "./db";

export type Settings = {
  siteName: string;
  tagline: string;
  maxFileSizeMb: number;
  maxFilesPerLink: number;
  uploadsPerIpPerDay: number;
  expiryOptionsHours: number[];
  defaultExpiryHours: number;
  uploadsEnabled: boolean;
  announcement: string;
};

export const DEFAULT_SETTINGS: Settings = {
  siteName: process.env.SITE_NAME || "Templink",
  // "|" splits the homepage headline into a dark and a light line.
  tagline: "Send files.|Gone on schedule.",
  // Supabase's free plan caps uploads at 50 MB per file; raise this after raising the
  // project's global file size limit (Pro plan) in Storage settings.
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 50,
  maxFilesPerLink: 50,
  uploadsPerIpPerDay: 20,
  expiryOptionsHours: [1, 24, 72, 168],
  defaultExpiryHours: 72,
  uploadsEnabled: true,
  announcement: "",
};

/** Read once per request. */
export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM templink.settings");
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) {
    if (r.key in out) {
      try {
        out[r.key] = JSON.parse(r.value);
      } catch {
        /* ignore malformed rows */
      }
    }
  }
  return out as Settings;
});

export async function saveSettings(patch: Partial<Settings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
    await run(
      "INSERT INTO templink.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(value),
    );
  }
}

/** Split the headline at "|" into its two tones. */
export function headlineParts(tagline: string): [string, string] {
  const [lead, ...rest] = tagline.split("|");
  return [lead.trim(), rest.join(" ").trim()];
}

/** The headline as plain text, for titles and meta tags. */
export const plainTagline = (tagline: string) => headlineParts(tagline).filter(Boolean).join(" ");
