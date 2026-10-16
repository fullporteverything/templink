"use client";

import { useEffect, useRef, useState } from "react";
import Globe from "@/components/globe/Globe";
import { formatBytes } from "@/lib/format";
import { useLive } from "./LiveContext";

export function LiveGlobe({ className }: { className?: string }) {
  const live = useLive();
  return (
    <Globe
      arcs={live.arcs}
      spots={live.spots}
      events={live.events.map((e) => ({ key: e.key, from: e.fromAt, to: e.toAt }))}
      className={className}
    />
  );
}

function ago(ts: number, now: number) {
  const s = Math.max(1, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/** Scrolling strip of recent, anonymous transfers. Hidden until there's real activity. */
export function LiveTicker() {
  const { events } = useLive();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!events.length) return null;

  // Repeat short lists so the loop is seamless, then duplicate once for the -50% marquee.
  const base = events.length < 6 ? [...events, ...events, ...events] : events;
  const items = [...base, ...base];

  return (
    <div className="marquee-host relative flex items-stretch border-y border-line bg-surface/70 backdrop-blur">
      <div className="relative z-10 flex shrink-0 items-center gap-2 border-r border-line bg-surface px-4 sm:px-6">
        <span className="live-dot size-1.5 rounded-full bg-accent" />
        <span className="eyebrow leading-tight text-accent">
          Live
          <br />
          <span className="text-faint">transfers</span>
        </span>
      </div>
      <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)]">
        <ul className="marquee flex w-max" style={{ ["--marquee-duration" as string]: `${base.length * 6}s` }}>
          {items.map((e, i) => (
            <li key={`${e.key}-${i}`} className="flex shrink-0 flex-col justify-center gap-0.5 border-r border-line px-6 py-3 font-mono text-xs">
              <span className="text-fg">
                {e.label} <span className="text-faint">·</span> {formatBytes(e.size)}
              </span>
              <span className="text-muted">
                {e.kind === "download" ? (
                  <>
                    {e.from ?? "Somewhere"} <span className="text-accent">→</span> {e.to ?? "somewhere"}
                  </>
                ) : (
                  <>uploaded{e.from ? ` in ${e.from}` : ""}</>
                )}{" "}
                <span className="text-faint" suppressHydrationWarning>
                  {now ? ago(e.at, now) : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function useCountUp(target: number, run: boolean, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const from = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 4);
      setV(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

/** "So far, X has moved …" statement with numbers that count up when scrolled into view. */
export function LiveCounters({ siteName }: { siteName: string }) {
  const { counters } = useLive();
  const ref = useRef<HTMLParagraphElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const bytes = useCountUp(counters.bytes, seen);
  const files = useCountUp(counters.files, seen);
  const downloads = useCountUp(counters.downloads, seen);
  const countries = useCountUp(counters.countries, seen);
  if (counters.files < 1) return null;

  const n = (x: number) => Math.round(x).toLocaleString("en-US");
  const B = ({ children, accent }: { children: React.ReactNode; accent?: boolean }) => (
    <strong className={`font-semibold tabular-nums ${accent ? "text-accent" : "text-fg"}`}>{children}</strong>
  );

  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
      <p className="eyebrow flex items-center gap-2 text-muted">
        <span className="live-dot size-1.5 rounded-full bg-ok" /> Live counters
      </p>
      <p ref={ref} className="mt-6 max-w-4xl text-3xl leading-[1.12] font-medium tracking-[-0.035em] text-muted sm:text-5xl">
        So far, {siteName} has moved <B>{formatBytes(bytes)}</B> across <B>{n(files)}</B> file{counters.files === 1 ? "" : "s"}
        {counters.countries > 0 && (
          <>
            , sent from <B>{n(countries)}</B> countr{counters.countries === 1 ? "y" : "ies"}
          </>
        )}
        . They&apos;ve been downloaded <B accent>{n(downloads)}</B> time{counters.downloads === 1 ? "" : "s"}.
      </p>
    </section>
  );
}
