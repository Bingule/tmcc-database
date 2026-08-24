import { Download } from "lucide-react";
import { type PointerEvent, useEffect, useMemo, useState } from "react";
import { makeElectronicDownloadFilename } from "../lib/materials";
import { publicAssetPath } from "../lib/paths";
import type { MaterialRecord } from "../lib/types";
import { useNonPassiveWheel } from "../lib/useNonPassiveWheel";
import { useI18n } from "../i18n/I18nProvider";

type Mode = "dos" | "band";
type PlotPoint = { x: number; y: number };
type PlotSeries = { label: string; points: PlotPoint[] };
type ElectronicStatus = "empty" | "loading" | "error" | null;

export function ElectronicStructureViewer({ material }: { material: MaterialRecord }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("dos");
  const [series, setSeries] = useState<PlotSeries[]>([]);
  const [status, setStatus] = useState<ElectronicStatus>("empty");
  const file = publicAssetPath(mode === "dos" ? material.files.dos : material.files.band_structure);

  useEffect(() => {
    let cancelled = false;
    setSeries([]);

    if (!file) {
      setStatus("empty");
      return;
    }

    setStatus("loading");
    fetch(file)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load electronic data");
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        const parsed = mode === "dos" ? parseDosCsv(text) : parseBandCsv(text);
        setSeries(parsed);
        setStatus(parsed.length > 0 ? null : "empty");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [file, mode]);

  return (
    <div className="electronic-panel" aria-label={t("electronic.viewer")}>
      <div className="electronic-switch" role="tablist" aria-label={t("electronic.view")}>
        <button type="button" className={mode === "dos" ? "active" : ""} onClick={() => setMode("dos")}>
          {t("electronic.densityOfStates")}
        </button>
        <button type="button" className={mode === "band" ? "active" : ""} onClick={() => setMode("band")}>
          {t("electronic.bandStructure")}
        </button>
      </div>
      {file ? (
        <a className="secondary-button electronic-download" href={file} download={makeElectronicDownloadFilename(material, mode)}>
          <Download size={15} />
          {mode === "dos" ? t("electronic.downloadDos") : t("electronic.downloadBand")}
        </a>
      ) : null}

      <div className="electronic-chart">
        {series.length > 0 ? (
          <ElectronicPlot
            series={series}
            xLabel={mode === "dos" ? t("electronic.energyRelative") : t("electronic.kPath")}
            yLabel={mode === "dos" ? "DOS" : t("electronic.energy")}
            fermiReference={mode === "dos" ? "vertical" : "horizontal"}
            fermiLevel={readNumericUnitValue(material.electronic?.fermi_level)}
            fixedXRange={mode === "dos" ? [-6, 6] : null}
          />
        ) : (
          <div className="electronic-placeholder">
            <strong>{status === "loading" ? (mode === "dos" ? t("electronic.loadingDos") : t("electronic.loadingBand")) : status === "error" ? t("electronic.loadError") : "-"}</strong>
            <span>
              {mode === "dos"
                ? t("electronic.dosHelp")
                : t("electronic.bandHelp")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function parseDosCsv(text: string): PlotSeries[] {
  const rows = parseNumericCsv(text);
  const headers = getCsvHeaders(text);
  const energyKey = headers.find((header) => ["energy_ev", "energy", "e_ev", "e"].includes(header));
  if (!energyKey) return [];

  return headers
    .filter((header) => header !== energyKey)
    .map((header) => ({
      label: labelFromHeader(header),
      points: rows
        .map((row) => ({ x: row[energyKey], y: row[header] }))
        .filter((point): point is PlotPoint => Number.isFinite(point.x) && Number.isFinite(point.y))
    }))
    .filter((item) => item.points.length > 0);
}

export function parseBandCsv(text: string): PlotSeries[] {
  const rows = parseNumericCsv(text);
  const grouped = new Map<string, PlotPoint[]>();

  for (const row of rows) {
    const x = firstNumeric(row, ["k_distance", "distance", "k", "x"]);
    const y = firstNumeric(row, ["energy_ev", "energy", "e_ev", "e"]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const band = String(row.band ?? row.band_index ?? row.series ?? "band");
    grouped.set(band, [...(grouped.get(band) ?? []), { x, y }]);
  }

  return [...grouped.entries()].map(([label, points]) => ({ label, points }));
}

function parseNumericCsv(text: string) {
  const lines = getCsvLines(text);
  const headers = getCsvHeaders(text);
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, Number(values[index])]));
  });
}

function getCsvLines(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function getCsvHeaders(text: string) {
  const headerLine = getCsvLines(text)[0] ?? "";
  return headerLine.split(",").map((header) => header.trim().toLowerCase());
}

function firstNumeric(row: Record<string, number>, keys: string[]) {
  for (const key of keys) {
    if (Number.isFinite(row[key])) return row[key];
  }
  return Number.NaN;
}

function labelFromHeader(header: string) {
  return header
    .split("_")
    .filter(Boolean)
    .map((part, index) => {
      if (part === "up") return "up";
      if (part === "down") return "down";
      if (index === 0 && part === "total") return "Total";
      if (index > 0 && ["s", "p", "d", "f"].includes(part)) return part;
      return part.length <= 2 ? part[0].toUpperCase() + part.slice(1) : part;
    })
    .join(" ");
}

export function ElectronicPlot({
  series,
  xLabel,
  yLabel,
  fermiReference,
  fermiLevel,
  fixedXRange
}: {
  series: PlotSeries[];
  xLabel: string;
  yLabel: string;
  fermiReference: "vertical" | "horizontal";
  fermiLevel: number | null;
  fixedXRange: [number, number] | null;
}) {
  const { t } = useI18n();
  const width = 780;
  const height = 320;
  const padding = { top: 78, right: 34, bottom: 48, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const allPoints = series.flatMap((item) => item.points);
  const dataMinX = Math.min(...allPoints.map((point) => point.x));
  const dataMaxX = Math.max(...allPoints.map((point) => point.x));
  const fullXRange: [number, number] = fixedXRange ?? [dataMinX, dataMaxX];
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [dragRange, setDragRange] = useState<{ startX: number; currentX: number } | null>(null);
  const [minX, maxX] = zoomRange ?? fullXRange;
  useEffect(() => setZoomRange(null), [fullXRange[0], fullXRange[1], series]);
  const visibleSeries = useMemo(() => series.map((item) => ({
    ...item,
    points: item.points.filter((point) => point.x >= minX && point.x <= maxX)
  })).filter((item) => item.points.length > 1), [maxX, minX, series]);
  const plottedSeries = visibleSeries.length > 0 ? visibleSeries : series;
  const plottedPoints = plottedSeries.flatMap((item) => item.points);
  const minY = Math.min(...plottedPoints.map((point) => point.y));
  const maxY = Math.max(...plottedPoints.map((point) => point.y));
  const colors = ["#0f1720", "#7b8790", "#27566a", "#b48b21", "#4f7f67", "#8a617a", "#a35b4f", "#5466a3"];
  const xAtZero = padding.left + (0 - minX) / (maxX - minX || 1) * plotWidth;
  const yAtZero = height - padding.bottom - (0 - minY) / (maxY - minY || 1) * plotHeight;
  const xTicks = fixedXRange ? rangeTicks(fixedXRange[0], fixedXRange[1], 1) : rangeTicks(minX, maxX, (maxX - minX) / 6);

  const paths = useMemo(() => plottedSeries.map((item, index) => {
    const points = item.points.map((point) => {
      const x = padding.left + (point.x - minX) / (maxX - minX || 1) * plotWidth;
      const y = height - padding.bottom - (point.y - minY) / (maxY - minY || 1) * plotHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return { label: item.label, points, color: colors[index % colors.length] };
  }), [maxX, maxY, minX, minY, plotHeight, plotWidth, plottedSeries]);

  function pointerX(event: PointerEvent<SVGSVGElement> | globalThis.WheelEvent) {
    const target = event.currentTarget as SVGSVGElement;
    const rect = target.getBoundingClientRect();
    const viewBoxX = (event.clientX - rect.left) / rect.width * width;
    return Math.min(width - padding.right, Math.max(padding.left, viewBoxX));
  }

  function valueAtX(x: number) {
    return minX + (x - padding.left) / plotWidth * (maxX - minX);
  }

  function resetZoom() {
    setDragRange(null);
    setZoomRange(null);
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const x = pointerX(event);
    setDragRange({ startX: x, currentX: x });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!dragRange) return;
    setDragRange({ ...dragRange, currentX: pointerX(event) });
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
      setZoomRange([nextMin, nextMax]);
    }
  }

  function handleWheel(event: globalThis.WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    const center = valueAtX(pointerX(event));
    const factor = event.deltaY < 0 ? 0.78 : 1.28;
    const fullSpan = fullXRange[1] - fullXRange[0];
    const nextSpan = Math.min(fullSpan, Math.max(fullSpan / 80, (maxX - minX) * factor));
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
    setZoomRange(
      Math.abs(nextMin - fullXRange[0]) < 1e-6 && Math.abs(nextMax - fullXRange[1]) < 1e-6
        ? null
        : [nextMin, nextMax]
    );
  }

  const plotRef = useNonPassiveWheel<SVGSVGElement>(handleWheel);

  return (
    <svg
      ref={plotRef}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t("electronic.plotAria", { label: yLabel })}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDragRange(null)}
      onPointerLeave={() => setDragRange(null)}
      onDoubleClick={resetZoom}
      onContextMenu={(event) => {
        event.preventDefault();
        resetZoom();
      }}
    >
      {zoomRange && (
        <g className="plot-reset" role="button" tabIndex={0} onClick={resetZoom}>
          <rect x={width - padding.right - 96} y="18" width="88" height="24" rx="5" />
          <text x={width - padding.right - 52} y="34">{t("electronic.resetZoom")}</text>
        </g>
      )}
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} />
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} />
      {xTicks.map((tick) => {
        const x = padding.left + (tick - minX) / (maxX - minX || 1) * plotWidth;
        return (
          <g key={tick} className="electronic-axis-tick">
            <line x1={x} y1={height - padding.bottom} x2={x} y2={height - padding.bottom + 5} />
            <text x={x} y={height - padding.bottom + 20}>{formatTick(tick)}</text>
          </g>
        );
      })}
      {fermiReference === "vertical" && xAtZero >= padding.left && xAtZero <= width - padding.right ? (
        <>
          <line className="fermi-line" x1={xAtZero} y1={padding.top} x2={xAtZero} y2={height - padding.bottom} />
          <text className="fermi-label" x={xAtZero + 7} y={padding.top + 14}>Ef</text>
        </>
      ) : null}
      {fermiReference === "horizontal" && yAtZero >= padding.top && yAtZero <= height - padding.bottom ? (
        <>
          <line className="fermi-line" x1={padding.left} y1={yAtZero} x2={width - padding.right} y2={yAtZero} />
          <text className="fermi-label" x={width - padding.right - 20} y={yAtZero - 6}>Ef</text>
        </>
      ) : null}
      <text className="fermi-value-label" x={padding.left + 4} y="54">{formatFermiLabel(fermiLevel)}</text>
      {paths.map((path) => <polyline key={path.label} points={path.points} stroke={path.color} />)}
      {dragRange && (
        <rect
          className="zoom-selection"
          x={Math.min(dragRange.startX, dragRange.currentX)}
          y={padding.top}
          width={Math.abs(dragRange.currentX - dragRange.startX)}
          height={plotHeight}
          rx={3}
        />
      )}
      <text className="axis-label" x={padding.left + 4} y={padding.top - 12}>{yLabel}</text>
      <text className="axis-label x-axis-label" x={xAtZero} y={height - 10}>{xLabel}</text>
      <g className="electronic-legend top-legend">
        {paths.slice(0, 8).map((path, index) => (
          <g key={path.label} transform={`translate(${padding.left + 112 + (index % 4) * 145}, ${22 + Math.floor(index / 4) * 16})`}>
            <line x1="0" y1="-3" x2="14" y2="-3" stroke={path.color} />
            <text x="18" y="0">{path.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function readNumericUnitValue(value: unknown) {
  if (!value || typeof value !== "object" || !("value" in value)) return null;
  const unitValue = value as { value?: unknown };
  return typeof unitValue.value === "number" ? unitValue.value : null;
}

function rangeTicks(min: number, max: number, step: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) return [];
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let tick = start; tick <= max + step * 0.001; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }
  return ticks;
}

function formatTick(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatFermiLabel(value: number | null) {
  return value === null ? "Ef" : `Ef = ${value.toFixed(3)} eV`;
}
