import { useId } from "react";

export interface ChartSeries {
  id: string;
  label: string;
  points: Array<{ x: number; y: number | null }>;
  color: string;
  dash?: string;
  mode?: "line" | "points";
}

interface ScientificLineChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  emptyLabel: string;
  legendLabel: string;
  series: ChartSeries[];
  selectedX?: number;
  onSelectX?: (x: number) => void;
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
  selectedX,
  onSelectX,
  exportId,
  metadata
}: ScientificLineChartProps): React.ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const finiteSeries = series.map((item) => ({
    ...item,
    points: item.points.filter((point) => Number.isFinite(point.x) && (point.y === null || Number.isFinite(point.y)))
  }));
  const allPoints = finiteSeries.flatMap((item) => item.points.flatMap((point) => point.y === null ? [] : [{ x: point.x, y: point.y }]));

  if (allPoints.length === 0) {
    return <div className="scientific-chart-empty" role="status">{emptyLabel}</div>;
  }

  const xDomain = expandedDomain(allPoints, "x");
  const yDomain = expandedDomain(allPoints, "y");
  const legendColumns = 4;
  const legendRows = Math.ceil(finiteSeries.length / legendColumns);
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
  const selectedPoint = Number.isFinite(selectedX)
    ? allPoints.find((point) => point.x === selectedX) ?? null
    : null;

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
          role="group"
          aria-label={legendLabel}
        >
          {finiteSeries.map((item, index) => {
            const column = index % legendColumns;
            const row = Math.floor(index / legendColumns);
            const x = chartMargin.left + column * (plotWidth / legendColumns);
            const y = legendTop + row * 22;
            return (
              <g key={item.id} className="scientific-chart-legend-item" transform={`translate(${x} ${y})`}>
                {item.mode === "points" ? <circle cx={13} cy={0} r={3.5} fill={item.color} /> : <line x1={0} y1={0} x2={26} y2={0} stroke={item.color} strokeWidth={2.25} strokeDasharray={item.dash} />}
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
              {onSelectX && item.points.flatMap((point, index) => point.y === null ? [] : [(
                <circle
                  key={`${item.id}-${point.x}-${index}`}
                  className="scientific-chart-point"
                  data-point-x={String(point.x)}
                  cx={projectX(point.x)}
                  cy={projectY(point.y)}
                  r={7}
                  fill="transparent"
                  stroke="none"
                  tabIndex={0}
                  role="button"
                  aria-label={`${item.label}: ${xLabel} ${formatTick(point.x)}, ${yLabel} ${formatTick(point.y)}`}
                  onClick={() => onSelectX(point.x)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectX(point.x);
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
              data-selected-x={String(selectedX)}
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
