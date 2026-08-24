import { useId } from "react";

export interface ChartSeries {
  id: string;
  label: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  dash?: string;
}

interface ScientificLineChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  series: ChartSeries[];
  selectedX?: number;
  onSelectX?: (x: number) => void;
  exportId?: string;
}

const dimensions = { width: 800, height: 420 };
const margin = { top: 34, right: 24, bottom: 58, left: 72 };

export function ScientificLineChart({
  title,
  xLabel,
  yLabel,
  series,
  selectedX,
  onSelectX,
  exportId
}: ScientificLineChartProps): React.ReactElement {
  const titleId = useId();
  const finiteSeries = series.map((item) => ({
    ...item,
    points: item.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  }));
  const allPoints = finiteSeries.flatMap((item) => item.points);

  if (allPoints.length === 0) {
    return <div className="scientific-chart-empty" role="status">No data available</div>;
  }

  const xDomain = expandedDomain(allPoints.map((point) => point.x));
  const yDomain = expandedDomain(allPoints.map((point) => point.y));
  const plotWidth = dimensions.width - margin.left - margin.right;
  const plotHeight = dimensions.height - margin.top - margin.bottom;
  const projectX = (value: number) => margin.left + (value - xDomain[0]) / (xDomain[1] - xDomain[0]) * plotWidth;
  const projectY = (value: number) => dimensions.height - margin.bottom - (value - yDomain[0]) / (yDomain[1] - yDomain[0]) * plotHeight;
  const xTicks = ticks(xDomain);
  const yTicks = ticks(yDomain);
  const selectedPoint = Number.isFinite(selectedX)
    ? allPoints.reduce((nearest, point) => Math.abs(point.x - selectedX!) < Math.abs(nearest.x - selectedX!) ? point : nearest)
    : null;

  return (
    <div className="scientific-chart-shell">
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        width="100%"
        height="auto"
        data-export-id={exportId}
        className="scientific-chart-svg"
      >
        <title id={titleId}>{title}</title>
        <g className="scientific-chart-grid" aria-hidden="true">
          {yTicks.map((tick) => (
            <line key={`y-grid-${tick}`} x1={margin.left} y1={projectY(tick)} x2={dimensions.width - margin.right} y2={projectY(tick)} />
          ))}
        </g>
        <g className="scientific-chart-axes" aria-hidden="true">
          <line x1={margin.left} y1={margin.top} x2={margin.left} y2={dimensions.height - margin.bottom} />
          <line x1={margin.left} y1={dimensions.height - margin.bottom} x2={dimensions.width - margin.right} y2={dimensions.height - margin.bottom} />
          {xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              <line x1={projectX(tick)} y1={dimensions.height - margin.bottom} x2={projectX(tick)} y2={dimensions.height - margin.bottom + 6} />
              <text x={projectX(tick)} y={dimensions.height - margin.bottom + 22} textAnchor="middle">{formatTick(tick)}</text>
            </g>
          ))}
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line x1={margin.left - 6} y1={projectY(tick)} x2={margin.left} y2={projectY(tick)} />
              <text x={margin.left - 10} y={projectY(tick) + 4} textAnchor="end">{formatTick(tick)}</text>
            </g>
          ))}
          <text className="scientific-chart-x-label" x={margin.left + plotWidth / 2} y={dimensions.height - 12} textAnchor="middle">{xLabel}</text>
          <text
            className="scientific-chart-y-label"
            x={18}
            y={margin.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`}
          >{yLabel}</text>
        </g>
        <g className="scientific-chart-series">
          {finiteSeries.map((item) => (
            <g key={item.id}>
              {item.points.length > 0 && (
                <path
                  data-series-id={item.id}
                  d={linePath(item.points, projectX, projectY)}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2.25}
                  strokeDasharray={item.dash}
                />
              )}
              {onSelectX && item.points.map((point, index) => (
                <circle
                  key={`${item.id}-${point.x}-${index}`}
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
              ))}
            </g>
          ))}
        </g>
        {selectedPoint && (
          <g className="scientific-chart-selection" aria-hidden="true">
            <line
              x1={projectX(selectedPoint.x)}
              y1={margin.top}
              x2={projectX(selectedPoint.x)}
              y2={dimensions.height - margin.bottom}
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
      <div className="scientific-chart-legend" aria-label={`${title} legend`}>
        {finiteSeries.map((item) => (
          <span key={item.id} className="scientific-chart-legend-item">
            <svg width="28" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="27" y2="5" stroke={item.color} strokeWidth="2.25" strokeDasharray={item.dash} />
            </svg>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function expandedDomain(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min !== max) return [min, max];
  const padding = Math.abs(min) * 0.05 || 1;
  return [min - padding, max + padding];
}

function ticks([min, max]: [number, number], count = 5): number[] {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

function linePath(
  points: Array<{ x: number; y: number }>,
  projectX: (value: number) => number,
  projectY: (value: number) => number
): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${projectX(point.x)} ${projectY(point.y)}`).join(" ");
}

function formatTick(value: number): string {
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 10_000 || magnitude < 0.001) return value.toExponential(2);
  return Number(value.toPrecision(4)).toString();
}
