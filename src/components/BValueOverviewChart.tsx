import { useId } from "react";
import type { BValuePoint, CvFitRecord } from "../lib/cvTypes";

type BRecord = CvFitRecord<BValuePoint>;

interface BValueOverviewChartProps {
  records: BRecord[];
  selectedSequenceIndex?: number;
  onSelectSequenceIndex?: (sequenceIndex: number) => void;
  title: string;
  xLabel: string;
  yLabel: string;
  legendLabel: string;
  forwardLabel: string;
  reverseLabel: string;
  validLabel: string;
  outsideLabel: string;
  excludedLabel: string;
  unstableLabel: string;
  diffusionLabel: string;
  capacitiveLabel: string;
  exportId?: string;
  metadata?: string[];
}

const dimensions = { width: 800, height: 430 };
const margin = { top: 96, right: 28, bottom: 58, left: 70 };
const branchColors = ["#16697a", "#7656a8"] as const;
const maximumDisplayRecords = 2_000;

export function BValueOverviewChart({
  records,
  selectedSequenceIndex,
  onSelectSequenceIndex,
  title,
  xLabel,
  yLabel,
  legendLabel,
  forwardLabel,
  reverseLabel,
  validLabel,
  outsideLabel,
  excludedLabel,
  unstableLabel,
  diffusionLabel,
  capacitiveLabel,
  exportId,
  metadata = []
}: BValueOverviewChartProps): React.ReactElement {
  const titleId = useId();
  const sampledRecords = sampleBRecords(records, maximumDisplayRecords, selectedSequenceIndex);
  const finiteRecords = sampledRecords.filter((record) => Number.isFinite(record.potential));
  const fitRecords = finiteRecords.filter((record) => record.fit && Number.isFinite(record.fit.b));
  const xValues = finiteRecords.map((record) => record.potential);
  const yValues = [...fitRecords.map((record) => record.fit!.b), 0.5, 1];
  if (xValues.length === 0) return <div className="scientific-chart-empty" role="status">—</div>;

  const xDomain = expand(Math.min(...xValues), Math.max(...xValues));
  const yDomain = expand(Math.min(...yValues), Math.max(...yValues));
  const plotWidth = dimensions.width - margin.left - margin.right;
  const plotHeight = dimensions.height - margin.top - margin.bottom;
  const x = (value: number) => margin.left + normalize(value, xDomain) * plotWidth;
  const y = (value: number) => dimensions.height - margin.bottom - normalize(value, yDomain) * plotHeight;
  const xTicks = makeTicks(xDomain);
  const yTicks = makeTicks(yDomain);
  const selected = fitRecords.find((record) => record.sequenceIndex === selectedSequenceIndex);
  const legendItems = [
    { label: forwardLabel, color: branchColors[0], kind: "line" },
    { label: reverseLabel, color: branchColors[1], kind: "line" },
    { label: validLabel, color: "#16697a", kind: "solid" },
    { label: outsideLabel, color: "#d47b3c", kind: "triangle" },
    { label: excludedLabel, color: "#7b8b91", kind: "hollow" },
    { label: unstableLabel, color: "#9aa5a9", kind: "cross" }
  ] as const;

  return <div className="scientific-chart-shell b-value-overview-shell">
    <svg
      role="img"
      aria-labelledby={titleId}
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      width="100%"
      height="auto"
      className="scientific-chart-svg b-value-overview-svg"
      data-export-id={exportId}
    >
      <title id={titleId}>{title}</title>
      {metadata.length > 0 && <desc>{metadata.join(". ")}</desc>}
      {metadata.length > 0 && <g data-chart-metadata="true">
        {metadata.slice(0, 2).map((line, index) => <text key={line} x={margin.left} y={72 + index * 14} fill="#455a64" fontSize={9}>{line}</text>)}
      </g>}
      <g className="b-value-overview-legend" role="group" aria-label={legendLabel}>
        {legendItems.map((item, index) => {
          const column = index % 3;
          const row = Math.floor(index / 3);
          const left = margin.left + column * (plotWidth / 3);
          const top = 18 + row * 24;
          return <g key={item.label} transform={`translate(${left} ${top})`}>
            {item.kind === "line" && <line x1={0} x2={24} y1={0} y2={0} stroke={item.color} strokeWidth={2.25} />}
            {item.kind === "solid" && <circle cx={12} cy={0} r={4} fill={item.color} />}
            {item.kind === "hollow" && <circle cx={12} cy={0} r={4} fill="#fff" stroke={item.color} strokeWidth={1.8} />}
            {item.kind === "triangle" && <path d="M 12 -5 L 17 4 L 7 4 Z" fill={item.color} />}
            {item.kind === "cross" && <path d="M 8 -4 L 16 4 M 16 -4 L 8 4" stroke={item.color} strokeWidth={1.8} />}
            <text x={30} y={4} fill="#263238" fontSize={11}>{item.label}</text>
          </g>;
        })}
      </g>

      <g aria-hidden="true">
        {yTicks.map((tick) => <line key={tick} x1={margin.left} x2={dimensions.width - margin.right} y1={y(tick)} y2={y(tick)} stroke="#d7dfdc" />)}
        {[0.5, 1].map((reference) => <g key={reference} data-b-reference={String(reference)}>
          <line x1={margin.left} x2={dimensions.width - margin.right} y1={y(reference)} y2={y(reference)} stroke="#607d8b" strokeDasharray="5 4" strokeWidth={1.4} />
          <text x={dimensions.width - margin.right - 4} y={y(reference) - 6} textAnchor="end" fill="#52666e" fontSize={10.5}>
            {reference === 0.5 ? `b = 0.5 · ${diffusionLabel}` : `b = 1.0 · ${capacitiveLabel}`}
          </text>
        </g>)}
      </g>

      <g className="scientific-chart-axes" aria-hidden="true">
        <line x1={margin.left} x2={margin.left} y1={margin.top} y2={dimensions.height - margin.bottom} stroke="#607d8b" strokeWidth={1.25} />
        <line x1={margin.left} x2={dimensions.width - margin.right} y1={dimensions.height - margin.bottom} y2={dimensions.height - margin.bottom} stroke="#607d8b" strokeWidth={1.25} />
        {xTicks.map((tick) => <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={dimensions.height - margin.bottom} y2={dimensions.height - margin.bottom + 6} stroke="#607d8b" />
          <text x={x(tick)} y={dimensions.height - margin.bottom + 22} textAnchor="middle" fill="#455a64" fontSize={11}>{formatTick(tick)}</text>
        </g>)}
        {yTicks.map((tick) => <g key={tick}>
          <line x1={margin.left - 6} x2={margin.left} y1={y(tick)} y2={y(tick)} stroke="#607d8b" />
          <text x={margin.left - 10} y={y(tick) + 4} textAnchor="end" fill="#455a64" fontSize={11}>{formatTick(tick)}</text>
        </g>)}
        <text x={margin.left + plotWidth / 2} y={dimensions.height - 12} textAnchor="middle" fill="#263238" fontSize={12}>{xLabel}</text>
        <text x={18} y={margin.top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`} fill="#263238" fontSize={12}>{yLabel}</text>
      </g>

      {[0, 1].map((branchIndex) => {
        const originalBranch = records.filter((record) => record.branchIndex === branchIndex);
        const gapRunCount = countInvalidRuns(originalBranch);
        if (gapRunCount > 250) return null;
        return <path
          key={branchIndex}
          data-b-branch-path={branchIndex === 0 ? "forward" : "reverse"}
          data-series-id={branchIndex === 0 ? "b-values" : "b-values-reverse"}
          data-render-point-count={finiteRecords.filter((record) => record.branchIndex === branchIndex && record.status === "valid" && record.fit).length}
          data-gap-run-count={gapRunCount}
          d={branchPath(finiteRecords.filter((record) => record.branchIndex === branchIndex), originalBranch, x, y)}
          fill="none"
          stroke={branchColors[branchIndex]}
          strokeWidth={2.1}
        />;
      })}

      <g className="b-value-quality-points">
        {finiteRecords.map((record) => <BMarker
          key={record.sequenceIndex}
          record={record}
          x={x(record.potential)}
          y={record.fit ? y(record.fit.b) : dimensions.height - margin.bottom}
          color={branchColors[Math.min(1, record.branchIndex)]}
          branchLabel={record.branchIndex === 0 ? forwardLabel : reverseLabel}
          onSelect={onSelectSequenceIndex}
        />)}
      </g>

      {selected?.fit && <g className="scientific-chart-selection" aria-hidden="true">
        <line x1={x(selected.potential)} x2={x(selected.potential)} y1={margin.top} y2={dimensions.height - margin.bottom} stroke="#16232d" strokeDasharray="3 3" />
        <circle
          data-selected-point-id={String(selected.sequenceIndex)}
          cx={x(selected.potential)}
          cy={y(selected.fit.b)}
          r={6}
          fill="#fff"
          stroke={branchColors[Math.min(1, selected.branchIndex)]}
          strokeWidth={2.8}
        />
      </g>}
    </svg>
  </div>;
}

function BMarker({
  record,
  x,
  y,
  color,
  branchLabel,
  onSelect
}: {
  record: BRecord;
  x: number;
  y: number;
  color: string;
  branchLabel: string;
  onSelect?: (sequenceIndex: number) => void;
}) {
  const quality = record.fit === null || record.status === "nearZeroCurrentUnstable"
    || record.status === "zeroCurrentLogUnavailable" || record.status === "regressionFailed"
    || record.status === "insufficientData"
    ? "unstable"
    : record.status === "belowRSquaredThreshold"
      ? "excluded"
      : record.fit.b < 0.5 || record.fit.b > 1
        ? "outside"
        : "valid";
  const selectable = record.fit !== null;
  const common = {
    "data-b-quality": quality,
    "data-b-sequence-index": String(record.sequenceIndex),
    role: selectable ? "button" : undefined,
    tabIndex: selectable ? 0 : undefined,
    "aria-label": record.fit ? `${branchLabel}, V ${record.potential}, b ${record.fit.b}` : `${branchLabel}, V ${record.potential}, unavailable`,
    onClick: selectable ? () => onSelect?.(record.sequenceIndex) : undefined,
    onKeyDown: selectable ? (event: React.KeyboardEvent<SVGGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect?.(record.sequenceIndex);
      }
    } : undefined
  };
  return <g {...common}>
    {quality === "valid" && <circle data-point-series-id="b-values" cx={x} cy={y} r={3.4} fill={color} />}
    {quality === "outside" && <path d={`M ${x} ${y - 5} L ${x + 5} ${y + 4} L ${x - 5} ${y + 4} Z`} fill="#d47b3c" />}
    {quality === "excluded" && <circle cx={x} cy={y} r={3.8} fill="#fff" stroke="#7b8b91" strokeWidth={1.7} />}
    {quality === "unstable" && <path d={`M ${x - 4} ${y - 4} L ${x + 4} ${y + 4} M ${x + 4} ${y - 4} L ${x - 4} ${y + 4}`} stroke="#9aa5a9" strokeWidth={1.7} />}
    {selectable && <circle data-point-id={String(record.sequenceIndex)} aria-label={`${branchLabel}, V ${record.potential}`} cx={x} cy={y} r={8} fill="transparent" />}
  </g>;
}

function sampleBRecords(records: BRecord[], limit: number, selectedSequenceIndex?: number): BRecord[] {
  if (records.length <= limit) return records;
  const selected = new Set<number>([0, records.length - 1]);
  records.forEach((record, index) => {
    const previous = records[index - 1];
    const next = records[index + 1];
    const valid = record.status === "valid" && record.fit !== null;
    const previousValid = previous?.status === "valid" && previous.fit !== null;
    const nextValid = next?.status === "valid" && next.fit !== null;
    if (record.sequenceIndex === selectedSequenceIndex
      || previous?.branchIndex !== record.branchIndex
      || next?.branchIndex !== record.branchIndex
      || valid !== previousValid
      || valid !== nextValid) selected.add(index);
  });
  if (selected.size >= limit) {
    const stride = Math.max(1, Math.ceil(records.length / limit));
    return records.filter((record, index) => index % stride === 0 || record.sequenceIndex === selectedSequenceIndex).slice(0, limit);
  }
  const remaining = limit - selected.size;
  for (let slot = 0; slot < remaining; slot += 1) {
    selected.add(Math.round(slot * (records.length - 1) / Math.max(1, remaining - 1)));
  }
  return [...selected].sort((left, right) => left - right).slice(0, limit).map((index) => records[index]!);
}

function branchPath(
  records: BRecord[],
  originalRecords: BRecord[],
  x: (value: number) => number,
  y: (value: number) => number
): string {
  let drawing = false;
  let previousSequenceIndex: number | null = null;
  const originalBySequence = new Map(originalRecords.map((record) => [record.sequenceIndex, record]));
  return [...records].sort((left, right) => left.sequenceIndex - right.sequenceIndex).map((record) => {
    const valid = record.status === "valid" && record.fit !== null;
    if (!valid) {
      drawing = false;
      previousSequenceIndex = record.sequenceIndex;
      return "";
    }
    const interveningValid = previousSequenceIndex !== null && Array.from(
      { length: Math.max(0, record.sequenceIndex - previousSequenceIndex - 1) },
      (_, index) => originalBySequence.get(previousSequenceIndex! + index + 1)
    ).every((item) => item?.status === "valid" && item.fit !== null);
    const command = drawing && interveningValid ? "L" : "M";
    drawing = true;
    previousSequenceIndex = record.sequenceIndex;
    return `${command} ${x(record.potential)} ${y(record.fit!.b)}`;
  }).filter(Boolean).join(" ");
}

function countInvalidRuns(records: BRecord[]): number {
  let count = 0;
  let inside = false;
  for (const record of [...records].sort((left, right) => left.sequenceIndex - right.sequenceIndex)) {
    const invalid = record.status !== "valid" || record.fit === null;
    if (invalid && !inside) count += 1;
    inside = invalid;
  }
  return count;
}

function expand(minimum: number, maximum: number): [number, number] {
  if (minimum !== maximum) {
    const padding = 0.04 * (maximum - minimum);
    return [minimum - padding, maximum + padding];
  }
  const padding = Math.max(0.1, Math.abs(minimum) * 0.05);
  return [minimum - padding, maximum + padding];
}

function normalize(value: number, [minimum, maximum]: [number, number]): number {
  return (value - minimum) / (maximum - minimum);
}

function makeTicks([minimum, maximum]: [number, number]): number[] {
  return Array.from({ length: 5 }, (_, index) => minimum + index * (maximum - minimum) / 4);
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1e4 || (value !== 0 && Math.abs(value) < 1e-3)) return value.toExponential(2);
  return Number(value.toFixed(4)).toString();
}
