/** Single-series daily bar chart with a per-bar hover tooltip. Pure CSS, no client JS. */
export function BarChart({ title, data, unit }: { title: string; data: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure className="card p-5">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted tabular-nums">
          {total} {unit} · {data.length} days
        </span>
      </figcaption>
      <div className="relative mt-5 h-36">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
        <span className="absolute -top-2.5 right-0 bg-surface pl-1 text-[10px] text-faint tabular-nums">{max}</span>
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-line">
          {data.map((d) => (
            <div key={d.label} className="group relative flex h-full flex-1 items-end" tabIndex={0}>
              <div
                className="w-full rounded-t-[4px] bg-accent opacity-85 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                style={{ height: d.value ? `${Math.max(2, (d.value / max) * 100)}%` : 0 }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-lg group-hover:block group-focus:block">
                <span className="text-muted">{d.label}</span> <strong className="tabular-nums">{d.value}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-faint">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th>{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
