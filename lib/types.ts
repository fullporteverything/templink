// Row types shared by server code and client components. Keep this file free of server imports.

export type Collection = {
  id: string;
  status: "uploading" | "active" | "disabled" | "expired" | "deleted";
  title: string | null;
  message: string | null;
  password_hash: string | null;
  max_downloads: number | null;
  download_count: number;
  views: number;
  file_count: number;
  total_size: number;
  uploader_email: string | null;
  uploader_ip: string | null;
  contact_id: number | null;
  manage_token: string;
  created_at: number;
  expires_at: number;
  deleted_at: number | null;
  geo_city: string | null;
  geo_country: string | null;
  geo_lat: number | null;
  geo_lon: number | null;
};

export type FileRow = {
  id: string;
  collection_id: string;
  name: string;
  size: number;
  mime: string;
  downloads: number;
  created_at: number;
};

export type Contact = {
  id: number;
  email: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  status: ContactStatus;
  tags: string;
  source: string;
  value_cents: number;
  created_at: number;
  updated_at: number;
  last_seen_at: number | null;
};

export const CONTACT_STATUSES = ["lead", "qualified", "customer", "churned", "blocked"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export type Activity = {
  id: number;
  contact_id: number;
  type: "note" | "upload" | "message" | "report" | "status" | "email";
  body: string;
  ref: string | null;
  created_at: number;
};

export type Message = {
  id: number;
  kind: "contact" | "report";
  status: "open" | "resolved";
  name: string | null;
  email: string | null;
  subject: string | null;
  body: string;
  collection_id: string | null;
  contact_id: number | null;
  ip: string | null;
  created_at: number;
};
