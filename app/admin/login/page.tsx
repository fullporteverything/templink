import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5 font-semibold">
          <Logo size={26} /> {getSettings().siteName} admin
        </div>
        <div className="card p-6">
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
