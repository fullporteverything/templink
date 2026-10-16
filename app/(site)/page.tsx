import Link from "next/link";
import Uploader from "@/components/Uploader";
import { IconClock, IconFlag, IconLock, IconShield, IconUpload, IconZap } from "@/components/icons";
import { LiveProvider } from "@/components/live/LiveContext";
import { LiveCounters, LiveGlobe, LiveTicker } from "@/components/live/LiveWidgets";
import { expiryLabel, formatBytes } from "@/lib/format";
import { getLive } from "@/lib/live";
import { getSettings, headlineParts } from "@/lib/settings";

export default async function Home() {
  const [s, live] = await Promise.all([getSettings(), getLive()]);
  const longest = Math.max(...s.expiryOptionsHours);
  const maxFile = formatBytes(s.maxFileSizeMb * 1024 * 1024);
  const [lead, tail] = headlineParts(s.tagline);

  return (
    <LiveProvider initial={live}>
      <section className="relative overflow-hidden">
        {/* Globe: bleeds off the right edge on desktop, sits under the copy on mobile. */}
        <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
          <div className="absolute top-[52%] -right-[12%] aspect-square w-[min(56vw,860px)] -translate-y-1/2">
            <LiveGlobe className="pointer-events-auto size-full" />
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 lg:min-h-[calc(100dvh-3.5rem-74px)] lg:pt-24 lg:pb-24">
          <p className="eyebrow rise text-accent">
            Free · {maxFile} per file · No account
          </p>
          <h1 className="display rise rise-1 mt-6 max-w-[11ch] text-[clamp(3.2rem,9vw,7.25rem)]">
            {lead}
            {tail && <span className="block text-faint">{tail}</span>}
          </h1>
          <p className="rise rise-2 mt-7 max-w-md text-lg leading-relaxed text-muted text-pretty">
            Drop anything up to {maxFile} per file. The link is live the moment the last byte lands, and it deletes
            itself on schedule, after an hour or up to {expiryLabel(longest)}.
          </p>
          <div className="rise rise-3 mt-9 lg:max-w-lg">
            <Uploader
              limits={{
                maxFileSizeMb: s.maxFileSizeMb,
                maxFilesPerLink: s.maxFilesPerLink,
                expiryOptionsHours: s.expiryOptionsHours,
                defaultExpiryHours: s.defaultExpiryHours,
                uploadsEnabled: s.uploadsEnabled,
              }}
            />
          </div>
        </div>

        <div className="relative -mt-6 h-[340px] overflow-hidden sm:h-[420px] lg:hidden" aria-hidden>
          <div className="absolute top-0 left-1/2 aspect-square w-[150%] max-w-[760px] -translate-x-1/2">
            <LiveGlobe className="size-full" />
          </div>
        </div>
      </section>

      <LiveTicker />
      <LiveCounters siteName={s.siteName} />

      <section id="how" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <p className="eyebrow text-accent">How it works</p>
          <h2 className="display mt-4 max-w-2xl text-4xl sm:text-6xl">
            Three steps. <span className="text-faint">Zero accounts.</span>
          </h2>
          <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
            {[
              {
                icon: IconUpload,
                t: "Drop your files",
                b: "One file or fifty. They stream straight to encrypted storage with resumable uploads, so a flaky connection doesn't start you over.",
              },
              {
                icon: IconZap,
                t: "Share one link",
                b: "The link is live the moment the last byte lands. Add a password, a download limit or a note for the recipient.",
              },
              {
                icon: IconClock,
                t: "It disappears",
                b: `When the timer runs out (up to ${expiryLabel(longest)}) or the download limit is hit, the files are deleted for good.`,
              },
            ].map((step, i) => (
              <li key={step.t} className="relative bg-surface p-7 sm:p-8">
                <span className="font-mono text-xs text-faint">0{i + 1}</span>
                <step.icon size={26} className="mt-6 text-accent" />
                <p className="mt-4 text-lg font-semibold tracking-tight">{step.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <p className="eyebrow text-accent">Built for sending</p>
          <h2 className="display mt-4 max-w-3xl text-4xl sm:text-6xl">
            Everything a link needs. <span className="text-faint">Nothing it doesn&apos;t.</span>
          </h2>
          <div className="mt-14 grid gap-4 md:grid-cols-6">
            <Feature className="md:col-span-4" icon={IconClock} title="Expiry you control" body="Pick how long each link lives. After that the files are gone, not archived.">
              <div className="mt-6 flex flex-wrap gap-2">
                {s.expiryOptionsHours.map((h) => (
                  <span key={h} className={`rounded-full border px-3 py-1 font-mono text-xs ${h === s.defaultExpiryHours ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}>
                    {expiryLabel(h)}
                  </span>
                ))}
              </div>
            </Feature>
            <Feature className="md:col-span-2" icon={IconLock} title="Password & limits" body="Lock a link, or let it delete itself after N downloads." />
            <Feature className="md:col-span-2" icon={IconShield} title="Safe by default" body="Private storage, short-lived download URLs, and files are never run in your browser." />
            <Feature className="md:col-span-2" icon={IconZap} title="Previews" body="Images, video, audio and PDFs preview right on the share page." />
            <Feature className="md:col-span-2" icon={IconFlag} title="Report anything" body="Every link has a report button that goes straight to moderators." />
          </div>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-20 sm:px-6 md:flex-row md:items-center">
          <h2 className="display text-4xl sm:text-5xl">
            Got something to send? <span className="text-faint">It takes seconds.</span>
          </h2>
          <Link href="/" className="btn-ink h-12 px-6 text-base">
            Send files now
          </Link>
        </div>
      </section>
    </LiveProvider>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
  className = "",
  children,
}: {
  icon: (p: { size?: number; className?: string }) => React.ReactNode;
  title: string;
  body: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-3xl border border-line bg-bg p-7 transition-colors hover:border-accent/40 ${className}`}>
      <Icon size={22} className="text-accent" />
      <p className="mt-5 text-lg font-semibold tracking-tight">{title}</p>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">{body}</p>
      {children}
    </div>
  );
}
