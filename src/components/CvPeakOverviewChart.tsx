import { useId, useRef } from "react";
import type { CvPeakFit, CvSeries } from "../lib/cvTypes";

interface CvPeakOverviewChartProps {
  series: CvSeries[];
  fits: CvPeakFit[];
  selectedPeakId: string | null;
  selectedSeriesIndex: number;
  onSelectPotential?: (potential: number) => void;
  onSelectPeakPoint?: (peakId: string, seriesIndex: number) => void;
  title: string;
  xLabel: string;
  yLabel: string;
  legendLabel: string;
  peakLabel: (index: number) => string;
  oxidationLabel: string;
  reductionLabel: string;
  exportId?: string;
  metadata?: string[];
}

const size = { width: 800, height: 450 };
const margin = { top: 78, right: 28, bottom: 58, left: 72 };
const colors = ["#16697a", "#6f58a8", "#d47b3c", "#2f8f78", "#a6423f", "#54788a", "#886c35", "#8a5680"];

export function CvPeakOverviewChart({
  series,
  fits,
  selectedPeakId,
  selectedSeriesIndex,
  onSelectPotential,
  onSelectPeakPoint,
  title,
  xLabel,
  yLabel,
  legendLabel,
  peakLabel,
  oxidationLabel,
  reductionLabel,
  exportId,
  metadata = []
}: CvPeakOverviewChartProps): React.ReactElement {
  const titleId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const points = series.flatMap((item) => item.points);
  if (points.length === 0) return <div className="scientific-chart-empty" role="status">—</div>;
  const xDomain = expand(Math.min(...points.map((point) => point.potential)), Math.max(...points.map((point) => point.potential)));
  const yDomain = expand(Math.min(...points.map((point) => point.current)), Math.max(...points.map((point) => point.current)));
  const width = size.width - margin.left - margin.right;
  const height = size.height - margin.top - margin.bottom;
  const x = (value: number) => margin.left + normalize(value, xDomain) * width;
  const y = (value: number) => size.height - margin.bottom - normalize(value, yDomain) * height;
  const xTicks = ticks(xDomain);
  const yTicks = ticks(yDomain);
  const requiredBySeries = new Map<number, Set<number>>();
  fits.forEach((fit) => fit.points.forEach((point) => {
    if (!point.candidate) return;
    const required = requiredBySeries.get(point.seriesIndex) ?? new Set<number>();
    required.add(point.candidate.sourceIndex);
    requiredBySeries.set(point.seriesIndex, required);
  }));

  function handlePlotClick(event: React.MouseEvent<SVGRectElement>) {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const svgX = (event.clientX - bounds.left) / bounds.width * size.width;
    const ratio = Math.min(1, Math.max(0, (svgX - margin.left) / width));
    onSelectPotential?.(xDomain[0] + ratio * (xDomain[1] - xDomain[0]));
  }

  return <div className="scientific-chart-shell cv-peak-overview-shell">
    <svg
      ref={svgRef}
      role="img"
      aria-labelledby={titleId}
      viewBox={`0 0 ${size.width} ${size.height}`}
      width="100%"
      height="auto"
      className="scientific-chart-svg"
      data-export-id={exportId}
    >
      <title id={titleId}>{title}</title>
      {metadata.length > 0 && <desc>{metadata.join(". ")}</desc>}
      <g role="group" aria-label={legendLabel}>
        {series.slice(0, 8).map((item, index) => <g key={`${item.label}-${index}`} transform={`translate(${margin.left + (index % 4) * width / 4} ${18 + Math.floor(index / 4) * 20})`}>
          <line x1={0} x2={22} y1={0} y2={0} stroke={colors[index % colors.length]} strokeWidth={2} />
          <text x={28} y={4} fill="#31464f" fontSize={10.5}>{item.label}</text>
        </g>)}
        <g transform={`translate(${margin.left} 60)`}>
          <path d="M 0 5 L 5 -4 L 10 5 Z" fill="#d47b3c" />
          <text x={16} y={4} fill="#31464f" fontSize={10.5}>{oxidationLabel}</text>
          <circle cx={width / 2} cy={0} r={4} fill="#6f58a8" />
          <text x={width / 2 + 10} y={4} fill="#31464f" fontSize={10.5}>{reductionLabel}</text>
        </g>
      </g>
      <g aria-hidden="true">
        {yTicks.map((tick) => <line key={tick} x1={margin.left} x2={size.width - margin.right} y1={y(tick)} y2={y(tick)} stroke="#d7dfdc" />)}
        <line x1={margin.left} x2={margin.left} y1={margin.top} y2={size.height - margin.bottom} stroke="#607d8b" />
        <line x1={margin.left} x2={size.width - margin.right} y1={size.height - margin.bottom} y2={size.height - margin.bottom} stroke="#607d8b" />
        {xTicks.map((tick) => <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={size.height - margin.bottom} y2={size.height - margin.bottom + 6} stroke="#607d8b" />
          <text x={x(tick)} y={size.height - margin.bottom + 22} textAnchor="middle" fill="#455a64" fontSize={11}>{format(tick)}</text>
        </g>)}
        {yTicks.map((tick) => <text key={tick} x={margin.left - 10} y={y(tick) + 4} textAnchor="end" fill="#455a64" fontSize={11}>{format(tick)}</text>)}
        <text x={margin.left + width / 2} y={size.height - 12} textAnchor="middle" fill="#263238" fontSize={12}>{xLabel}</text>
        <text x={18} y={margin.top + height / 2} textAnchor="middle" transform={`rotate(-90 18 ${margin.top + height / 2})`} fill="#263238" fontSize={12}>{yLabel}</text>
      </g>
      {series.map((item, seriesIndex) => <path
        key={`${item.label}-${seriesIndex}`}
        data-cv-peak-loop={String(seriesIndex)}
        d={linePath(sampleSeries(item, requiredBySeries.get(seriesIndex)), x, y)}
        fill="none"
        stroke={colors[seriesIndex % colors.length]}
        strokeWidth={seriesIndex === selectedSeriesIndex ? 2.2 : 1.25}
        strokeOpacity={seriesIndex === selectedSeriesIndex ? 1 : 0.68}
      />)}
      <rect
        data-peak-click-target="true"
        x={margin.left}
        y={margin.top}
        width={width}
        height={height}
        fill="transparent"
        onClick={handlePlotClick}
      />
      <g className="cv-peak-markers">
        {fits.flatMap((fit) => fit.points.flatMap((point) => {
          const candidate = point.candidate;
          if (!candidate) return [];
          const label = peakLabel(fit.labelIndex);
          const active = fit.peakId === selectedPeakId && point.seriesIndex === selectedSeriesIndex;
          const markerColor = colors[(fit.labelIndex - 1) % colors.length];
          const common = {
            "data-peak-marker": "true",
            "data-peak-kind": fit.kind,
            "data-peak-id": fit.peakId,
            "data-series-index": String(point.seriesIndex),
            "data-source-index": String(candidate.sourceIndex),
            "data-current": String(candidate.current),
            role: "button",
            tabIndex: 0,
            "aria-label": `${label}, ${fit.kind === "oxidation" ? oxidationLabel : reductionLabel}, ${candidate.potential}`,
            onClick: (event: React.MouseEvent<SVGGElement>) => {
              event.stopPropagation();
              onSelectPeakPoint?.(fit.peakId, point.seriesIndex);
            },
            onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectPeakPoint?.(fit.peakId, point.seriesIndex);
              }
            }
          };
          return [<g key={`${fit.peakId}-${point.seriesIndex}`} {...common}>
            {fit.kind === "oxidation"
              ? <path d={`M ${x(candidate.potential)} ${y(candidate.current) - (active ? 8 : 6)} L ${x(candidate.potential) + (active ? 8 : 6)} ${y(candidate.current) + (active ? 6 : 5)} L ${x(candidate.potential) - (active ? 8 : 6)} ${y(candidate.current) + (active ? 6 : 5)} Z`} fill={markerColor} stroke="#fff" strokeWidth={active ? 2 : 1} />
              : <circle cx={x(candidate.potential)} cy={y(candidate.current)} r={active ? 7 : 5} fill={markerColor} stroke="#fff" strokeWidth={active ? 2 : 1} />}
            {active && <text data-peak-label={label} x={x(candidate.potential) + 10} y={y(candidate.current) - 9} fill="#17242a" fontSize={11} fontWeight={700}>{label}</text>}
          </g>];
        }))}
      </g>
    </svg>
  </div>;
}

function sampleSeries(series: CvSeries, required = new Set<number>()) {
  if (series.points.length <= 2_000) return series.points;
  const selected = new Set<number>([0, series.points.length - 1, ...required]);
  const stride = Math.max(1, Math.ceil(series.points.length / (2_000 - selected.size)));
  for (let index = 0; index < series.points.length; index += stride) selected.add(index);
  return [...selected].sort((left, right) => left - right).slice(0, 2_000).map((index) => series.points[index]!);
}

function linePath(points: CvSeries["points"], x: (value: number) => number, y: (value: number) => number) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.potential)} ${y(point.current)}`).join(" ");
}

function expand(minimum: number, maximum: number): [number, number] {
  const padding = minimum === maximum ? Math.max(0.1, Math.abs(minimum) * 0.05) : 0.04 * (maximum - minimum);
  return [minimum - padding, maximum + padding];
}

function normalize(value: number, domain: [number, number]) {
  return (value - domain[0]) / (domain[1] - domain[0]);
}

function ticks(domain: [number, number]) {
  return Array.from({ length: 5 }, (_, index) => domain[0] + index * (domain[1] - domain[0]) / 4);
}

function format(value: number) {
  return Math.abs(value) >= 1e4 || (value !== 0 && Math.abs(value) < 1e-3) ? value.toExponential(2) : Number(value.toFixed(4)).toString();
}
