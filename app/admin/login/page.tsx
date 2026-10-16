import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Globe from "@/components/globe/Globe";
import { Logo } from "@/components/icons";
import { LoginForm } from "@/components/admin/forms";
import { adminPassword, isAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  const configured = !!adminPassword();
  const devDefault = !process.env.ADMIN_PASSWORD && configured;
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[max(900px,110vw)] -translate-x-1/2 -translate-y-[12%] opacity-60" aria-hidden>
        <Globe className="size-full" speed={0.6} />
      </div>
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5 font-semibold">
          <Logo size={26} /> {(await getSettings()).siteName} admin
        </div>
        <div className="card p-6 shadow-[var(--shadow-lg)]">
          {configured ? (
            <LoginForm />
          ) : (
            <p className="text-sm text-muted">
              Set the <code className="font-mono text-fg">ADMIN_PASSWORD</code> environment variable to enable the admin
              center.
            </p>
          )}
        </div>
        {devDefault && (
          <p className="mt-4 text-center text-xs text-warn">
            Development mode: the password is <code className="font-mono">admin</code> until you set ADMIN_PASSWORD.
          </p>
        )}
      </div>
    </div>
  );
}
