import { type PointerEvent, useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { publicAssetPath } from "../lib/paths";
import type { MaterialRecord } from "../lib/types";
import { useNonPassiveWheel } from "../lib/useNonPassiveWheel";

type Branch = { branch: number; frequencies: number[] };
type Segment = { segment: number; qpoints: [number, number, number, number, number][]; branches: Branch[] };
type BandData = { material_id: string; unit: "THz"; band_path: string | null; segments: Segment[] };

export function parsePhononBandData(value: unknown, materialId: string): BandData {
  if (!value || typeof value !== "object") throw new Error("Invalid phonon band data");
  const band = value as BandData;
  if (band.material_id !== materialId) throw new Error("Phonon band material ID mismatch");
  if (band.unit !== "THz" || !Array.isArray(band.segments) || band.segments.length === 0)
    throw new Error("Invalid phonon band data");
  for (const segment of band.segments) {
    if (!Array.isArray(segment.qpoints) || segment.qpoints.length < 2 ||
        !Array.isArray(segment.branches) || segment.branches.length === 0)
      throw new Error("Incomplete phonon band segment");
    if (segment.qpoints.some((point) => !Array.isArray(point) || point.length !== 5 || point.some((n) => !Number.isFinite(n))))
      throw new Error("Invalid phonon q-point");
    if (segment.branches.some((branch) => !Array.isArray(branch.frequencies) ||
        branch.frequencies.length !== segment.qpoints.length ||
        branch.frequencies.some((n) => !Number.isFinite(n))))
      throw new Error("Invalid phonon branch");
  }
  return band;
}

export function PhononDispersionViewer({ material }: { material: MaterialRecord }) {
  const { t } = useI18n();
  const file = publicAssetPath(material.phonons.band_data);
  const [band, setBand] = useState<BandData | null>(null);
  const [state, setState] = useState<"loading" | "error" | "empty">("empty");

  useEffect(() => {
    setBand(null);
    if (!file) { setState("empty"); return; }
    const controller = new AbortController();
    let cancelled = false;
    setState("loading");
    fetch(file, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Phonon band download failed");
        return response.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        setBand(parsePhononBandData(data, material.material_id));
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; controller.abort(); };
  }, [file, material.material_id]);

  if (!file) return null;
  return (
    <div className="phonon-dispersion">
      <a className="secondary-button electronic-download" href={file} download={`${material.material_id}-phonon-band.json`}>
        {t("phonon.downloadBand")}
      </a>
      <div className="electronic-chart phonon-chart" aria-live="polite">
        {band ? <PhononPlot key={material.material_id} band={band} /> : (
          <div className="electronic-placeholder">
            <strong>{t(state === "error" ? "phonon.loadError" : state === "loading" ? "phonon.loading" : "phonon.noBand")}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function pathLabels(band: BandData) {
  const pairs = (band.band_path ?? "").split("|").flatMap((part) => {
    const names = part.trim().split("-").map((name) => name.trim()).filter(Boolean);
    return names.slice(1).map((name, index) => [names[index], name] as const);
  });
  const labels = new Map<number, Set<string>>();
  const add = (distance: number, label: string) => {
    if (!labels.has(distance)) labels.set(distance, new Set());
    labels.get(distance)!.add(label === "G" ? "Γ" : label);
  };
  band.segments.forEach((segment, index) => {
    const pair = pairs[index];
    if (!pair) return;
    add(segment.qpoints[0][1], pair[0]);
    add(segment.qpoints.at(-1)![1], pair[1]);
  });
  return [...labels.entries()].sort(([a], [b]) => a - b).map(([distance, names]) =>
    ({ distance, label: [...names].join("|") }));
}

function PhononPlot({ band }: { band: BandData }) {
  const { t } = useI18n();
  const width = 780;
  const height = 340;
  const padding = { top: 34, right: 25, bottom: 58, left: 62 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const fullMinX = band.segments[0].qpoints[0][1];
  const fullMaxX = band.segments.at(-1)!.qpoints.at(-1)![1];
  const frequencies = band.segments.flatMap((segment) => segment.branches.flatMap((branch) => branch.frequencies));
  const dataMinY = Math.min(0, ...frequencies);
  const dataMaxY = Math.max(0, ...frequencies);
  const yMargin = Math.max(0.2, (dataMaxY - dataMinY) * 0.05);
  const minY = dataMinY - yMargin;
  const maxY = dataMaxY + yMargin;
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [dragRange, setDragRange] = useState<{ start: number; current: number } | null>(null);
  const [minX, maxX] = zoomRange ?? [fullMinX, fullMaxX];
  const labels = useMemo(() => pathLabels(band), [band]);
  const xToPixel = (x: number) => padding.left + (x - minX) / (maxX - minX || 1) * plotWidth;
  const yToPixel = (y: number) => height - padding.bottom - (y - minY) / (maxY - minY || 1) * plotHeight;
  const curves = band.segments.flatMap((segment) => segment.branches.map((branch) => ({
    key: `${segment.segment}-${branch.branch}`,
    branch: branch.branch,
    points: segment.qpoints.map((qpoint, index) => ({ x: qpoint[1], y: branch.frequencies[index] }))
      .filter((point) => point.x >= minX && point.x <= maxX)
  }))).filter((curve) => curve.points.length >= 2);

  function pointerX(event: PointerEvent<SVGSVGElement> | WheelEvent) {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / (rect.width || width) * width;
    return Math.max(padding.left, Math.min(width - padding.right, x));
  }
  const valueAt = (x: number) => minX + (x - padding.left) / plotWidth * (maxX - minX);
  function resetZoom() { setZoomRange(null); setDragRange(null); }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".plot-reset")) return;
    const x = pointerX(event);
    setDragRange({ start: x, current: x });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!dragRange) return;
    const start = dragRange.start;
    const end = pointerX(event);
    setDragRange(null);
    if (Math.abs(start - end) < 8) return;
    const next: [number, number] = [Math.min(valueAt(start), valueAt(end)), Math.max(valueAt(start), valueAt(end))];
    if (next[1] - next[0] >= (fullMaxX - fullMinX) / 100) setZoomRange(next);
  }
  function wheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    const center = valueAt(pointerX(event));
    const fullSpan = fullMaxX - fullMinX;
    const span = Math.min(fullSpan, Math.max(fullSpan / 80, (maxX - minX) * (event.deltaY < 0 ? 0.78 : 1.28)));
    const ratio = (center - minX) / (maxX - minX || 1);
    const left = Math.min(fullMaxX - span, Math.max(fullMinX, center - span * ratio));
    setZoomRange(span >= fullSpan ? null : [left, left + span]);
  }
  const plotRef = useNonPassiveWheel<SVGSVGElement>(wheel);

  return (
    <svg ref={plotRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("phonon.plotAria")}
      onPointerDown={pointerDown}
      onPointerMove={(event) => { if (dragRange) setDragRange({ ...dragRange, current: pointerX(event) }); }}
      onPointerUp={pointerUp}
      onPointerCancel={() => setDragRange(null)}
      onDoubleClick={resetZoom}>
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} />
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} />
      {labels.filter(({ distance }) => distance >= minX && distance <= maxX).map(({ distance, label }) => (
        <g className="phonon-path-tick" key={distance}>
          <line x1={xToPixel(distance)} y1={padding.top} x2={xToPixel(distance)} y2={height - padding.bottom} />
          <text x={xToPixel(distance)} y={height - padding.bottom + 22}>{label}</text>
        </g>
      ))}
      {minY < 0 && maxY > 0 && <line className="phonon-zero-line" x1={padding.left} y1={yToPixel(0)} x2={width - padding.right} y2={yToPixel(0)} />}
      {[dataMinY, 0, dataMaxY].filter((value, index, all) => all.indexOf(value) === index).map((value) => (
        <text className="phonon-y-tick" key={value} x={padding.left - 9} y={yToPixel(value) + 4}>{Number(value.toFixed(2))}</text>
      ))}
      {curves.map((curve) => (
        <polyline key={curve.key} points={curve.points.map((point) => `${xToPixel(point.x).toFixed(1)},${yToPixel(point.y).toFixed(1)}`).join(" ")}
          stroke={curve.branch % 2 ? "#27566a" : "#699085"} />
      ))}
      {dragRange && <rect className="zoom-selection" x={Math.min(dragRange.start, dragRange.current)} y={padding.top}
        width={Math.abs(dragRange.current - dragRange.start)} height={plotHeight} />}
      {zoomRange && <g className="plot-reset" role="button" tabIndex={0}
        onClick={resetZoom}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") resetZoom(); }}>
        <rect x={width - 125} y="6" width="100" height="24" rx="5" />
        <text x={width - 75} y="22">{t("electronic.resetZoom")}</text>
      </g>}
      <text className="axis-label" x={padding.left} y="21">{t("phonon.frequencyAxis")} (THz)</text>
      <text className="axis-label phonon-x-label" x={width / 2} y={height - 8}>{t("phonon.pathAxis")}</text>
    </svg>
  );
}
