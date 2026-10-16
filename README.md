# Templink: temporary file links, with an admin center and CRM

A self-hosted file-sharing site in the style of storage.to. Visitors drop files and get a link that expires. Operators get an admin center to moderate links, handle abuse reports, and manage the people who use the service in a built-in CRM.

It's built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4 and SQLite. SQLite comes from Node's built-in `node:sqlite`, so there are no native modules.

## Features

**Public site**

- Drag-and-drop, file picker or paste upload. You can send many files per link. Uploads run three at a time with live progress.
- Files stream straight to disk and are never buffered in memory, so multi-GB uploads work.
- Expiry is chosen per link. The defaults are 1 hour, 1 day, 3 days and 7 days, and admins can change them.
- Optional extras per link: a password, a download limit that deletes the files after N downloads, a title and a message for the recipient.
- The share page shows image, video and audio previews, a PDF preview, per-file downloads and a **Download all (.zip)** option. Downloads can be resumed.
- Uploaders get a private *manage link* that deletes the files early. Their recent links are remembered on the device.
- Every link has a **Report abuse** button. There's also a contact form and a terms page.
- Light and dark mode, and mobile layouts.

**Admin center** (`/admin`)

- **Dashboard:** live links, storage in use, downloads, contacts and pipeline value, plus 14-day charts, the latest links and items that need attention.
- **Links & files:** search by id, title, file name or email, and filter by live, disabled or expired. Each link has a detail page with its files, downloads log and reports. From there you can disable, re-enable, delete or extend expiry.
- **CRM:**
  - Contacts are created automatically from uploaders who leave an email, contact-form senders and abuse reporters.
  - Each contact has a pipeline stage (lead → qualified → customer → churned / blocked), a deal value, tags, company and phone.
  - A table view and a pipeline board view.
  - Each contact has a timeline of their uploads, messages, reports, status changes, notes and logged emails.
  - Contacts export to CSV.
  - A **blocked** contact can't create new links with that email.
- **Inbox:** contact messages and abuse reports, with reply-by-email, mark resolved and **take down link** in one click.
- **Settings:** site name, headline, announcement bar, size and count limits, per-visitor daily limit, expiry options, and a switch to pause uploads.

**Housekeeping**

- Expired links, links that hit their download limit, and uploads abandoned for 6 hours have their files deleted. This runs every 5 minutes and on demand.
- Uploaded files are always served as `attachment` with `nosniff` and a sandboxing CSP. HTML and SVG never render on your origin.
- Link passwords are hashed with scrypt. Unlock and admin cookies are HMAC-signed. Password guessing and contact spam are rate limited. IPs are stored only as keyed hashes.

## Run it

Requires Node.js 22.13 or newer.

```sh
cd templink
npm install
npm run dev              # http://localhost:3100  (admin password: "admin")
```

Production:

```sh
cp .env.example .env     # set ADMIN_PASSWORD and SESSION_SECRET
npm run build
ADMIN_PASSWORD=... SESSION_SECRET=... npm start
```

Or with Docker:

```sh
docker build -t templink .
docker run -p 3100:3100 -v templink-data:/data \
  -e ADMIN_PASSWORD=... -e SESSION_SECRET=$(openssl rand -base64 32) templink
```

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | Password for `/admin`. Required in production. |
| `SESSION_SECRET` | 16+ random characters. Signs cookies and hashes IPs. Required in production. |
| `DATA_DIR` | Where `templink.db` and `files/` live (default `./data`). Put it on a persistent volume. |
| `SITE_NAME` | Initial site name. You can change it later in Settings. |

### Hosting notes

- Templink stores files on local disk, so run it somewhere with a persistent volume: a VPS, Railway, Fly.io, Render or Docker. Serverless hosts like Vercel can't hold uploads there, and they cap request bodies at a few MB.
- Put it behind a reverse proxy (Caddy, nginx or the platform's load balancer) that sets `X-Real-IP` or appends to `X-Forwarded-For`, so per-visitor limits see real IPs. Set the proxy's upload size limit to at least your max file size, for example `client_max_body_size 0;` in nginx.
- Back up `DATA_DIR`. It holds the database, with the CRM data, and the files.

## Structure

```
app/(site)/          public pages: upload (/), share page (/s/[id]), manage link, contact, terms
app/api/             upload (create → PUT each file → complete), unlock, report, delete, contact
app/d/[id]/          file downloads (range support) and the zip stream
app/admin/           login, server actions, CSV export
app/admin/(panel)/   dashboard, links, CRM (table + pipeline + contact pages), inbox, settings
components/          Uploader, share-page widgets, admin UI pieces, icons
lib/                 db (schema + helpers), collections, crm, auth, crypto, settings, formatting
instrumentation.ts   starts the cleanup timer
```
