import type { Metadata } from "next";
import Link from "next/link";
import Uploader from "@/components/Uploader";
import { IconClock, IconFlag, IconLink, IconLock, IconShield, IconUpload } from "@/components/icons";
import { LiveProvider } from "@/components/live/LiveContext";
import { LiveGlobe } from "@/components/live/LiveWidgets";
import { expiryLabel, formatBytes } from "@/lib/format";
import { getLive } from "@/lib/live";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Send files" };

/** A focused upload page: the drop zone up front, with what-happens-next alongside. */
export default async function SendPage() {
  const [s, live] = await Promise.all([getSettings(), getLive()]);
  const longest = Math.max(...s.expiryOptionsHours);

  const steps = [
    {
      icon: IconUpload,
      when: "Now",
      title: "Straight to private storage",
      body: "Files upload directly in resumable chunks. A dropped connection picks up where it left off.",
    },
    {
      icon: IconLink,
      when: "The moment it lands",
      title: "Your link is live",
      body: "Copy it, scan the QR code, or share it from your phone. Add a password or a download cap first if you like.",
    },
    {
      icon: IconClock,
      when: `After ${expiryLabel(s.defaultExpiryHours)} by default`,
      title: "Gone for good",
      body: `You choose anywhere from ${expiryLabel(Math.min(...s.expiryOptionsHours))} to ${expiryLabel(longest)}. When it's up, the files are deleted, not archived.`,
    },
  ];

  return (
    <LiveProvider initial={live}>
      <div className="relative">
        <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-72 [mask-image:linear-gradient(#000,transparent)]" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:gap-14 lg:pt-16">
          <section>
            <p className="eyebrow rise flex items-center gap-2 text-accent">
              <span className="live-dot size-1.5 rounded-full bg-accent" /> New transfer
            </p>
            <h1 className="display rise rise-1 mt-4 text-[clamp(2.6rem,6vw,4.5rem)]">
              Drop it. Share it. <span className="text-faint">Done.</span>
            </h1>
            <p className="rise rise-2 mt-4 max-w-lg text-muted">
              Up to {s.maxFilesPerLink} files, {formatBytes(s.maxFileSizeMb * 1024 * 1024)} each. No account, on either end.
            </p>
            <div className="rise rise-3 mt-8">
              <Uploader
                variant="panel"
                limits={{
                  maxFileSizeMb: s.maxFileSizeMb,
                  maxFilesPerLink: s.maxFilesPerLink,
                  expiryOptionsHours: s.expiryOptionsHours,
                  defaultExpiryHours: s.defaultExpiryHours,
                  uploadsEnabled: s.uploadsEnabled,
                }}
              />
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="card relative overflow-hidden">
              <div className="relative h-56 overflow-hidden bg-bg">
                <div className="absolute top-3 left-1/2 aspect-square w-[130%] -translate-x-1/2">
                  <LiveGlobe className="size-full" />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface to-transparent" />
              </div>
              <div className="flex items-end justify-between gap-4 px-5 pb-5">
                <div>
                  <p className="eyebrow text-faint">Right now</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                    {live.liveLinks} live link{live.liveLinks === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="text-right font-mono text-xs text-muted">
                  {live.counters.downloads.toLocaleString("en-US")} downloads
                  <br />
                  {formatBytes(live.counters.bytes)} moved
                </p>
              </div>
            </div>

            <div className="card p-5">
              <p className="eyebrow text-faint">What happens next</p>
              <ol className="relative mt-4 space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-line">
                {steps.map((step) => (
                  <li key={step.title} className="relative flex gap-4">
                    <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-accent">
                      <step.icon size={15} />
                    </span>
                    <div>
                      <p className="font-mono text-[11px] text-faint">{step.when}</p>
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="card grid grid-cols-3 divide-x divide-line text-center">
              {[
                { icon: IconLock, label: "Passwords" },
                { icon: IconShield, label: "Private storage" },
                { icon: IconFlag, label: "Abuse reports" },
              ].map((f) => (
                <div key={f.label} className="px-2 py-4">
                  <f.icon size={18} className="mx-auto text-accent" />
                  <p className="mt-2 text-xs text-muted">{f.label}</p>
                </div>
              ))}
            </div>
            <p className="px-1 text-xs text-faint">
              By uploading you agree to the{" "}
              <Link href="/terms" className="underline underline-offset-2 hover:text-fg">
                terms &amp; abuse policy
              </Link>
              .
            </p>
          </aside>
        </div>
      </div>
    </LiveProvider>
  );
}
