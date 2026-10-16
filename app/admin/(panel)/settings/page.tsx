import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/ui";
import { storageUsed } from "@/lib/collections";
import { formatBytes } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { BUCKET } from "@/lib/storage";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, used] = await Promise.all([getSettings(), storageUsed()]);
  return (
    <>
      <PageHeader title="Settings" subtitle="Changes apply to the public site immediately." />
      <div className="max-w-3xl">
        <SettingsForm settings={settings} />
        <section className="card mt-6 p-6 text-sm">
          <h2 className="font-semibold">Server</h2>
          <dl className="mt-3 space-y-1.5 text-muted">
            <div className="flex justify-between gap-4">
              <dt>Storage bucket</dt>
              <dd className="truncate font-mono text-xs text-fg">{BUCKET}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Stored files</dt>
              <dd className="text-fg">{formatBytes(used)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Admin password</dt>
              <dd className="text-fg">{process.env.ADMIN_PASSWORD ? "Set from ADMIN_PASSWORD" : "Development default"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}
