import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { publicAssetPath } from "../lib/paths";
import type { MaterialRecord } from "../lib/types";

type Mode = "dos" | "band";
type PlotPoint = { x: number; y: number };
type PlotSeries = { label: string; points: PlotPoint[] };

export function ElectronicStructureViewer({ material }: { material: MaterialRecord }) {
  const [mode, setMode] = useState<Mode>("dos");
  const [series, setSeries] = useState<PlotSeries[]>([]);
  const [status, setStatus] = useState("");
  const file = publicAssetPath(mode === "dos" ? material.files.dos : material.files.band_structure);
  const label = mode === "dos" ? "Density of states" : "Band structure";

  useEffect(() => {
    let cancelled = false;
    setSeries([]);

    if (!file) {
      setStatus("-");
      return;
    }

    setStatus(`Loading ${label.toLowerCase()} data...`);
    fetch(file)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load electronic data");
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        const parsed = mode === "dos" ? parseDosCsv(text) : parseBandCsv(text);
        setSeries(parsed);
        setStatus(parsed.length > 0 ? "" : "-");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("Unable to load electronic data");
      });

    return () => {
      cancelled = true;
    };
  }, [file, label, mode]);

  return (
    <div className="electronic-panel" aria-label="DOS and band structure viewer">
      <div className="electronic-switch" role="tablist" aria-label="Electronic structure view">
        <button type="button" className={mode === "dos" ? "active" : ""} onClick={() => setMode("dos")}>
          Density of states
        </button>
        <button type="button" className={mode === "band" ? "active" : ""} onClick={() => setMode("band")}>
          Band structure
        </button>
      </div>
      {file ? (
        <a className="secondary-button electronic-download" href={file} download={mode === "dos" ? "DOS.csv" : "band_structure.csv"}>
          <Download size={15} />
          {mode === "dos" ? "Download DOS CSV" : "Download Band CSV"}
        </a>
      ) : null}

      <div className="electronic-chart">
        {series.length > 0 ? (
          <ElectronicPlot
            series={series}
            xLabel={mode === "dos" ? "Energy - Ef (eV)" : "k-path"}
            yLabel={mode === "dos" ? "DOS" : "Energy (eV)"}
            fermiReference={mode === "dos" ? "vertical" : "horizontal"}
          />
        ) : (
          <div className="electronic-placeholder">
            <strong>{status || "-"}</strong>
            <span>
              {mode === "dos"
                ? "Add a DOS CSV path to material.files.dos after the GPAW DOS calculation is exported."
                : "Add a band-structure CSV path to material.files.band_structure after the GPAW band calculation is exported."}
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

function ElectronicPlot({
  series,
  xLabel,
  yLabel,
  fermiReference
}: {
  series: PlotSeries[];
  xLabel: string;
  yLabel: string;
  fermiReference: "vertical" | "horizontal";
}) {
  const width = 780;
  const height = 280;
  const padding = 38;
  const allPoints = series.flatMap((item) => item.points);
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const colors = ["#0f1720", "#7b8790", "#27566a", "#b48b21", "#4f7f67", "#8a617a", "#a35b4f", "#5466a3"];
  const xAtZero = padding + (0 - minX) / (maxX - minX || 1) * (width - padding * 2);
  const yAtZero = height - padding - (0 - minY) / (maxY - minY || 1) * (height - padding * 2);

  const paths = useMemo(() => series.map((item, index) => {
    const points = item.points.map((point) => {
      const x = padding + (point.x - minX) / (maxX - minX || 1) * (width - padding * 2);
      const y = height - padding - (point.y - minY) / (maxY - minY || 1) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return { label: item.label, points, color: colors[index % colors.length] };
  }), [maxX, maxY, minX, minY, series]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${yLabel} plot`}>
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
      {fermiReference === "vertical" && xAtZero >= padding && xAtZero <= width - padding ? (
        <>
          <line className="fermi-line" x1={xAtZero} y1={padding} x2={xAtZero} y2={height - padding} />
          <text className="fermi-label" x={xAtZero + 5} y={padding + 12}>Ef</text>
        </>
      ) : null}
      {fermiReference === "horizontal" && yAtZero >= padding && yAtZero <= height - padding ? (
        <>
          <line className="fermi-line" x1={padding} y1={yAtZero} x2={width - padding} y2={yAtZero} />
          <text className="fermi-label" x={width - padding - 22} y={yAtZero - 5}>Ef</text>
        </>
      ) : null}
      {paths.map((path) => <polyline key={path.label} points={path.points} stroke={path.color} />)}
      <text x={padding + 4} y={padding - 10}>{yLabel}</text>
      <text x={width - padding - 80} y={height - 9}>{xLabel}</text>
      <g className="electronic-legend">
        {paths.slice(0, 8).map((path, index) => (
          <g key={path.label} transform={`translate(${padding + (index % 4) * 145}, ${height - 23 + Math.floor(index / 4) * 12})`}>
            <line x1="0" y1="-3" x2="14" y2="-3" stroke={path.color} />
            <text x="18" y="0">{path.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
