import { useId } from "react";
import type { CvPeakFit } from "../lib/cvTypes";

interface CvPeakRegressionChartProps {
  fits: CvPeakFit[];
  title: string;
  xLabel: string;
  yLabel: string;
  emptyLabel: string;
  legendLabel: string;
  peakLabel: (index: number) => string;
  forwardLabel: string;
  reverseLabel: string;
  oxidationLabel: string;
  reductionLabel: string;
  exportId?: string;
  metadata?: string[];
}

const size = { width: 800, height: 430 };
const margin = { top: 80, right: 28, bottom: 58, left: 72 };
const colors = ["#16697a", "#d47b3c", "#6f58a8", "#2f8f78", "#a6423f", "#54788a", "#886c35", "#8a5680", "#4d7590", "#8f5f43"];

export function CvPeakRegressionChart({
  fits,
  title,
  xLabel,
  yLabel,
  emptyLabel,
  legendLabel,
  peakLabel,
  forwardLabel,
  reverseLabel,
  oxidationLabel,
  reductionLabel,
  exportId,
  metadata = []
}: CvPeakRegressionChartProps): React.ReactElement {
  const titleId = useId();
  const prepared = fits.map((fit) => {
    const measured = fit.points.flatMap((point) => point.candidate && !["missing", "excluded", "nearZeroCurrentUnstable"].includes(point.status)
      && point.candidate.current !== 0
      ? [{ x: Math.log(point.scanRate), y: Math.log(Math.abs(point.candidate.current)), seriesIndex: point.seriesIndex }]
      : []);
    const line = fit.b === null || fit.intercept === null || measured.length < 2 ? [] : [
      Math.min(...measured.map((point) => point.x)),
      Math.max(...measured.map((point) => point.x))
    ].map((x) => ({ x, y: fit.intercept! + fit.b! * x }));
    return { fit, measured, line };
  });
  const all = prepared.flatMap((item) => [...item.measured, ...item.line]);
  if (all.length === 0) return <div className="scientific-chart-empty" role="status">{emptyLabel}</div>;
  const xDomain = expand(Math.min(...all.map((point) => point.x)), Math.max(...all.map((point) => point.x)));
  const yDomain = expand(Math.min(...all.map((point) => point.y)), Math.max(...all.map((point) => point.y)));
  const width = size.width - margin.left - margin.right;
  const height = size.height - margin.top - margin.bottom;
  const x = (value: number) => margin.left + normalize(value, xDomain) * width;
  const y = (value: number) => size.height - margin.bottom - normalize(value, yDomain) * height;
  const xTicks = ticks(xDomain);
  const yTicks = ticks(yDomain);

  return <div className="scientific-chart-shell cv-peak-regression-shell">
    <svg role="img" aria-labelledby={titleId} viewBox={`0 0 ${size.width} ${size.height}`} width="100%" height="auto" className="scientific-chart-svg" data-export-id={exportId}>
      <title id={titleId}>{title}</title>
      {metadata.length > 0 && <desc>{metadata.join(". ")}</desc>}
      <g role="group" aria-label={legendLabel}>
        {prepared.slice(0, 10).map(({ fit }, index) => {
          const label = `${peakLabel(fit.labelIndex)} · ${fit.branch === "forward" ? forwardLabel : reverseLabel} · ${fit.kind === "oxidation" ? oxidationLabel : reductionLabel} · b = ${fit.b === null ? "—" : fit.b.toFixed(3)}`;
          return <g key={fit.peakId} transform={`translate(${margin.left + (index % 2) * width / 2} ${18 + Math.floor(index / 2) * 16})`}>
            <line x1={0} x2={20} y1={0} y2={0} stroke={colors[index % colors.length]} strokeWidth={2} />
            <text x={26} y={4} fill="#31464f" fontSize={9.5}>{label}</text>
          </g>;
        })}
      </g>
      <g aria-hidden="true">
        {yTicks.map((tick) => <line key={tick} x1={margin.left} x2={size.width - margin.right} y1={y(tick)} y2={y(tick)} stroke="#d7dfdc" />)}
        <line x1={margin.left} x2={margin.left} y1={margin.top} y2={size.height - margin.bottom} stroke="#607d8b" />
        <line x1={margin.left} x2={size.width - margin.right} y1={size.height - margin.bottom} y2={size.height - margin.bottom} stroke="#607d8b" />
        {xTicks.map((tick) => <text key={tick} x={x(tick)} y={size.height - margin.bottom + 22} textAnchor="middle" fill="#455a64" fontSize={11}>{format(tick)}</text>)}
        {yTicks.map((tick) => <text key={tick} x={margin.left - 10} y={y(tick) + 4} textAnchor="end" fill="#455a64" fontSize={11}>{format(tick)}</text>)}
        <text x={margin.left + width / 2} y={size.height - 12} textAnchor="middle" fill="#263238" fontSize={12}>{xLabel}</text>
        <text x={18} y={margin.top + height / 2} textAnchor="middle" transform={`rotate(-90 18 ${margin.top + height / 2})`} fill="#263238" fontSize={12}>{yLabel}</text>
      </g>
      {prepared.map(({ fit, measured, line }, index) => <g key={fit.peakId} data-peak-id={fit.peakId}>
        {line.length === 2 && <path
          data-peak-regression-line={fit.peakId}
          d={`M ${x(line[0]!.x)} ${y(line[0]!.y)} L ${x(line[1]!.x)} ${y(line[1]!.y)}`}
          fill="none"
          stroke={colors[index % colors.length]}
          strokeWidth={2}
        />}
        {measured.map((point) => <circle key={point.seriesIndex} data-peak-regression-point={fit.peakId} cx={x(point.x)} cy={y(point.y)} r={4} fill={colors[index % colors.length]} />)}
      </g>)}
    </svg>
  </div>;
}

function expand(minimum: number, maximum: number): [number, number] {
  const padding = minimum === maximum ? Math.max(0.1, Math.abs(minimum) * 0.05) : 0.05 * (maximum - minimum);
  return [minimum - padding, maximum + padding];
}

function normalize(value: number, domain: [number, number]) {
  return (value - domain[0]) / (domain[1] - domain[0]);
}

function ticks(domain: [number, number]) {
  return Array.from({ length: 5 }, (_, index) => domain[0] + index * (domain[1] - domain[0]) / 4);
}

function format(value: number) {
  return Number(value.toFixed(3)).toString();
}
