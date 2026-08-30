import { useEffect, useRef, useState } from "react";
import { parseTabularFile, TabularParseError, type TabularCell } from "../../../lib/tabularParsing";
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
      <label><input type="radio" checked={mode === "manual"} onChange={() => onModeChange("manual")} />{t("rate.input.manual")}</label>
      <label><input type="radio" checked={mode === "upload"} onChange={() => onModeChange("upload")} />{t("rate.input.upload")}</label>
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
    const rows = text.trim().split(/\r?\n/).map((line) => line.trim().split(/[\t,; ]+/).slice(0, 2));
    if (!text.trim() || rows.some((row) => row.length < 2)) return;
    const next = rows.map(([time, current], index) => ({ id: `ca-paste-${Date.now()}-${index}`, time: Number(time), current: Number(current) }));
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
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<TabularCell[][]>([]);
  const [mapping, setMapping] = useState({ time: 0, current: 1 });
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  function adapt(next = mapping) {
    const parsed = rows.map((row, index) => ({ id: `ca-import-${index + 1}`, time: numeric(row[next.time]), current: numeric(row[next.current]) }));
    onChange(parsed);
  }
  async function select(file?: File) {
    if (!file) return;
    try {
      const [sheet] = await parseTabularFile(file);
      if (!mounted.current) return;
      const first = sheet?.rows[0] ?? [];
      const hasHeader = first.some((cell) => typeof cell === "string" && /time|current|时间|电流/i.test(cell));
      const nextHeaders = Array.from({ length: Math.max(...sheet.rows.map((row) => row.length), 2) }, (_, index) => hasHeader ? String(first[index] ?? index + 1) : t("rate.import.column", { column: index + 1 }));
      const nextRows = (hasHeader ? sheet.rows.slice(1) : sheet.rows).map((row) => [...row]);
      const nextMapping = { time: Math.max(0, nextHeaders.findIndex((value) => /time|时间/i.test(value))), current: Math.max(0, nextHeaders.findIndex((value) => /current|电流/i.test(value))) };
      if (nextMapping.current === nextMapping.time) nextMapping.current = Math.min(1, nextHeaders.length - 1);
      setFileName(file.name); setHeaders(nextHeaders); setRows(nextRows); setMapping(nextMapping); setError("");
      onChange(nextRows.map((row, index) => ({ id: `ca-import-${index + 1}`, time: numeric(row[nextMapping.time]), current: numeric(row[nextMapping.current]) })));
    } catch (caught) {
      if (mounted.current) setError(t(caught instanceof TabularParseError && caught.code === "resourceLimitExceeded" ? "rate.import.resourceLimit" : "rate.import.parseError"));
    }
  }
  const valid = rows.filter((row) => Number.isFinite(numeric(row[mapping.time])) && Number.isFinite(numeric(row[mapping.current])));
  const missing = rows.filter((row) => row[mapping.time] == null || row[mapping.current] == null).length;
  return <div className="ca-file-import">
    <label>{t("rate.input.file")}<input type="file" accept=".csv,.txt,.xlsx" onChange={(event) => void select(event.target.files?.[0])} /></label>
    {error ? <p role="alert" className="tool-validation">{error}</p> : null}
    {headers.length ? <>
      <div className="ca-column-mapping">
        <label>{t("rate.ca.input.timeColumn")}<select value={mapping.time} onChange={(event) => { const next = { ...mapping, time: Number(event.target.value) }; setMapping(next); adapt(next); }}>{headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select></label>
        <label>{t("rate.ca.input.currentColumn")}<select value={mapping.current} onChange={(event) => { const next = { ...mapping, current: Number(event.target.value) }; setMapping(next); adapt(next); }}>{headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select></label>
      </div>
      <dl className="ca-import-summary"><div><dt>{t("rate.ca.input.fileName")}</dt><dd>{fileName}</dd></div><div><dt>{t("rate.ca.input.detected")}</dt><dd>{headers.join(", ")}</dd></div><div><dt>{t("rate.ca.input.rows")}</dt><dd>{rows.length}</dd></div><div><dt>{t("rate.ca.input.valid")}</dt><dd>{valid.length}</dd></div><div><dt>{t("rate.ca.input.invalid")}</dt><dd>{rows.length - valid.length}</dd></div><div><dt>{t("rate.ca.input.missing")}</dt><dd>{missing}</dd></div><div><dt>{t("rate.ca.input.timeRange")}</dt><dd>{range(valid.map((row) => numeric(row[mapping.time])))}</dd></div><div><dt>{t("rate.ca.input.currentRange")}</dt><dd>{range(valid.map((row) => numeric(row[mapping.current])))}</dd></div></dl>
    </> : null}
  </div>;
}

export function completeCaPoints(points: ReadonlyArray<Readonly<CaDraftPoint>>): CaPoint[] {
  return points.flatMap((point) => Number.isFinite(point.time) && Number.isFinite(point.current) ? [{ id: point.id, time: point.time as number, current: point.current as number }] : []);
}
function numeric(value: TabularCell | undefined) { if (value == null || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : Number.NaN; }
function range(values: Array<number | null>) { const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)); return finite.length ? `${Math.min(...finite)} – ${Math.max(...finite)}` : "—"; }
