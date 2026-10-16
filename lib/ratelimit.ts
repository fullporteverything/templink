import "server-only";
import { count, now, run } from "./db";

/**
 * Count-in-window limiter backed by Postgres, so it holds across serverless instances.
 * `check` reports whether the key is over its budget; `hit` records one attempt.
 */
export async function overLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  return (await count("SELECT COUNT(*) AS n FROM templink.hits WHERE key = ? AND created_at > ?", key, now() - windowMs)) >= max;
}

export async function hit(key: string): Promise<void> {
  await run("INSERT INTO templink.hits (key, created_at) VALUES (?, ?)", key, now());
}

export async function clearHits(key: string): Promise<void> {
  await run("DELETE FROM templink.hits WHERE key = ?", key);
}
