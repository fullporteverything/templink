import "server-only";
import { all, count, now, one } from "./db";
import { fileKind } from "./format";

export type LiveEvent = {
  key: string;
  kind: "upload" | "download";
  label: string; // "Video", "3 files", …
  size: number;
  from: string | null;
  to: string | null;
  at: number;
};

export type LiveData = {
  liveLinks: number;
  counters: { bytes: number; files: number; downloads: number; countries: number };
  events: LiveEvent[];
  arcs: { from: [number, number]; to: [number, number] }[];
  points: [number, number][];
};

const KIND_LABEL: Record<string, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  archive: "Archive",
  code: "Code",
  doc: "Document",
  file: "File",
};

/**
 * Public activity for the homepage globe, ticker and counters. Only coarse, anonymous facts:
 * file type, size, city and time. Never names, ids or emails.
 */
export async function getLive(): Promise<LiveData> {
  const t = now();
  const [liveLinks, totals, downloads, countries, dlRows, upRows] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM templink.collections WHERE status = 'active' AND expires_at > ?", t),
    one<{ bytes: number | null; files: number | null }>(
      "SELECT SUM(total_size)::float8 AS bytes, SUM(file_count)::float8 AS files FROM templink.collections WHERE status <> 'uploading'",
    ),
    count("SELECT COUNT(*) AS n FROM templink.downloads"),
    count(
      `SELECT COUNT(DISTINCT c) AS n FROM (
         SELECT geo_country AS c FROM templink.collections WHERE geo_country IS NOT NULL
         UNION SELECT geo_country FROM templink.downloads WHERE geo_country IS NOT NULL) x`,
    ),
    all<{
      id: number;
      created_at: number;
      d_city: string | null;
      d_lat: number | null;
      d_lon: number | null;
      c_city: string | null;
      c_lat: number | null;
      c_lon: number | null;
      name: string | null;
      mime: string | null;
      size: number | null;
      total_size: number;
      file_count: number;
    }>(
      `SELECT d.id, d.created_at, d.geo_city AS d_city, d.geo_lat AS d_lat, d.geo_lon AS d_lon,
              c.geo_city AS c_city, c.geo_lat AS c_lat, c.geo_lon AS c_lon,
              f.name, f.mime, f.size, c.total_size, c.file_count
       FROM templink.downloads d
       JOIN templink.collections c ON c.id = d.collection_id
       LEFT JOIN templink.files f ON f.id = d.file_id
       ORDER BY d.created_at DESC LIMIT 40`,
    ),
    all<{
      id: string;
      created_at: number;
      geo_city: string | null;
      geo_lat: number | null;
      geo_lon: number | null;
      total_size: number;
      file_count: number;
      name: string | null;
      mime: string | null;
    }>(
      `SELECT c.id, c.created_at, c.geo_city, c.geo_lat, c.geo_lon, c.total_size, c.file_count, f.name, f.mime
       FROM templink.collections c
       LEFT JOIN LATERAL (SELECT name, mime FROM templink.files WHERE collection_id = c.id LIMIT 1) f ON true
       WHERE c.status <> 'uploading'
       ORDER BY c.created_at DESC LIMIT 20`,
    ),
  ]);

  const label = (name: string | null, mime: string | null, n: number) =>
    n > 1 ? `${n} files` : KIND_LABEL[fileKind(mime ?? "", name ?? "")] ?? "File";

  const events: LiveEvent[] = [
    ...dlRows.slice(0, 16).map((d) => ({
      key: `d${d.id}`,
      kind: "download" as const,
      label: d.name ? label(d.name, d.mime, 1) : "Archive",
      size: d.size ?? d.total_size,
      from: d.c_city,
      to: d.d_city,
      at: d.created_at,
    })),
    ...upRows.slice(0, 12).map((c) => ({
      key: `u${c.id}`,
      kind: "upload" as const,
      label: label(c.name, c.mime, c.file_count),
      size: c.total_size,
      from: c.geo_city,
      to: null,
      at: c.created_at,
    })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 16);

  const has = (lat: number | null, lon: number | null): lat is number => lat != null && lon != null;
  const arcs = dlRows
    .filter((d) => has(d.c_lat, d.c_lon) && has(d.d_lat, d.d_lon))
    .filter((d) => d.c_lat !== d.d_lat || d.c_lon !== d.d_lon)
    .map((d) => ({ from: [d.c_lat!, d.c_lon!] as [number, number], to: [d.d_lat!, d.d_lon!] as [number, number] }));
  const points = upRows.filter((c) => has(c.geo_lat, c.geo_lon)).map((c) => [c.geo_lat!, c.geo_lon!] as [number, number]);

  return {
    liveLinks,
    counters: { bytes: totals?.bytes ?? 0, files: totals?.files ?? 0, downloads, countries },
    events,
    arcs,
    points,
  };
}
