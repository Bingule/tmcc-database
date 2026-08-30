import { useEffect, useRef, useState } from "react";
import { parseTabularFile, TabularParseError, type TabularCell } from "../../../lib/tabularParsing";
import { useI18n } from "../../../i18n/I18nProvider";
import type { EnergyCapacityUnit, EnergyNormalizationBasis } from "../analysis/energyPower";
import { BasisOptions } from "./EnergySummaryInput";

export type EnergyCurveMode = "capacity" | "time";
export interface EnergyCurvePointDraft { readonly id: string; readonly x: number | null; readonly voltage: number | null; readonly current: number | null }
export interface EnergyCurveDraft {
  readonly mode: EnergyCurveMode; readonly inputMode: "manual" | "upload"; readonly sampleName: string;
  readonly points: ReadonlyArray<Readonly<EnergyCurvePointDraft>>; readonly xUnit: EnergyCapacityUnit | "s" | "min" | "h";
  readonly currentUnit: "mA" | "A" | "mA-g-1" | "A-g-1"; readonly basis: EnergyNormalizationBasis;
  readonly massG: number | null; readonly volumeCm3: number | null; readonly dischargeTimeHours: number | null;
}
export const createEnergyCurveDraft = (): EnergyCurveDraft => ({
  mode: "capacity", inputMode: "manual", sampleName: "", points: initialPoints(), xUnit: "mAh-g-1",
  currentUnit: "mA-g-1", basis: "active-material", massG: null, volumeCm3: null, dischargeTimeHours: null,
});
function initialPoints(): EnergyCurvePointDraft[] { return Array.from({ length: 5 }, (_, index) => ({ id: `energy-curve-${index + 1}`, x: null, voltage: null, current: null })); }

export function EnergyCurveInput({ value, onChange }: { value: Readonly<EnergyCurveDraft>; onChange: (value: EnergyCurveDraft) => void }) {
  const { t } = useI18n();
  const number = (raw: string) => raw.trim() === "" ? null : Number(raw);
  const set = <K extends keyof EnergyCurveDraft>(key: K, next: EnergyCurveDraft[K]) => onChange({ ...value, [key]: next });
  function changeMode(mode: EnergyCurveMode) { onChange({ ...createEnergyCurveDraft(), mode, xUnit: mode === "capacity" ? "mAh-g-1" : "s" }); }
  const replacePoint = (id: string, key: "x" | "voltage" | "current", raw: string) => set("points", value.points.map((point) => point.id === id ? { ...point, [key]: number(raw) } : { ...point }));
  function paste(event: React.ClipboardEvent<HTMLTableElement>) {
    const columns = value.mode === "capacity" ? 2 : 3;
    const rows = event.clipboardData.getData("text").trim().split(/\r?\n/).map((line) => line.trim().split(/[\t,; ]+/).slice(0, columns));
    if (!rows.length || rows.some((row) => row.length !== columns || row.some((cell) => !Number.isFinite(Number(cell))))) return;
    event.preventDefault(); set("points", rows.map((row, index) => ({ id: `energy-paste-${Date.now()}-${index}`, x: Number(row[0]), voltage: Number(row[1]), current: value.mode === "time" ? Number(row[2]) : null })));
  }
  return <section className="tool-section energy-curve-input">
    <h2>{t("rate.energy.curve.title")}</h2>
    <div className="rate-input-mode" role="radiogroup" aria-label={t("rate.energy.curve.modeLabel")}>
      <label><input type="radio" checked={value.mode === "capacity"} onChange={() => changeMode("capacity")} />{t("rate.energy.curve.capacityMode")}</label>
      <label><input type="radio" checked={value.mode === "time"} onChange={() => changeMode("time")} />{t("rate.energy.curve.timeMode")}</label>
    </div>
    <div className="rate-input-mode" role="radiogroup" aria-label={t("rate.energy.curve.inputModeLabel")}>
      <label><input type="radio" checked={value.inputMode === "manual"} onChange={() => set("inputMode", "manual")} />{t("rate.input.manual")}</label>
      <label><input type="radio" checked={value.inputMode === "upload"} onChange={() => set("inputMode", "upload")} />{t("rate.input.upload")}</label>
    </div>
    <CurveSettings value={value} onChange={onChange} />
    {value.inputMode === "manual" ? <><div className="energy-curve-table-scroll"><table className="energy-curve-table" onPaste={paste}><thead><tr><th>{value.mode === "capacity" ? t("rate.energy.input.capacity") : t("rate.energy.curve.time")}</th><th>{t("rate.energy.curve.voltage")}</th>{value.mode === "time" ? <th>{t("rate.energy.curve.current")}</th> : null}<th>{t("rate.energy.input.action")}</th></tr></thead><tbody>{value.points.map((point, index) => <tr key={point.id}><td><input aria-label={`${value.mode} ${index + 1}`} type="number" value={point.x ?? ""} onChange={(event) => replacePoint(point.id, "x", event.target.value)} /></td><td><input aria-label={`${t("rate.energy.curve.voltage")} ${index + 1}`} type="number" value={point.voltage ?? ""} onChange={(event) => replacePoint(point.id, "voltage", event.target.value)} /></td>{value.mode === "time" ? <td><input aria-label={`${t("rate.energy.curve.current")} ${index + 1}`} type="number" value={point.current ?? ""} onChange={(event) => replacePoint(point.id, "current", event.target.value)} /></td> : null}<td><button type="button" onClick={() => set("points", value.points.filter(({ id }) => id !== point.id).map((item) => ({ ...item })))}>{t("rate.energy.input.delete")}</button></td></tr>)}</tbody></table></div><button type="button" onClick={() => set("points", [...value.points.map((point) => ({ ...point })), { id: `energy-curve-${Date.now()}`, x: null, voltage: null, current: null }])}>{t("rate.ca.input.addRow")}</button></> : <EnergyCurveFileImport mode={value.mode} onPoints={(points) => set("points", points)} />}
  </section>;
}

function CurveSettings({ value, onChange }: { value: Readonly<EnergyCurveDraft>; onChange: (value: EnergyCurveDraft) => void }) {
  const { t } = useI18n(); const number = (raw: string) => raw.trim() === "" ? null : Number(raw);
  const set = <K extends keyof EnergyCurveDraft>(key: K, next: EnergyCurveDraft[K]) => onChange({ ...value, [key]: next });
  return <div className="energy-input-grid"><label>{t("rate.energy.input.sampleName")}<input value={value.sampleName} onChange={(event) => set("sampleName", event.target.value)} /></label><label>{t("rate.energy.curve.axisUnit")}<select value={value.xUnit} onChange={(event) => set("xUnit", event.target.value as EnergyCurveDraft["xUnit"])}>{value.mode === "capacity" ? <><option value="mAh-g-1">mAh g^-1</option><option value="Ah-kg-1">Ah kg^-1</option><option value="mAh">mAh</option></> : <><option value="s">s</option><option value="min">min</option><option value="h">h</option></>}</select></label>{value.mode === "time" ? <label>{t("rate.energy.curve.currentUnit")}<select value={value.currentUnit} onChange={(event) => set("currentUnit", event.target.value as EnergyCurveDraft["currentUnit"])}><option value="mA">mA</option><option value="A">A</option><option value="mA-g-1">mA g^-1</option><option value="A-g-1">A g^-1</option></select></label> : <label>{t("rate.energy.curve.durationHours")}<input type="number" value={value.dischargeTimeHours ?? ""} onChange={(event) => set("dischargeTimeHours", number(event.target.value))} /></label>}<label>{t("rate.energy.input.basis")}<select value={value.basis} onChange={(event) => set("basis", event.target.value as EnergyNormalizationBasis)}><BasisOptions /></select></label><label>{t("rate.energy.input.mass")}<input type="number" value={value.massG ?? ""} onChange={(event) => set("massG", number(event.target.value))} /></label><label>{t("rate.energy.input.volume")}<input type="number" value={value.volumeCm3 ?? ""} onChange={(event) => set("volumeCm3", number(event.target.value))} /></label></div>;
}

function EnergyCurveFileImport({ mode, onPoints }: { mode: EnergyCurveMode; onPoints: (points: EnergyCurvePointDraft[]) => void }) {
  const { t } = useI18n(); const [summary, setSummary] = useState<{ headers: string[]; rows: number; valid: number; invalid: number } | null>(null); const [error, setError] = useState(""); const mounted = useRef(true); const generation = useRef(0); useEffect(() => () => { mounted.current = false; generation.current += 1; }, []);
  async function select(file?: File) { if (!file) return; const token = ++generation.current; try { const [sheet] = await parseTabularFile(file); if (!mounted.current || token !== generation.current || !sheet) return; const columns = mode === "capacity" ? 2 : 3; const first = sheet.rows[0] ?? []; const hasHeader = first.some((cell) => typeof cell === "string"); const headers = Array.from({ length: columns }, (_, index) => String((hasHeader ? first[index] : null) ?? index + 1)); const rows = hasHeader ? sheet.rows.slice(1) : sheet.rows; const points = rows.map((row, index) => ({ id: `energy-import-${index + 1}`, x: numeric(row[0]), voltage: numeric(row[1]), current: mode === "time" ? numeric(row[2]) : null })); const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.voltage) && (mode === "capacity" || Number.isFinite(point.current))).length; setSummary({ headers, rows: rows.length, valid, invalid: rows.length - valid }); setError(""); onPoints(points); } catch (caught) { if (mounted.current && token === generation.current) setError(t(caught instanceof TabularParseError && caught.code === "resourceLimitExceeded" ? "rate.import.resourceLimit" : "rate.import.parseError")); } }
  return <div><label>{t("rate.input.file")}<input type="file" accept=".csv,.txt,.xlsx" onChange={(event) => void select(event.target.files?.[0])} /></label>{error ? <p role="alert" className="tool-validation">{error}</p> : null}{summary ? <dl className="ca-import-summary"><div><dt>{t("rate.ca.input.detected")}</dt><dd>{summary.headers.join(", ")}</dd></div><div><dt>{t("rate.ca.input.rows")}</dt><dd>{summary.rows}</dd></div><div><dt>{t("rate.ca.input.valid")}</dt><dd>{summary.valid}</dd></div><div><dt>{t("rate.ca.input.invalid")}</dt><dd>{summary.invalid}</dd></div></dl> : null}</div>;
}
function numeric(value: TabularCell | undefined) { if (value == null || value === "") return null; const next = Number(value); return Number.isFinite(next) ? next : Number.NaN; }
