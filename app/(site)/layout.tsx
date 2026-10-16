import Link from "next/link";
import { Logo } from "@/components/icons";
import { getSettings } from "@/lib/settings";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = getSettings();
  return (
    <div className="flex min-h-dvh flex-col">
      {s.announcement && (
        <div className="bg-accent px-4 py-2 text-center text-xs font-medium text-accent-fg">{s.announcement}</div>
      )}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Logo />
          <span>{s.siteName}</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm text-muted">
          <Link href="/#how" className="hidden rounded-lg px-3 py-1.5 hover:bg-surface-2 hover:text-fg sm:block">
            How it works
          </Link>
          <Link href="/contact" className="rounded-lg px-3 py-1.5 hover:bg-surface-2 hover:text-fg">
            Contact
          </Link>
          <Link href="/" className="btn-primary btn-sm ml-1">
            Send files
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mx-auto w-full max-w-5xl px-4 py-10 text-xs text-faint sm:px-6">
        <div className="flex flex-col justify-between gap-3 border-t border-line pt-6 sm:flex-row">
          <span>
            © {new Date().getFullYear()} {s.siteName}. Files are deleted automatically when their link expires.
          </span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-fg">
              Terms &amp; abuse
            </Link>
            <Link href="/contact" className="hover:text-fg">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
