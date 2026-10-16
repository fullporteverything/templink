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

const RIPPLE_MS = 820;
const EASE = "cubic-bezier(0.22, 0.9, 0.24, 1)";

/** A glassy ring that rides the edge of the theme ripple. */
function glassRim(x: number, y: number, r: number) {
  const rim = document.createElement("div");
  rim.setAttribute("aria-hidden", "true");
  Object.assign(rim.style, {
    position: "fixed",
    left: `${x}px`,
    top: `${y}px`,
    width: "0px",
    height: "0px",
    borderRadius: "50%",
    pointerEvents: "none",
    zIndex: "2147483647",
    transform: "translate(-50%, -50%)",
    border: "1.5px solid color-mix(in oklab, var(--accent) 55%, white)",
    boxShadow:
      "0 0 28px 6px color-mix(in oklab, var(--accent) 35%, transparent), inset 0 0 22px 2px color-mix(in oklab, white 30%, transparent)",
    backdropFilter: "blur(2px) saturate(1.4)",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(rim);
  const anim = rim.animate(
    [
      { width: "0px", height: "0px", opacity: 1 },
      { width: `${r * 2}px`, height: `${r * 2}px`, opacity: 0.9, offset: 0.75 },
      { width: `${r * 2}px`, height: `${r * 2}px`, opacity: 0 },
    ],
    { duration: RIPPLE_MS, easing: EASE },
  );
  anim.onfinish = anim.oncancel = () => rim.remove();
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
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition) return swap();

    const box = e.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const t = doc.startViewTransition(swap);
    t.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: RIPPLE_MS, easing: EASE, pseudoElement: "::view-transition-new(root)" },
        );
        glassRim(x, y, r);
      })
      .catch(() => {});
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
