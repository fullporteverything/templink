import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-xs text-muted hover:text-fg">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  active: "bg-ok/12 text-ok border-ok/25",
  customer: "bg-ok/12 text-ok border-ok/25",
  resolved: "bg-ok/12 text-ok border-ok/25",
  qualified: "bg-accent/12 text-accent border-accent/25",
  lead: "bg-accent-soft text-accent border-accent/20",
  uploading: "bg-warn/12 text-warn border-warn/25",
  disabled: "bg-warn/12 text-warn border-warn/25",
  open: "bg-warn/12 text-warn border-warn/25",
  report: "bg-bad/10 text-bad border-bad/25",
  blocked: "bg-bad/10 text-bad border-bad/25",
  deleted: "bg-surface-2 text-faint border-line",
  expired: "bg-surface-2 text-faint border-line",
  churned: "bg-surface-2 text-faint border-line",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
        TONES[value] ?? "border-line bg-surface-2 text-muted"
      }`}
    >
      {label ?? value}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-12 text-center text-sm text-muted">{children}</div>;
}

/** Link-based segmented filter that keeps other query params. */
export function Tabs({
  base,
  param,
  current,
  options,
  keep = {},
}: {
  base: string;
  param: string;
  current: string;
  options: { value: string; label: string; count?: number }[];
  keep?: Record<string, string | undefined>;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1 text-sm">
      {options.map((o) => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v);
        if (o.value) q.set(param, o.value);
        const href = `${base}${q.size ? `?${q}` : ""}`;
        const on = current === o.value;
        return (
          <Link
            key={o.value}
            href={href}
            className={`rounded-lg px-3 py-1.5 capitalize transition ${on ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-fg"}`}
          >
            {o.label}
            {o.count != null && <span className="ml-1.5 text-xs text-faint tabular-nums">{o.count}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export function SearchBox({ action, q, placeholder, hidden = {} }: { action: string; q?: string; placeholder: string; hidden?: Record<string, string | undefined> }) {
  return (
    <form action={action} className="w-full sm:w-72">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input name="q" defaultValue={q} placeholder={placeholder} className="input" type="search" />
    </form>
  );
}

export function initials(name: string | null, email: string) {
  const src = (name || email).trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({ name, email, size = 32 }: { name: string | null; email: string; size?: number }) {
  let h = 0;
  for (const ch of email) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `oklch(0.6 0.13 ${h})` }}
      aria-hidden
    >
      {initials(name, email)}
    </span>
  );
}
