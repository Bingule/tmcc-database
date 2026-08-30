import { useId, type CSSProperties } from "react";

export interface StackedBarDatum {
  id: string;
  x: number;
  lower: number;
  upper: number;
}

export interface ScientificStackedBarChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  emptyLabel: string;
  legendLabel: string;
  lowerLabel: string;
  upperLabel: string;
  lowerColor: string;
  upperColor: string;
  data: StackedBarDatum[];
  exportId?: string;
  metadata?: string | string[];
}

interface NormalizedStackedBarDatum extends StackedBarDatum {
  normalizedLower: number;
  normalizedUpper: number;
}

const dimensions = { width: 800, height: 420 };
const margin = { top: 72, right: 38, bottom: 62, left: 68 };
const yTicks = [0, 25, 50, 75, 100] as const;
const smallSegmentThreshold = 7;
const minimumSlotWidth = 84;
const metadataLineLength = 60;

export function ScientificStackedBarChart({
  title,
  xLabel,
  yLabel,
  emptyLabel,
  legendLabel,
  lowerLabel,
  upperLabel,
  lowerColor,
  upperColor,
  data,
  exportId,
  metadata
}: ScientificStackedBarChartProps): React.ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const normalizedData = data
    .flatMap(normalizeDatum)
    .sort((left, right) => left.x - right.x);

  if (normalizedData.length === 0) {
    return <div className="scientific-chart-empty" role="status">{emptyLabel}</div>;
  }

  const metadataSourceLines = typeof metadata === "string" ? [metadata] : metadata ?? [];
  const metadataLines = metadataSourceLines.flatMap(wrapMetadataLine);
  const legendTop = metadataLines.length > 0 ? 17 + metadataLines.length * 18 + 4 : 17;
  const chartMargin = {
    ...margin,
    top: Math.max(margin.top, legendTop + 24)
  };
  const chartWidth = Math.max(
    dimensions.width,
    chartMargin.left + chartMargin.right + normalizedData.length * minimumSlotWidth
  );
  const plotWidth = chartWidth - chartMargin.left - chartMargin.right;
  const plotHeight = dimensions.height - chartMargin.top - chartMargin.bottom;
  const slotWidth = plotWidth / normalizedData.length;
  const barWidth = Math.min(42, Math.max(14, slotWidth * 0.58));
  const projectY = (value: number) => chartMargin.top + (100 - value) / 100 * plotHeight;
  const chartStyle = {
    "--scientific-stacked-bar-min-width": `${chartWidth}px`
  } as CSSProperties;

  return (
    <div className="scientific-chart-shell scientific-stacked-bar-chart-shell">
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={metadataSourceLines.length > 0 ? descriptionId : undefined}
        viewBox={`0 0 ${chartWidth} ${dimensions.height}`}
        width="100%"
        height="auto"
        data-export-id={exportId}
        className="scientific-chart-svg scientific-stacked-bar-chart-svg"
        style={chartStyle}
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
          <g transform={`translate(${chartMargin.left} ${legendTop})`}>
            <rect x={1} y={-6} width={24} height={12} rx={2} fill={lowerColor} />
            <text x={32} y={4} fill="#263238" fontSize={11}>{lowerLabel}</text>
          </g>
          <g transform={`translate(${chartMargin.left + plotWidth / 2} ${legendTop})`}>
            <rect x={1} y={-6} width={24} height={12} rx={2} fill={upperColor} />
            <text x={32} y={4} fill="#263238" fontSize={11}>{upperLabel}</text>
          </g>
        </g>
        <g className="scientific-chart-grid" aria-hidden="true">
          {yTicks.map((tick) => <line
            key={`grid-${tick}`}
            x1={chartMargin.left}
            y1={projectY(tick)}
            x2={chartWidth - chartMargin.right}
            y2={projectY(tick)}
            stroke="#d7dfdc"
            strokeWidth={1}
          />)}
        </g>
        <g className="scientific-chart-axes" aria-hidden="true">
          <line x1={chartMargin.left} y1={chartMargin.top} x2={chartMargin.left} y2={dimensions.height - chartMargin.bottom} stroke="#607d8b" strokeWidth={1.25} />
          <line x1={chartMargin.left} y1={dimensions.height - chartMargin.bottom} x2={chartWidth - chartMargin.right} y2={dimensions.height - chartMargin.bottom} stroke="#607d8b" strokeWidth={1.25} />
          {yTicks.map((tick) => <g key={`y-${tick}`} data-y-tick={String(tick)}>
            <line x1={chartMargin.left - 6} y1={projectY(tick)} x2={chartMargin.left} y2={projectY(tick)} stroke="#607d8b" strokeWidth={1.25} />
            <text x={chartMargin.left - 10} y={projectY(tick) + 4} textAnchor="end" fill="#455a64" fontSize={11}>{tick}</text>
          </g>)}
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
        <g className="scientific-stacked-bars">
          {normalizedData.map((datum, index) => {
            const centerX = chartMargin.left + slotWidth * (index + 0.5);
            const x = centerX - barWidth / 2;
            return <g key={datum.id} data-stacked-bar="true" data-x={String(datum.x)}>
              <rect
                data-bar-segment="capacitive"
                data-segment-value={String(datum.normalizedLower)}
                x={x}
                y={projectY(datum.normalizedLower)}
                width={barWidth}
                height={projectY(0) - projectY(datum.normalizedLower)}
                fill={lowerColor}
              />
              <rect
                data-bar-segment="diffusion"
                data-segment-value={String(datum.normalizedUpper)}
                x={x}
                y={projectY(100)}
                width={barWidth}
                height={projectY(datum.normalizedLower) - projectY(100)}
                fill={upperColor}
              />
              <SegmentLabel
                barId={datum.id}
                segment="capacitive"
                value={datum.normalizedLower}
                centerX={centerX}
                barRight={x + barWidth}
                centerY={(projectY(0) + projectY(datum.normalizedLower)) / 2}
                color="#263238"
              />
              <SegmentLabel
                barId={datum.id}
                segment="diffusion"
                value={datum.normalizedUpper}
                centerX={centerX}
                barRight={x + barWidth}
                centerY={(projectY(100) + projectY(datum.normalizedLower)) / 2}
                color="#ffffff"
              />
              <line x1={centerX} y1={projectY(0)} x2={centerX} y2={projectY(0) + 6} stroke="#607d8b" strokeWidth={1.25} />
              <text x={centerX} y={projectY(0) + 22} textAnchor="middle" fill="#455a64" fontSize={11}>{formatNumber(datum.x)}</text>
            </g>;
          })}
        </g>
      </svg>
    </div>
  );
}

function SegmentLabel({
  barId,
  segment,
  value,
  centerX,
  barRight,
  centerY,
  color
}: {
  barId: string;
  segment: "capacitive" | "diffusion";
  value: number;
  centerX: number;
  barRight: number;
  centerY: number;
  color: string;
}) {
  const external = value < smallSegmentThreshold;
  const leaderEnd = barRight + 5;
  return <>
    {external && <line
      data-label-leader-for={`${barId}-${segment}`}
      x1={barRight}
      y1={centerY}
      x2={leaderEnd}
      y2={centerY}
      stroke="#455a64"
      strokeWidth={1}
    />}
    <text
      data-bar-id={barId}
      data-segment={segment}
      data-label-placement={external ? "external" : "inside"}
      x={external ? leaderEnd + 2 : centerX}
      y={centerY + 4}
      textAnchor={external ? "start" : "middle"}
      fill={external ? "#263238" : color}
      fontSize={10.5}
      fontWeight={650}
    >{value.toFixed(2)}%</text>
  </>;
}

function normalizeDatum(datum: StackedBarDatum): NormalizedStackedBarDatum[] {
  const total = datum.lower + datum.upper;
  if (!Number.isFinite(datum.x)
    || !Number.isFinite(datum.lower)
    || !Number.isFinite(datum.upper)
    || total <= 0) return [];
  const normalizedLower = 100 * datum.lower / total;
  return [{
    ...datum,
    normalizedLower,
    normalizedUpper: 100 - normalizedLower
  }];
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

function formatNumber(value: number): string {
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 10_000 || magnitude < 0.001) return value.toExponential(2);
  return Number(value.toPrecision(6)).toString();
}
