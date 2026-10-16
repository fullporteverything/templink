# Templink: temporary file links, with an admin center and CRM

Templink is a file-sharing site in the style of storage.to. Visitors drop files and get a link that expires. Operators get an admin center to moderate links, handle abuse reports, and manage everyone who uses the service in a built-in CRM.

It's built with Next.js 16 (App Router), TypeScript and Tailwind CSS v4. It runs on **Vercel**, with **Supabase** providing Postgres and Storage.

## How it fits together

```
Browser ──(1) create link──▶ Vercel function ──▶ Postgres (schema "templink")
   │                               └── returns a signed upload token per file
   ├──(2) upload bytes (resumable TUS, 6 MB chunks) ──▶ Supabase Storage (private bucket)
   └──(3) complete ──▶ Vercel function checks every file arrived, starts the expiry clock

Download: /d/<link>/<file> ──▶ checks expiry, password and download limit, counts it,
          then 302s to a short-lived signed Storage URL (Supabase's CDN serves the bytes)
```

File bytes never pass through a Vercel function, so Vercel's 4.5 MB request limit doesn't apply. The one exception is **Download all (.zip)**, which streams through a function and is offered for links up to 2 GB.

All tables live in their own `templink` schema. They have RLS enabled and no access for the public API roles. That means Templink can safely share a Supabase project with other apps.

## Features

**Public site**

- Drag-and-drop, file picker or paste upload. You can send many files per link. Uploads run three at a time, are resumable, and show live progress.
- Expiry is chosen per link (1 hour, 1 day, 3 days or 7 days by default).
- Optional extras per link: a password, a download limit, a title and a message for the recipient.
- The share page shows image, video and audio previews, a PDF preview, per-file downloads and **Download all (.zip)**.
- Uploaders get a private *manage link* to delete the files early. Their recent links are remembered on the device.
- Every link has a **Report abuse** button. There's also a contact form and a terms page.
- **Live globe:** the homepage shows a draggable dot-matrix globe with arcs for real recent transfers (upload city → download city), plus a live-transfers ticker and live counters. Locations come from Vercel's edge headers, are rounded to city level, and the public feed never includes names, links or emails. With no activity yet, the globe shows ambient routes.
- Light/dark/system theme toggle, page-wide drag-and-drop, upload speed and time remaining, a QR code for every link, an image gallery on share pages, and mobile layouts.

**Admin center** (`/admin`)

- **Dashboard:** live links, storage in use, downloads, contacts and pipeline value, a live activity globe and feed, 14-day charts and items that need attention.
- **Links & files:** search and filter links. Disable, re-enable, delete or extend any link, and see its download log and reports.
- **CRM:**
  - Contacts are created automatically from uploaders who leave an email, contact-form senders and abuse reporters.
  - Each contact has a pipeline stage, deal value, tags and a timeline of their uploads, messages, notes and status changes.
  - There's a table view and a pipeline board, plus CSV export.
  - **Blocked** contacts can't upload.
- **Inbox:** contact messages and abuse reports, with reply, resolve and one-click **take down link**.
- **Settings:** site name, two-tone headline (split with `|`), announcement bar, limits, expiry options and an uploads on/off switch.

**Housekeeping & security**

- Links stop working the moment they expire. A daily Vercel Cron job (`/api/cron/cleanup`) also deletes the expired files from storage, and busy routes clean up opportunistically between runs.
- Link passwords are hashed with scrypt, and cookies are HMAC-signed.
- Rate limits are kept in Postgres so they hold across serverless instances. IPs are stored only as keyed hashes.

## Deploy to Vercel + Supabase

1. **Supabase.** Use an existing project or create one. You need four values:
   - **Project URL** and **publishable (anon) key:** Project Settings → API Keys / Data API.
   - **Secret (service_role) key:** Project Settings → API Keys. Server only.
   - **Database URL:** click **Connect** → *Transaction pooler* (port `6543`) and fill in your DB password.

   The schema and the private `templink-files` bucket are created automatically on first request. You can apply `supabase/migrations/0001_templink.sql` yourself instead if you prefer.

2. **Vercel.** Import the GitHub repo and set **Root Directory** to `templink`. Then add these environment variables:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | publishable / anon key (public) |
   | `SUPABASE_SECRET_KEY` | secret / service_role key |
   | `DATABASE_URL` | transaction pooler connection string |
   | `ADMIN_PASSWORD` | password for `/admin` |
   | `SESSION_SECRET` | 32 random characters (`openssl rand -base64 32`) |
   | `CRON_SECRET` | random string; Vercel sends it to the cleanup cron |
   | `MAX_FILE_SIZE_MB` | optional, defaults to 50 |

   The Vercel ↔ Supabase marketplace integration works too. It sets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `POSTGRES_URL`, and Templink reads all of those names.

3. **File size limit.** Supabase's free plan allows 50 MB per file. On Pro, raise the global limit under **Storage → Settings**, then raise *Max file size* in Templink's admin settings to match.

## Local development

```sh
cd templink
npm install
cp .env.example .env.local   # point it at a Supabase project (or a local `supabase start`)
npm run dev                  # http://localhost:3100 — admin password defaults to "admin" in dev
```

## Structure

```
app/(site)/          public pages: upload (/), share page (/s/[id]), manage link, contact, terms
app/api/uploads/     create link (returns signed upload tokens) → complete
app/api/s/[id]/      unlock, report, delete      app/api/cron/cleanup   daily file cleanup
app/d/[id]/          per-file download (signed redirect) and zip stream
app/admin/           login, server actions, CSV export; (panel)/ holds every admin page
components/          Uploader, share-page widgets, admin UI pieces, icons
lib/                 db (Postgres + schema), storage (Supabase), collections, crm, auth, ratelimit, settings
supabase/migrations/ the same schema as SQL
```
