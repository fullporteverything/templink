"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { THEME_KEY as KEY } from "@/lib/theme";

type Mode = "system" | "light" | "dark";

function apply(mode: Mode) {
  const el = document.documentElement;
  if (mode === "system") delete el.dataset.theme;
  else el.dataset.theme = mode;
  try {
    if (mode === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

const RIPPLE_MS = 850;
// easeOutCubic, used for both the clip and the rim so they stay locked together.
const EASE_CSS = "cubic-bezier(0.33, 1, 0.68, 1)";
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * The glassy wave front. It's its own view-transition layer (painted above the root snapshot,
 * so the circular clip doesn't cut it) and is redrawn every frame as a ring at the wave's edge.
 */
function makeRim(x: number, y: number, r: number) {
  const rim = document.createElement("div");
  rim.setAttribute("aria-hidden", "true");
  Object.assign(rim.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2147483647",
    viewTransitionName: "theme-rim",
  });
  document.body.appendChild(rim);

  let raf = 0;
  const t0 = performance.now();
  const frame = (now: number) => {
    const p = Math.min(1, (now - t0) / RIPPLE_MS);
    const R = r * ease(p);
    const fade = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
    const glow = "color-mix(in oklab, var(--accent) 45%, transparent)";
    const haze = "color-mix(in oklab, var(--accent) 14%, transparent)";
    rim.style.opacity = String(fade);
    rim.style.background = `radial-gradient(circle at ${x}px ${y}px,
      transparent ${Math.max(0, R - 70)}px,
      ${haze} ${Math.max(0, R - 26)}px,
      ${glow} ${Math.max(0, R - 4)}px,
      rgba(255,255,255,0.95) ${Math.max(0, R - 1)}px,
      ${glow} ${R + 2}px,
      transparent ${R + 26}px)`;
    if (p < 1) raf = requestAnimationFrame(frame);
  };
  return {
    start: () => (raf = requestAnimationFrame(frame)),
    remove: () => {
      cancelAnimationFrame(raf);
      rim.remove();
    },
  };
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setMode(t === "light" || t === "dark" ? t : "system");
  }, []);

  const next: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
  const label = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" }[mode];

  function change(e: React.MouseEvent<HTMLButtonElement>) {
    const m = next[mode];
    const swap = () => {
      flushSync(() => setMode(m));
      apply(m);
    };

    // Ripple the new theme out from the button, poured across the window (View Transitions API).
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
    };
    if (!doc.startViewTransition) return swap();

    const box = e.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const rim = makeRim(x, y, r);
    const t = doc.startViewTransition(swap);
    t.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: RIPPLE_MS, easing: EASE_CSS, pseudoElement: "::view-transition-new(root)" },
        );
        rim.start();
      })
      .catch(rim.remove);
    t.finished.then(rim.remove, rim.remove);
  }

  return (
    <button
      type="button"
      onClick={change}
      className={`grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted transition hover:text-fg ${className}`}
      aria-label={label}
      title={label}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        {mode === "light" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
          </>
        ) : mode === "dark" ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" strokeLinejoin="round" />
        ) : (
          <>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
          </>
        )}
      </svg>
    </button>
  );
}
