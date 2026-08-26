import { useId } from "react";

export interface ChartPoint {
  id?: string;
  x: number;
  y: number | null;
  accessibilityLabel?: string;
}

export interface ChartSeries {
  id: string;
  label: string;
  points: ChartPoint[];
  color: string;
  dash?: string;
  mode?: "line" | "points";
}

export interface ChartAreaPoint {
  x: number;
  lower: number | null;
  upper: number | null;
}

interface FiniteChartAreaPoint {
  x: number;
  lower: number;
  upper: number;
}

export interface ChartAreaSeries {
  id: string;
  label: string;
  color: string;
  opacity?: number;
  pattern?: "diagonalHatch";
  segments: ChartAreaPoint[][];
}

interface ScientificLineChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  emptyLabel: string;
  legendLabel: string;
  series: ChartSeries[];
  areas?: ChartAreaSeries[];
  selectedX?: number;
  onSelectX?: (x: number) => void;
  selectedPointId?: string;
  onSelectPointId?: (id: string) => void;
  exportId?: string;
  metadata?: string | string[];
}

const dimensions = { width: 800, height: 420 };
const margin = { top: 34, right: 24, bottom: 58, left: 72 };
const metadataLineLength = 60;

export function ScientificLineChart({
  title,
  xLabel,
  yLabel,
  emptyLabel,
  legendLabel,
  series,
  areas = [],
  selectedX,
  onSelectX,
  selectedPointId,
  onSelectPointId,
  exportId,
  metadata
}: ScientificLineChartProps): React.ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const patternPrefix = `chart-pattern-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const finiteSeries = series.map((item) => ({
    ...item,
    points: item.points.filter((point) => Number.isFinite(point.x) && (point.y === null || Number.isFinite(point.y)))
  }));
  const finiteAreas = areas.map((item) => ({
    ...item,
    segments: item.segments.flatMap(splitFiniteAreaSegment)
  }));
  const allPoints = finiteSeries.flatMap((item) => item.points.flatMap((point) => point.y === null ? [] : [{ ...point, y: point.y }]));
  const areaBounds = finiteAreas.flatMap((item) => item.segments.flatMap((segment) => segment.flatMap((point) => [
    { x: point.x, y: point.lower },
    { x: point.x, y: point.upper }
  ])));
  const domainPoints = [...allPoints, ...areaBounds];

  if (domainPoints.length === 0) {
    return <div className="scientific-chart-empty" role="status">{emptyLabel}</div>;
  }

  const xDomain = expandedDomain(domainPoints, "x");
  const yDomain = expandedDomain(domainPoints, "y");
  const legendColumns = calculateLegendColumns([
    ...finiteAreas.map((item) => item.label),
    ...finiteSeries.map((item) => item.label)
  ]);
  const legendRows = Math.ceil((finiteAreas.length + finiteSeries.length) / legendColumns);
  const metadataSourceLines = typeof metadata === "string" ? [metadata] : metadata ?? [];
  const metadataLines = metadataSourceLines.flatMap((line) => wrapMetadataLine(line));
  const legendTop = metadataLines.length > 0 ? 17 + metadataLines.length * 18 + 4 : 17;
  const chartMargin = { ...margin, top: Math.max(margin.top, legendTop + legendRows * 22) };
  const plotWidth = dimensions.width - chartMargin.left - chartMargin.right;
  const plotHeight = dimensions.height - chartMargin.top - chartMargin.bottom;
  const projectX = (value: number) => chartMargin.left + normalized(value, xDomain) * plotWidth;
  const projectY = (value: number) => dimensions.height - chartMargin.bottom - normalized(value, yDomain) * plotHeight;
  const xTicks = ticks(xDomain);
  const yTicks = ticks(yDomain);
  const selectedPoint = selectedPointId !== undefined
    ? allPoints.find((point) => point.id === selectedPointId) ?? null
    : Number.isFinite(selectedX)
      ? allPoints.find((point) => point.x === selectedX) ?? null
      : null;
  const supportsPointSelection = Boolean(onSelectX || onSelectPointId);
  const patternId = (item: ChartAreaSeries) => `${patternPrefix}-${item.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  function selectPoint(point: ChartPoint) {
    if (onSelectPointId && point.id !== undefined) onSelectPointId(point.id);
    else onSelectX?.(point.x);
  }

  return (
    <div className="scientific-chart-shell">
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={metadataSourceLines.length > 0 ? descriptionId : undefined}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        width="100%"
        height="auto"
        data-export-id={exportId}
        className="scientific-chart-svg"
      >
        <title id={titleId}>{title}</title>
        {metadataSourceLines.length > 0 && <desc id={descriptionId}>{metadataSourceLines.join(". ")}</desc>}
        {finiteAreas.some((item) => item.pattern === "diagonalHatch") && <defs>
          {finiteAreas.filter((item) => item.pattern === "diagonalHatch").map((item) => <pattern
            key={item.id}
            id={patternId(item)}
            width={8}
            height={8}
            patternUnits="userSpaceOnUse"
          >
            <rect width={8} height={8} fill="#f0f2f1" />
            <line x1={0} y1={8} x2={8} y2={0} stroke={item.color} strokeWidth={1.5} />
          </pattern>)}
        </defs>}
        {metadataLines.length > 0 && <g data-chart-metadata="true">
          {metadataLines.map((line, index) => <text
            key={`${index}-${line}`}
            x={chartMargin.left}
            y={17 + index * 18}
            fill="#455a64"
            fontSize={11}
          >{line}</text>)}
        </g>}
        <g
          className="scientific-chart-legend"
          data-chart-legend="true"
          data-legend-columns={legendColumns}
          role="group"
          aria-label={legendLabel}
        >
          {[...finiteAreas.map((item) => ({ kind: "area" as const, item })), ...finiteSeries.map((item) => ({ kind: "line" as const, item }))].map((entry, index) => {
            const column = index % legendColumns;
            const row = Math.floor(index / legendColumns);
            const x = chartMargin.left + column * (plotWidth / legendColumns);
            const y = legendTop + row * 22;
            const { item } = entry;
            return (
              <g key={item.id} className="scientific-chart-legend-item" transform={`translate(${x} ${y})`}>
                {entry.kind === "area"
                  ? <rect x={1} y={-6} width={24} height={12} rx={2} fill={entry.item.pattern === "diagonalHatch" ? `url(#${patternId(entry.item)})` : entry.item.color} fillOpacity={entry.item.pattern ? 1 : entry.item.opacity ?? 0.68} />
                  : entry.item.mode === "points"
                    ? <circle cx={13} cy={0} r={3.5} fill={entry.item.color} />
                    : <line x1={0} y1={0} x2={26} y2={0} stroke={entry.item.color} strokeWidth={2.25} strokeDasharray={entry.item.dash} />}
                <text x={32} y={4} fill="#263238" fontSize={11}>{item.label}</text>
              </g>
            );
          })}
        </g>
        <g className="scientific-chart-grid" aria-hidden="true">
          {yTicks.map((tick, index) => (
            <line
              key={`y-grid-${index}`}
              x1={chartMargin.left}
              y1={projectY(tick)}
              x2={dimensions.width - chartMargin.right}
              y2={projectY(tick)}
              stroke="#d7dfdc"
              strokeWidth={1}
            />
          ))}
        </g>
        <g className="scientific-chart-areas" aria-hidden="true">
          {finiteAreas.flatMap((item) => item.segments.map((segment, segmentIndex) => (
            <path
              key={`${item.id}-${segmentIndex}`}
              data-area-series-id={item.id}
              data-area-segment-index={segmentIndex}
              data-render-point-count={segment.length}
              d={areaPath(segment, projectX, projectY)}
              fill={item.pattern === "diagonalHatch" ? `url(#${patternId(item)})` : item.color}
              fillOpacity={item.pattern ? 1 : item.opacity ?? 0.68}
              stroke="none"
            />
          )))}
        </g>
        <g className="scientific-chart-axes" aria-hidden="true">
          <line x1={chartMargin.left} y1={chartMargin.top} x2={chartMargin.left} y2={dimensions.height - chartMargin.bottom} stroke="#607d8b" strokeWidth={1.25} />
          <line x1={chartMargin.left} y1={dimensions.height - chartMargin.bottom} x2={dimensions.width - chartMargin.right} y2={dimensions.height - chartMargin.bottom} stroke="#607d8b" strokeWidth={1.25} />
          {xTicks.map((tick, index) => (
            <g key={`x-${index}`}>
              <line x1={projectX(tick)} y1={dimensions.height - chartMargin.bottom} x2={projectX(tick)} y2={dimensions.height - chartMargin.bottom + 6} stroke="#607d8b" strokeWidth={1.25} />
              <text x={projectX(tick)} y={dimensions.height - chartMargin.bottom + 22} textAnchor="middle" fill="#455a64" fontSize={11}>{formatTick(tick)}</text>
            </g>
          ))}
          {yTicks.map((tick, index) => (
            <g key={`y-${index}`}>
              <line x1={chartMargin.left - 6} y1={projectY(tick)} x2={chartMargin.left} y2={projectY(tick)} stroke="#607d8b" strokeWidth={1.25} />
              <text x={chartMargin.left - 10} y={projectY(tick) + 4} textAnchor="end" fill="#455a64" fontSize={11}>{formatTick(tick)}</text>
            </g>
          ))}
          <text className="scientific-chart-x-label" x={chartMargin.left + plotWidth / 2} y={dimensions.height - 12} textAnchor="middle" fill="#263238" fontSize={12}>{xLabel}</text>
          <text
            className="scientific-chart-y-label"
            x={18}
            y={chartMargin.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 18 ${chartMargin.top + plotHeight / 2})`}
            fill="#263238"
            fontSize={12}
          >{yLabel}</text>
        </g>
        <g className="scientific-chart-series">
          {finiteSeries.map((item) => (
            <g key={item.id}>
              {item.mode !== "points" && item.points.some((point) => point.y !== null) && (
                <path
                  data-series-id={item.id}
                  data-render-point-count={item.points.filter((point) => point.y !== null).length}
                  data-gap-run-count={countNullRuns(item.points)}
                  d={linePath(item.points, projectX, projectY)}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2.25}
                  strokeDasharray={item.dash}
                />
              )}
              {item.mode === "points" && item.points.flatMap((point, index) => point.y === null ? [] : [(
                <circle key={`${item.id}-visible-${point.x}-${index}`} data-point-series-id={item.id} data-point-x={String(point.x)} cx={projectX(point.x)} cy={projectY(point.y)} r={3.5} fill={item.color} />
              )])}
              {supportsPointSelection && item.points.flatMap((point, index) => point.y === null ? [] : [(
                <circle
                  key={`${item.id}-${point.id ?? point.x}-${index}`}
                  className="scientific-chart-point"
                  data-point-x={String(point.x)}
                  data-point-id={point.id}
                  cx={projectX(point.x)}
                  cy={projectY(point.y)}
                  r={7}
                  fill="transparent"
                  stroke="none"
                  tabIndex={0}
                  role="button"
                  aria-label={point.accessibilityLabel ?? `${item.label}: ${xLabel} ${formatTick(point.x)}, ${yLabel} ${formatTick(point.y)}`}
                  onClick={() => selectPoint(point)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectPoint(point);
                    }
                  }}
                />
              )])}
            </g>
          ))}
        </g>
        {selectedPoint && (
          <g className="scientific-chart-selection" aria-hidden="true">
            <line
              x1={projectX(selectedPoint.x)}
              y1={chartMargin.top}
              x2={projectX(selectedPoint.x)}
              y2={dimensions.height - chartMargin.bottom}
              stroke="#263238"
              strokeDasharray="3 3"
            />
            <circle
              data-selected-x={String(selectedPoint.x)}
              data-selected-point-id={selectedPoint.id}
              cx={projectX(selectedPoint.x)}
              cy={projectY(selectedPoint.y)}
              r={4.5}
              fill="#ffffff"
              stroke="#263238"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
    </div>
  );
}

function expandedDomain(points: Array<{ x: number; y: number }>, axis: "x" | "y"): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const value = point[axis];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min !== max) return [min, max];
  if (min === 0) return [-1, 1];

  const padding = Math.abs(min) * 0.05 || Number.MIN_VALUE;
  const lower = min - padding;
  const upper = max + padding;
  if (Number.isFinite(lower) && lower < min && Number.isFinite(upper) && upper > max) return [lower, upper];
  if (Number.isFinite(lower) && lower < min) return [lower, max];
  if (Number.isFinite(upper) && upper > max) return [min, upper];
  return min > 0 ? [min / 2, min] : [min, min / 2];
}

function ticks([min, max]: [number, number], count = 5): number[] {
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return min * (1 - ratio) + max * ratio;
  });
}

function normalized(value: number, [min, max]: [number, number]): number {
  const scale = Math.max(Math.abs(min), Math.abs(max), Number.MIN_VALUE);
  const scaledMin = min / scale;
  return (value / scale - scaledMin) / (max / scale - scaledMin);
}

function linePath(
  points: Array<{ x: number; y: number | null }>,
  projectX: (value: number) => number,
  projectY: (value: number) => number
): string {
  let move = true;
  const commands: string[] = [];
  for (const point of points) {
    if (point.y === null) { move = true; continue; }
    commands.push(`${move ? "M" : "L"} ${projectX(point.x)} ${projectY(point.y)}`);
    move = false;
  }
  return commands.join(" ");
}

function calculateLegendColumns(labels: string[]) {
  if (labels.length === 0) return 1;
  const availableWidth = dimensions.width - margin.left - margin.right;
  const widestItem = Math.max(...labels.map((label) => 44 + [...label].reduce(
    (width, character) => width + (character.charCodeAt(0) > 255 ? 11 : 6.2),
    0
  )));
  return Math.max(1, Math.min(4, labels.length, Math.floor(availableWidth / widestItem)));
}

function areaPath(
  segment: FiniteChartAreaPoint[],
  projectX: (value: number) => number,
  projectY: (value: number) => number
): string {
  const upper = segment.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${projectX(point.x)} ${projectY(point.upper)}`);
  const lower = [...segment].reverse().map((point) =>
    `L ${projectX(point.x)} ${projectY(point.lower)}`);
  return [...upper, ...lower, "Z"].join(" ");
}

function splitFiniteAreaSegment(segment: ChartAreaPoint[]): FiniteChartAreaPoint[][] {
  const runs: FiniteChartAreaPoint[][] = [];
  let current: FiniteChartAreaPoint[] = [];
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };
  for (const point of segment) {
    if (Number.isFinite(point.x)
      && typeof point.lower === "number" && Number.isFinite(point.lower)
      && typeof point.upper === "number" && Number.isFinite(point.upper)) {
      current.push({ x: point.x, lower: point.lower, upper: point.upper });
    } else flush();
  }
  flush();
  return runs;
}

function countNullRuns(points: Array<{ y: number | null }>) {
  let count = 0;
  let inside = false;
  for (const point of points) {
    if (point.y === null && !inside) { count += 1; inside = true; }
    else if (point.y !== null) inside = false;
  }
  return count;
}

function wrapMetadataLine(line: string): string[] {
  const lines: string[] = [];
  let remaining = line.trim();
  while (remaining.length > metadataLineLength) {
    const candidate = remaining.slice(0, metadataLineLength + 1);
    const whitespace = candidate.lastIndexOf(" ");
    const end = whitespace > 0 ? whitespace : metadataLineLength;
    lines.push(remaining.slice(0, end).trimEnd());
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining !== "") lines.push(remaining);
  return lines;
}

function formatTick(value: number): string {
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 10_000 || magnitude < 0.001) return value.toExponential(2);
  return Number(value.toPrecision(4)).toString();
}
