import "server-only";
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
  tagline: "Send files with a link that expires.",
  maxFileSizeMb: 2048,
  maxFilesPerLink: 50,
  uploadsPerIpPerDay: 20,
  expiryOptionsHours: [1, 24, 72, 168],
  defaultExpiryHours: 72,
  uploadsEnabled: true,
  announcement: "",
};

export function getSettings(): Settings {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings");
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
}

export function saveSettings(patch: Partial<Settings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS) || value === undefined) continue;
    run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(value),
    );
  }
}
