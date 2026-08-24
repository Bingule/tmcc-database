import { Download } from "lucide-react";
import { type PointerEvent, useEffect, useMemo, useState } from "react";
import { parseCifStructure, type ParsedCrystalStructure } from "../lib/crystal";
import { exportPairDistributionCsv, exportXrdCsv, radiationPresets, simulatePairDistribution, simulateXrdPattern } from "../lib/xrd";
import { getSpaceGroupSymbol } from "../lib/materials";
import { publicAssetPath } from "../lib/paths";
import type { MaterialRecord } from "../lib/types";
import { useNonPassiveWheel } from "../lib/useNonPassiveWheel";

const customRadiation = "Custom wavelength";
const customWavelengthRange = { min: 0.05, max: 2.5 };

export const chartDimensions = {
  standard: { width: 780, height: 270 },
  compact: { width: 780, height: 225 }
};

export function makeAxisTicks(min: number, max: number, count = 8) {
  if (count <= 1 || max <= min) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

export function XrdViewer({ material }: { material: MaterialRecord }) {
  const cifPath = publicAssetPath(material.files.cif);
  const [structure, setStructure] = useState<ParsedCrystalStructure | null>(null);
  const [status, setStatus] = useState("Loading CIF for simulated XRD...");
  const [minTwoTheta, setMinTwoTheta] = useState(5);
  const [maxTwoTheta, setMaxTwoTheta] = useState(90);
  const [minR, setMinR] = useState(0);
  const [maxR, setMaxR] = useState(12);
  const [radiation, setRadiation] = useState(radiationPresets[0].label);
  const [wavelength, setWavelength] = useState(radiationPresets[0].wavelength);
  const [xrdZoom, setXrdZoom] = useState<[number, number] | null>(null);
  const [pdfZoom, setPdfZoom] = useState<[number, number] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStructure(null);
    if (!cifPath) {
      setStatus("CIF file required for simulated XRD.");
      return;
    }

    setStatus("Loading CIF for simulated XRD...");
    fetch(cifPath)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load CIF");
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        setStructure(parseCifStructure(text));
        setStatus("");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("Unable to simulate XRD from this CIF.");
      });

    return () => {
      cancelled = true;
    };
  }, [cifPath]);

  const pattern = useMemo(() => {
    if (!structure) return null;
    const peakWidth = Math.max(0.025, 0.16 * Math.min(wavelength / 1.5406, 1));
    return simulateXrdPattern(structure, {
      wavelength,
      minTwoTheta,
      maxTwoTheta,
      peakWidth,
      step: Math.max(0.008, peakWidth / 3)
    });
  }, [structure, wavelength, minTwoTheta, maxTwoTheta]);
  const pairDistribution = useMemo(() => {
    if (!structure) return null;
    return simulatePairDistribution(structure, {
      wavelength,
      minTwoTheta,
      maxTwoTheta,
      rMin: minR,
      rMax: maxR
    });
  }, [structure, wavelength, minTwoTheta, maxTwoTheta, minR, maxR]);

  function updateRadiation(next: string) {
    setRadiation(next);
    const preset = radiationPresets.find((item) => item.label === next);
    if (preset) setWavelength(preset.wavelength);
  }

  function updateCustomWavelength(next: number) {
    setRadiation(customRadiation);
    setWavelength(clampWavelength(next));
  }

  function exportCsv() {
    if (!pattern) return;
    downloadCsv(exportXrdCsv(pattern.points), makeXrdFilename(material));
  }

  function exportPdfCsv() {
    if (!pairDistribution) return;
    downloadCsv(exportPairDistributionCsv(pairDistribution), makePdfFilename(material));
  }

  useEffect(() => setXrdZoom(null), [minTwoTheta, maxTwoTheta, wavelength]);
  useEffect(() => setPdfZoom(null), [minR, maxR, wavelength, minTwoTheta, maxTwoTheta]);

  function downloadCsv(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="xrd-panel" aria-label="Simulated XRD view">
      <div className="xrd-header">
        <div>
          <h4>Simulated XRD</h4>
          <p>Powder pattern estimated from the current CIF structure.</p>
        </div>
        <div className="chart-actions">
          {xrdZoom && <button className="secondary-button" type="button" onClick={() => setXrdZoom(null)}>Reset zoom</button>}
          <button className="secondary-button" type="button" onClick={exportCsv} disabled={!pattern}>
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="xrd-controls">
        <label>
          <span>2theta min</span>
          <input
            type="number"
            min={1}
            max={Math.max(2, maxTwoTheta - 1)}
            value={minTwoTheta}
            onChange={(event) => setMinTwoTheta(Number(event.target.value))}
          />
        </label>
        <label>
          <span>2theta max</span>
          <input
            type="number"
            min={Math.min(178, minTwoTheta + 1)}
            max={179}
            value={maxTwoTheta}
            onChange={(event) => setMaxTwoTheta(Number(event.target.value))}
          />
        </label>
        <label>
          <span>Radiation</span>
          <select value={radiation} onChange={(event) => updateRadiation(event.target.value)}>
            {radiationPresets.map((item) => <option key={item.label}>{item.label}</option>)}
            <option>{customRadiation}</option>
          </select>
        </label>
        <label>
          <span>Wavelength (Angstrom)</span>
          <input
            type="number"
            min={customWavelengthRange.min}
            max={customWavelengthRange.max}
            step={0.0001}
            value={wavelength}
            onChange={(event) => updateCustomWavelength(Number(event.target.value))}
          />
          {radiation === customRadiation && (
            <small className="wavelength-hint">Custom range: 0.05-2.5 A</small>
          )}
        </label>
      </div>

      <div className="xrd-chart">
        {pattern ? (
          <LineChart
            points={pattern.points}
            xKey="twoTheta"
            yKey="intensity"
            xUnit="deg"
            yLabel="Intensity"
            dimensions={chartDimensions.standard}
            visibleXRange={xrdZoom ?? [minTwoTheta, maxTwoTheta]}
            fullXRange={[minTwoTheta, maxTwoTheta]}
            onVisibleXRangeChange={setXrdZoom}
          />
        ) : <span>{status}</span>}
      </div>

      <div className="pdf-section">
        <div className="xrd-header compact">
          <div>
            <h4>Pair Distribution Function</h4>
            <p>r-space distribution estimated from the same wavelength and 2theta window.</p>
          </div>
          <div className="chart-actions">
            {pdfZoom && <button className="secondary-button" type="button" onClick={() => setPdfZoom(null)}>Reset zoom</button>}
            <button className="secondary-button" type="button" onClick={exportPdfCsv} disabled={!pairDistribution}>
              <Download size={15} />
              Export PDF CSV
            </button>
          </div>
        </div>
        <div className="xrd-controls pdf-controls">
          <label>
            <span>r min</span>
            <input
              type="number"
              min={0}
              max={Math.max(0.1, maxR - 0.1)}
              step={0.1}
              value={minR}
              onChange={(event) => setMinR(Number(event.target.value))}
            />
          </label>
          <label>
            <span>r max</span>
            <input
              type="number"
              min={Math.min(49.9, minR + 0.1)}
              max={50}
              step={0.1}
              value={maxR}
              onChange={(event) => setMaxR(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="xrd-chart compact">
          {pairDistribution ? (
            <LineChart
              points={pairDistribution}
              xKey="r"
              yKey="intensity"
              xUnit="Angstrom"
              yLabel="G(r)"
              dimensions={chartDimensions.compact}
              visibleXRange={pdfZoom ?? [minR, maxR]}
              fullXRange={[minR, maxR]}
              onVisibleXRangeChange={setPdfZoom}
            />
          ) : (
            <span>{status}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function clampWavelength(value: number) {
  if (!Number.isFinite(value)) return radiationPresets[0].wavelength;
  return Math.min(customWavelengthRange.max, Math.max(customWavelengthRange.min, value));
}

function LineChart<T extends Record<string, number>>({
  points,
  xKey,
  yKey,
  xUnit,
  yLabel,
  dimensions,
  visibleXRange,
  fullXRange,
  onVisibleXRangeChange
}: {
  points: T[];
  xKey: keyof T;
  yKey: keyof T;
  xUnit: string;
  yLabel: string;
  dimensions: { width: number; height: number };
  visibleXRange: [number, number];
  fullXRange: [number, number];
  onVisibleXRangeChange: (range: [number, number] | null) => void;
}) {
  const [hovered, setHovered] = useState<{ x: number; y: number; point: T } | null>(null);
  const [dragRange, setDragRange] = useState<{ startX: number; currentX: number } | null>(null);
  const { width, height } = dimensions;
  const padding = 34;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const [minX, maxX] = visibleXRange;
  const visiblePoints = points.filter((point) => point[xKey] >= minX && point[xKey] <= maxX);
  const chartPoints = visiblePoints.length > 1 ? visiblePoints : points;
  const minY = Math.min(...chartPoints.map((point) => point[yKey]), 0);
  const maxY = Math.max(...chartPoints.map((point) => point[yKey]), 1);
  const ySpan = maxY - minY || 1;
  const zeroY = height - padding - (0 - minY) / ySpan * plotHeight;
  const xTicks = makeAxisTicks(Number(minX), Number(maxX));
  const polyline = chartPoints.map((point) => {
    const x = padding + (point[xKey] - minX) / (maxX - minX || 1) * plotWidth;
    const y = height - padding - (point[yKey] - minY) / ySpan * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  function pointerX(event: PointerEvent<SVGSVGElement> | globalThis.WheelEvent) {
    const target = event.currentTarget as SVGSVGElement;
    const rect = target.getBoundingClientRect();
    const viewBoxX = (event.clientX - rect.left) / rect.width * width;
    return Math.min(width - padding, Math.max(padding, viewBoxX));
  }

  function valueAtX(x: number) {
    const ratio = (x - padding) / plotWidth;
    return minX + ratio * (maxX - minX);
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const x = pointerX(event);
    setDragRange({ startX: x, currentX: x });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const clampedX = pointerX(event);
    if (dragRange) {
      setDragRange({ ...dragRange, currentX: clampedX });
      return;
    }
    const ratio = (clampedX - padding) / plotWidth;
    const value = minX + ratio * (maxX - minX);
    const nearest = chartPoints.reduce((best, point) =>
      Math.abs(point[xKey] - value) < Math.abs(best[xKey] - value) ? point : best
    , chartPoints[0]);
    const x = padding + (nearest[xKey] - minX) / (maxX - minX || 1) * plotWidth;
    const y = height - padding - (nearest[yKey] - minY) / ySpan * plotHeight;
    setHovered({ x, y, point: nearest });
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!dragRange) return;
    const endX = pointerX(event);
    const startX = dragRange.startX;
    setDragRange(null);
    if (Math.abs(endX - startX) < 8) return;
    const nextMin = Math.max(fullXRange[0], Math.min(valueAtX(startX), valueAtX(endX)));
    const nextMax = Math.min(fullXRange[1], Math.max(valueAtX(startX), valueAtX(endX)));
    if (nextMax - nextMin > (fullXRange[1] - fullXRange[0]) / 100) {
      onVisibleXRangeChange([nextMin, nextMax]);
    }
  }

  function resetZoom() {
    setDragRange(null);
    onVisibleXRangeChange(null);
  }

  function handleWheel(event: globalThis.WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    const center = valueAtX(pointerX(event));
    const factor = event.deltaY < 0 ? 0.78 : 1.28;
    const nextSpan = Math.min(fullXRange[1] - fullXRange[0], Math.max((fullXRange[1] - fullXRange[0]) / 80, (maxX - minX) * factor));
    const leftRatio = (center - minX) / (maxX - minX || 1);
    let nextMin = center - nextSpan * leftRatio;
    let nextMax = nextMin + nextSpan;
    if (nextMin < fullXRange[0]) {
      nextMin = fullXRange[0];
      nextMax = nextMin + nextSpan;
    }
    if (nextMax > fullXRange[1]) {
      nextMax = fullXRange[1];
      nextMin = nextMax - nextSpan;
    }
    onVisibleXRangeChange(
      Math.abs(nextMin - fullXRange[0]) < 1e-6 && Math.abs(nextMax - fullXRange[1]) < 1e-6
        ? null
        : [nextMin, nextMax]
    );
  }

  const chartRef = useNonPassiveWheel<SVGSVGElement>(handleWheel);

  return (
    <svg
      ref={chartRef}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${yLabel} curve`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDragRange(null)}
      onPointerLeave={() => {
        setHovered(null);
        setDragRange(null);
      }}
      onDoubleClick={resetZoom}
      onContextMenu={(event) => {
        event.preventDefault();
        resetZoom();
      }}
    >
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
      {minY < 0 && maxY > 0 && <line className="zero-axis" x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} />}
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
      {xTicks.map((tick) => {
        const x = padding + (tick - Number(minX)) / (Number(maxX) - Number(minX) || 1) * plotWidth;
        return (
          <g key={tick.toFixed(3)} className="axis-tick">
            <line x1={x} y1={height - padding} x2={x} y2={height - padding + 4} />
            <text x={x} y={height - 8}>{tick.toFixed(maxX - minX <= 15 ? 1 : 0)}</text>
          </g>
        );
      })}
      <polyline points={polyline} />
      {dragRange && (
        <rect
          className="zoom-selection"
          x={Math.min(dragRange.startX, dragRange.currentX)}
          y={padding}
          width={Math.abs(dragRange.currentX - dragRange.startX)}
          height={plotHeight}
          rx={3}
        />
      )}
      {hovered && (
        <g className="chart-tooltip">
          <line x1={hovered.x} y1={padding} x2={hovered.x} y2={height - padding} />
          <circle cx={hovered.x} cy={hovered.y} r={3} />
          <rect x={Math.min(hovered.x + 8, width - 148)} y={Math.max(8, hovered.y - 28)} width={140} height={22} rx={4} />
          <text x={Math.min(hovered.x + 15, width - 141)} y={Math.max(23, hovered.y - 13)}>
            {Number(hovered.point[xKey]).toFixed(2)} {xUnit}, {Number(hovered.point[yKey]).toFixed(1)}
          </text>
        </g>
      )}
      <text x={width - padding - 74} y={height - 8}>{xUnit}</text>
      <text x={padding + 4} y={padding - 8}>{yLabel}</text>
    </svg>
  );
}

function makeXrdFilename(material: MaterialRecord) {
  const spaceGroup = getSpaceGroupSymbol(material) ?? "unknown";
  return `${material.formula}-${spaceGroup}-simulated-xrd.csv`.replace(/[\\/:*?"<>|]/g, "-");
}

function makePdfFilename(material: MaterialRecord) {
  const spaceGroup = getSpaceGroupSymbol(material) ?? "unknown";
  return `${material.formula}-${spaceGroup}-simulated-pdf.csv`.replace(/[\\/:*?"<>|]/g, "-");
}
