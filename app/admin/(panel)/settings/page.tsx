import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/ui";
import { storageUsed } from "@/lib/collections";
import { DATA_DIR } from "@/lib/db";
import { formatBytes } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Changes apply to the public site immediately." />
      <div className="max-w-3xl">
        <SettingsForm settings={getSettings()} />
        <section className="card mt-6 p-6 text-sm">
          <h2 className="font-semibold">Server</h2>
          <dl className="mt-3 space-y-1.5 text-muted">
            <div className="flex justify-between gap-4">
              <dt>Data directory</dt>
              <dd className="truncate font-mono text-xs text-fg">{DATA_DIR}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Stored files</dt>
              <dd className="text-fg">{formatBytes(storageUsed())}</dd>
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
