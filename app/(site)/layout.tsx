import Link from "next/link";
import { Logo } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import { count, now } from "@/lib/db";
import { getSettings, plainTagline } from "@/lib/settings";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [s, live] = await Promise.all([
    getSettings(),
    count("SELECT COUNT(*) AS n FROM templink.collections WHERE status = 'active' AND expires_at > ?", now()),
  ]);
  return (
    <div className="flex min-h-dvh flex-col">
      {s.announcement && (
        <div className="bg-ink px-4 py-2 text-center text-xs font-medium text-ink-fg">{s.announcement}</div>
      )}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo size={22} />
            <span>{s.siteName}</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-muted md:flex">
            <Link href="/#how" className="hover:text-fg">
              How it works
            </Link>
            <Link href="/#features" className="hover:text-fg">
              Features
            </Link>
            <Link href="/contact" className="hover:text-fg">
              Contact
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {live > 0 && (
              <span className="hidden items-center gap-2 font-mono text-xs text-muted sm:flex">
                <span className="live-dot size-1.5 rounded-full bg-ok" />
                {live} live link{live === 1 ? "" : "s"}
              </span>
            )}
            <ThemeToggle />
            <Link href="/" className="btn-ink btn-sm h-9">
              Send files
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 text-sm sm:grid-cols-[1.5fr_1fr_1fr] sm:px-6">
          <div>
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Logo size={20} /> {s.siteName}
            </Link>
            <p className="mt-3 max-w-xs text-muted">{plainTagline(s.tagline)} Files are deleted automatically when their link expires.</p>
          </div>
          <div className="space-y-2">
            <p className="eyebrow text-faint">Product</p>
            <Link href="/" className="block text-muted hover:text-fg">
              Send files
            </Link>
            <Link href="/#how" className="block text-muted hover:text-fg">
              How it works
            </Link>
          </div>
          <div className="space-y-2">
            <p className="eyebrow text-faint">Help</p>
            <Link href="/contact" className="block text-muted hover:text-fg">
              Contact
            </Link>
            <Link href="/terms" className="block text-muted hover:text-fg">
              Terms &amp; abuse
            </Link>
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-faint sm:px-6">
          © {new Date().getFullYear()} {s.siteName}
        </div>
      </footer>
    </div>
  );
}
