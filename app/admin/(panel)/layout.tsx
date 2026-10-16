import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "../actions";
import { AdminNav } from "@/components/admin/AdminNav";
import { IconLogout, Logo } from "@/components/icons";
import { requireAdmin } from "@/lib/auth";
import { one } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const open = one<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE status = 'open'")?.n ?? 0;
  const s = getSettings();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 z-30 border-b border-line bg-surface lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:px-5 lg:py-5">
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5 font-semibold">
            <Logo />
            <span className="truncate">{s.siteName}</span>
          </Link>
          <form action={logout} className="lg:hidden">
            <button className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Sign out">
              <IconLogout size={17} />
            </button>
          </form>
        </div>
        <AdminNav openCount={open} />
        <div className="absolute inset-x-0 bottom-0 hidden space-y-1 p-3 lg:block">
          <Link href="/" target="_blank" className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
            View site ↗
          </Link>
          <form action={logout}>
            <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
              <IconLogout size={17} /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
