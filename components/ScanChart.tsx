import { ScanLine } from "lucide-react";
import type { DailyScanPoint } from "@/lib/services/dashboard";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/locale";

interface ScanChartProps {
  data: DailyScanPoint[];
  locale: Locale;
  labels: { valid: string; invalid: string };
  title: string;
}

/** Dependency-free, server-rendered SVG chart with an accessible data table. */
export function ScanChart({ data, locale, labels, title }: ScanChartProps) {
  const total = data.reduce((sum, point) => sum + point.valid + point.invalid, 0);
  if (total === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-control border border-dashed border-border bg-surface px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-brand">
          <ScanLine className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-3 text-sm font-semibold text-ink">No scans yet</p>
        <p className="mt-1 max-w-sm text-sm text-muted">Scans appear here once someone scans a card.</p>
      </div>
    );
  }

  const width = 760;
  const height = 250;
  const padding = { top: 16, right: 16, bottom: 30, start: 38 };
  const plotWidth = width - padding.start - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.map((point) => Math.max(point.valid, point.invalid)));
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;
  const x = (index: number) => padding.start + index * stepX;
  const y = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight;

  const line = (key: "valid" | "invalid") =>
    data.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const area = `${line("valid")} L${x(data.length - 1).toFixed(1)},${padding.top + plotHeight} L${padding.start},${padding.top + plotHeight} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(maxValue * ratio));
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-ink">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" /> {labels.valid}
        </span>
        <span className="flex items-center gap-1.5 font-medium text-ink">
          <span className="h-2.5 w-2.5 rounded-full bg-danger" /> {labels.invalid}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title} preserveAspectRatio="none">
        <title>{title}</title>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.start}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray={tick === 0 ? undefined : "3 5"}
            />
            <text x={padding.start - 6} y={y(tick) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">
              {tick}
            </text>
          </g>
        ))}
        <path d={area} fill="var(--brand)" opacity="0.1" />
        <path className="chart-line" pathLength={1} d={line("valid")} fill="none" stroke="var(--brand)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        <path d={line("invalid")} fill="none" stroke="var(--danger)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((point, index) => (
          <g key={point.date}>
            {index % labelEvery === 0 && index < data.length - 1 ? (
              <text x={x(index)} y={height - 10} textAnchor={index === 0 ? "start" : "middle"} fontSize="10" fill="var(--muted)">
                {formatDate(`${point.date}T00:00:00.000Z`, locale)}
              </text>
            ) : null}
            <circle cx={x(index)} cy={y(point.valid)} r="2.4" fill="var(--brand)">
              <title>{`${formatDate(`${point.date}T00:00:00.000Z`, locale)} — ${labels.valid}: ${point.valid}`}</title>
            </circle>
            <circle cx={x(index)} cy={y(point.invalid)} r="2" fill="var(--danger)">
              <title>{`${formatDate(`${point.date}T00:00:00.000Z`, locale)} — ${labels.invalid}: ${point.invalid}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-brand">View data table</summary>
        <div className="table-wrap mt-2">
          <table className="table">
            <thead>
              <tr><th className="th">Date</th><th className="th">{labels.valid}</th><th className="th">{labels.invalid}</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((point) => (
                <tr key={point.date}>
                  <td className="td">{formatDate(`${point.date}T00:00:00.000Z`, locale)}</td>
                  <td className="td tabular-nums">{point.valid}</td>
                  <td className="td tabular-nums">{point.invalid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
