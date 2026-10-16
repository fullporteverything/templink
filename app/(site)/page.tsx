import Uploader from "@/components/Uploader";
import { IconClock, IconLock, IconShield, IconZap } from "@/components/icons";
import { expiryLabel, formatBytes } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export default function Home() {
  const s = getSettings();
  const longest = Math.max(...s.expiryOptionsHours);
  const features = [
    { icon: IconZap, title: "No account", body: "Drop files, get a link. Nobody needs to sign up, you or the recipient." },
    {
      icon: IconClock,
      title: "Links that expire",
      body: `Pick how long the link lives, up to ${expiryLabel(longest)}. Then the files are deleted for good.`,
    },
    { icon: IconLock, title: "Password & limits", body: "Lock a link with a password or let it delete itself after N downloads." },
    { icon: IconShield, title: "Safe downloads", body: "Files are streamed as downloads, never run in the browser. Anyone can report abuse." },
  ];

  return (
    <>
      <section className="mx-auto grid max-w-5xl gap-10 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-start lg:pt-14">
        <div className="lg:sticky lg:top-14">
          <p className="chip mb-5">
            <span className="size-1.5 rounded-full bg-ok" /> Free · up to {formatBytes(s.maxFileSizeMb * 1024 * 1024)} per file
          </p>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {s.tagline}
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted text-pretty">
            Upload anything and share one link. It works for a few hours or a few days, then everything is deleted.
          </p>
          <dl className="mt-8 grid max-w-sm grid-cols-3 gap-4 border-t border-line pt-6 text-sm">
            <div>
              <dt className="text-faint">Max file</dt>
              <dd className="mt-0.5 font-medium">{formatBytes(s.maxFileSizeMb * 1024 * 1024)}</dd>
            </div>
            <div>
              <dt className="text-faint">Files / link</dt>
              <dd className="mt-0.5 font-medium">{s.maxFilesPerLink}</dd>
            </div>
            <div>
              <dt className="text-faint">Up to</dt>
              <dd className="mt-0.5 font-medium">{expiryLabel(longest)}</dd>
            </div>
          </dl>
        </div>
        <Uploader
          limits={{
            maxFileSizeMb: s.maxFileSizeMb,
            maxFilesPerLink: s.maxFilesPerLink,
            expiryOptionsHours: s.expiryOptionsHours,
            defaultExpiryHours: s.defaultExpiryHours,
            uploadsEnabled: s.uploadsEnabled,
          }}
        />
      </section>

      <section id="how" className="mx-auto max-w-5xl scroll-mt-10 px-4 pb-20 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Upload", "Drag in one file or a whole folder's worth. Uploads go straight to storage."],
            ["Share the link", "Copy the link and send it however you like. Add a password if it's sensitive."],
            ["It disappears", "When the timer runs out or the download limit is hit, the files are deleted."],
          ].map(([t, b], i) => (
            <li key={t} className="card p-5">
              <span className="font-mono text-xs text-accent">0{i + 1}</span>
              <p className="mt-2 font-medium">{t}</p>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title}>
              <f.icon className="text-accent" size={22} />
              <p className="mt-3 font-medium">{f.title}</p>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
