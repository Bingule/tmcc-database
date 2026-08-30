import { useEffect, useMemo, useRef, useState } from "react";
import { parseDelimitedTable, parseTabularFile, TabularParseError, type TabularCell, type TabularSheet } from "../../../lib/tabularParsing";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CaPoint } from "../analysis/reconstructCaRate";
import { CA_RATE_EXAMPLE } from "../data/caExamples";

export interface CaDraftPoint { readonly id: string; readonly time: number | null; readonly current: number | null }
export type CaInputMode = "manual" | "upload";

export const createInitialCaPoints = (): CaDraftPoint[] => Array.from({ length: 5 }, (_, index) => ({
  id: `ca-manual-${index + 1}`, time: null, current: null,
}));

export function CaDataInput({ mode, points, onModeChange, onChange, onLoadExample }: {
  mode: CaInputMode;
  points: ReadonlyArray<Readonly<CaDraftPoint>>;
  onModeChange: (mode: CaInputMode) => void;
  onChange: (points: CaDraftPoint[]) => void;
  onLoadExample: () => void;
}) {
  const { t } = useI18n();
  return <section className="tool-section ca-data-input">
    <h2>{t("rate.ca.input.title")}</h2>
    <div className="rate-input-mode" role="radiogroup" aria-label={t("rate.ca.input.mode")}>
      <label><input type="radio" name="ca-input-mode" value="manual" checked={mode === "manual"} onChange={() => onModeChange("manual")} />{t("rate.input.manual")}</label>
      <label><input type="radio" name="ca-input-mode" value="upload" checked={mode === "upload"} onChange={() => onModeChange("upload")} />{t("rate.input.upload")}</label>
    </div>
    {mode === "manual"
      ? <CaManualTable points={points} onChange={onChange} onLoadExample={onLoadExample} />
      : <CaFileImport onChange={onChange} />}
  </section>;
}

function CaManualTable({ points, onChange, onLoadExample }: {
  points: ReadonlyArray<Readonly<CaDraftPoint>>;
  onChange: (points: CaDraftPoint[]) => void;
  onLoadExample: () => void;
}) {
  const { t } = useI18n();
  const sequence = useRef(points.length);
  const replace = (id: string, field: "time" | "current", raw: string) => onChange(points.map((point) =>
    point.id === id ? { ...point, [field]: raw.trim() === "" ? null : Number(raw) } : { ...point }));
  function paste(event: React.ClipboardEvent<HTMLTableElement>) {
    const text = event.clipboardData.getData("text");
    if (!text.trim()) return;
    let rows: TabularCell[][]; try { rows = parseDelimitedTable(text); } catch { return; }
    if (rows.some((row) => row.length < 2)) return;
    const next = rows.map((row, index) => ({ id: `ca-paste-${Date.now()}-${index}`, time: Number(row[0]), current: Number(row[1]) }));
    if (next.every(({ time, current }) => Number.isFinite(time) && Number.isFinite(current))) {
      event.preventDefault(); onChange(next);
    }
  }
  return <>
    <div className="ca-manual-table-scroll">
      <table className="ca-manual-table" onPaste={paste}>
        <thead><tr><th>{t("rate.ca.input.time")}</th><th>{t("rate.ca.input.current")}</th><th>{t("rate.ca.input.rowAction")}</th></tr></thead>
        <tbody>{points.map((point, index) => <tr key={point.id}>
          <td><input name={`ca-time-${point.id}`} aria-label={`${t("rate.ca.input.time")} ${index + 1}`} type="number" value={point.time ?? ""} onChange={(event) => replace(point.id, "time", event.target.value)} /></td>
          <td><input name={`ca-current-${point.id}`} aria-label={`${t("rate.ca.input.current")} ${index + 1}`} type="number" value={point.current ?? ""} onChange={(event) => replace(point.id, "current", event.target.value)} /></td>
          <td><button type="button" aria-label={`${t("rate.ca.input.deleteRow")} ${index + 1}`} onClick={() => onChange(points.filter(({ id }) => id !== point.id).map((item) => ({ ...item })))}>{t("rate.ca.input.deleteRow")}</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="rate-manual-toolbar">
      <button type="button" onClick={() => { sequence.current += 1; onChange([...points.map((p) => ({ ...p })), { id: `ca-manual-${sequence.current}`, time: null, current: null }]); }}>{t("rate.ca.input.addRow")}</button>
      <button type="button" disabled={points.length === 0} onClick={() => onChange(points.slice(0, -1).map((p) => ({ ...p })))}>{t("rate.ca.input.deleteRow")}</button>
      <button type="button" onClick={() => onChange(createInitialCaPoints())}>{t("rate.ca.input.clear")}</button>
      <button type="button" onClick={onLoadExample}>{t("rate.ca.input.loadExample")}</button>
    </div>
    <p>{t("rate.ca.input.pasteHelp")}</p>
  </>;
}

function CaFileImport({ onChange }: { onChange: (points: CaDraftPoint[]) => void }) {
  const { t } = useI18n();
  const [sheets, setSheets] = useState<TabularSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerMode, setHeaderMode] = useState<"auto" | "header" | "data">("auto");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<TabularCell[][]>([]);
  const [mapping, setMapping] = useState({ time: 0, current: 1 });
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const latestOnChange = useRef(onChange);
  useEffect(() => { latestOnChange.current = onChange; });
  useEffect(() => () => { mounted.current = false; generation.current += 1; }, []);
  function adapt(next = mapping) {
    const parsed = rows.map((row, index) => ({ id: `ca-import-${index + 1}`, time: numeric(row[next.time]), current: numeric(row[next.current]) }));
    latestOnChange.current(parsed);
  }
  function applySheet(sheet: Readonly<TabularSheet>, nextIndex: number, nextMode = headerMode) {
    const inspected = inspectCaSheet(sheet, nextMode, (column) => t("rate.import.column", { column }));
    setSheetIndex(nextIndex); setHeaders(inspected.headers); setRows(inspected.rows); setMapping(inspected.mapping);
    latestOnChange.current(adaptCaRows(inspected.rows, inspected.mapping, nextIndex));
  }
  async function select(file?: File) {
    if (!file) return;
    const token = ++generation.current; setBusy(true); setError("");
    try {
      const parsedSheets = await parseTabularFile(file);
      if (!mounted.current || generation.current !== token) return;
      setFileName(file.name); setSheets(parsedSheets); applySheet(parsedSheets[0], 0);
    } catch (caught) {
      if (mounted.current && generation.current === token) setError(t(caught instanceof TabularParseError && caught.code === "resourceLimitExceeded" ? "rate.import.resourceLimit" : "rate.import.parseError"));
    } finally { if (mounted.current && generation.current === token) setBusy(false); }
  }
  const summary = useMemo(() => summarizeCaRows(rows, mapping), [rows, mapping]);
  return <div className="ca-file-import">
    <label>{t("rate.input.file")}<input type="file" accept=".csv,.txt,.xlsx" disabled={busy} aria-busy={busy} onChange={(event) => void select(event.target.files?.[0])} /></label>
    {busy ? <p role="status" aria-live="polite">{t("rate.import.importing")}</p> : null}
    {error ? <p role="alert" className="tool-validation">{error}</p> : null}
    {headers.length ? <>
      {sheets.length > 1 ? <label>{t("rate.import.sheet")}<select value={sheetIndex} onChange={(event) => applySheet(sheets[Number(event.target.value)], Number(event.target.value))}>{sheets.map((sheet, index) => <option key={`${index}-${sheet.name}`} value={index}>{sheet.name}</option>)}</select></label> : null}
      <label>{t("rate.import.headerMode")}<select value={headerMode} onChange={(event) => { const mode = event.target.value as typeof headerMode; setHeaderMode(mode); applySheet(sheets[sheetIndex], sheetIndex, mode); }}><option value="auto">{t("rate.import.headerAuto")}</option><option value="header">{t("rate.import.headerPresent")}</option><option value="data">{t("rate.import.headerAbsent")}</option></select></label>
      <div className="ca-column-mapping">
        <label>{t("rate.ca.input.timeColumn")}<select value={mapping.time} onChange={(event) => { const next = { ...mapping, time: Number(event.target.value) }; setMapping(next); adapt(next); }}>{headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select></label>
        <label>{t("rate.ca.input.currentColumn")}<select value={mapping.current} onChange={(event) => { const next = { ...mapping, current: Number(event.target.value) }; setMapping(next); adapt(next); }}>{headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select></label>
      </div>
      <dl className="ca-import-summary"><div><dt>{t("rate.ca.input.fileName")}</dt><dd>{fileName}</dd></div><div><dt>{t("rate.ca.input.detected")}</dt><dd>{headers.join(", ")}</dd></div><div><dt>{t("rate.ca.input.rows")}</dt><dd>{rows.length}</dd></div><div><dt>{t("rate.ca.input.valid")}</dt><dd>{summary.valid}</dd></div><div><dt>{t("rate.ca.input.invalid")}</dt><dd>{rows.length - summary.valid}</dd></div><div><dt>{t("rate.ca.input.missing")}</dt><dd>{summary.missing}</dd></div><div><dt>{t("rate.ca.input.timeRange")}</dt><dd>{formatRange(summary.minimumTime, summary.maximumTime)}</dd></div><div><dt>{t("rate.ca.input.currentRange")}</dt><dd>{formatRange(summary.minimumCurrent, summary.maximumCurrent)}</dd></div></dl>
    </> : null}
  </div>;
}

function inspectCaSheet(sheet: Readonly<TabularSheet>, mode: "auto" | "header" | "data", columnLabel: (column: number) => string) {
  const first = sheet.rows[0] ?? [];
  const hasHeader = mode === "header" || (mode === "auto" && first.some((cell) => typeof cell === "string" && /time|current|时间|电流/i.test(cell)));
  let width = 2; for (const row of sheet.rows) if (row.length > width) width = row.length;
  const headers = Array.from({ length: width }, (_, index) => hasHeader ? String(first[index] ?? columnLabel(index + 1)) : columnLabel(index + 1));
  const rows = hasHeader ? sheet.rows.slice(1) : sheet.rows;
  const time = headers.findIndex((value) => /time|时间/i.test(value)); const current = headers.findIndex((value) => /current|电流/i.test(value));
  const mapping = { time: time < 0 ? 0 : time, current: current < 0 ? Math.min(1, width - 1) : current };
  if (mapping.current === mapping.time) mapping.current = Math.min(1, width - 1);
  return { headers, rows, mapping };
}
function adaptCaRows(rows: ReadonlyArray<ReadonlyArray<TabularCell>>, mapping: { time: number; current: number }, sheetIndex: number) {
  return rows.map((row, index) => ({ id: `ca-import-${sheetIndex + 1}-${index + 1}`, time: numeric(row[mapping.time]), current: numeric(row[mapping.current]) }));
}

export function completeCaPoints(points: ReadonlyArray<Readonly<CaDraftPoint>>): CaPoint[] {
  return validateCaDraftPoints(points).points;
}
export function validateCaDraftPoints(points: ReadonlyArray<Readonly<CaDraftPoint>>) {
  const complete: CaPoint[] = []; const invalidPointIds: string[] = [];
  for (const point of points) {
    if (point.time === null && point.current === null) continue;
    if (!point.id || typeof point.time !== "number" || !Number.isFinite(point.time) || typeof point.current !== "number" || !Number.isFinite(point.current)) invalidPointIds.push(point.id);
    else complete.push({ id: point.id, time: point.time, current: point.current });
  }
  return { points: complete, invalidPointIds } as const;
}
function numeric(value: TabularCell | undefined) { if (value == null || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : Number.NaN; }
function summarizeCaRows(rows: ReadonlyArray<ReadonlyArray<TabularCell>>, mapping: { time: number; current: number }) {
  let valid = 0; let missing = 0; let minimumTime = Infinity; let maximumTime = -Infinity; let minimumCurrent = Infinity; let maximumCurrent = -Infinity;
  for (const row of rows) {
    const time = numeric(row[mapping.time]); const current = numeric(row[mapping.current]);
    if (row[mapping.time] == null || row[mapping.current] == null) missing += 1;
    if (typeof time === "number" && Number.isFinite(time) && typeof current === "number" && Number.isFinite(current)) { valid += 1; if (time < minimumTime) minimumTime = time; if (time > maximumTime) maximumTime = time; if (current < minimumCurrent) minimumCurrent = current; if (current > maximumCurrent) maximumCurrent = current; }
  }
  return { valid, missing, minimumTime, maximumTime, minimumCurrent, maximumCurrent };
}
function formatRange(minimum: number, maximum: number) { return Number.isFinite(minimum) ? `${minimum} – ${maximum}` : "—"; }
