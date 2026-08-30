import { useLayoutEffect, useRef, useState } from "react";
import { parseTabularFile, TabularParseError, type TabularCell, type TabularSheet } from "../../../lib/tabularParsing";
import { useI18n } from "../../../i18n/I18nProvider";
import { validateEnergyCurvePoints } from "../utils/energyCurveValidation";
import type { EnergyCurveMode, EnergyCurvePointDraft, EnergyCurveUploadSource } from "./EnergyCurveInput";

type HeaderMode = "auto" | "header" | "data";
interface Mapping { x: number; voltage: number; current: number }
interface Parsed { readonly fileName: string; readonly sheets: ReadonlyArray<Readonly<TabularSheet>> }
export interface EnergyCurveImportPayload { readonly points: EnergyCurvePointDraft[]; readonly source: EnergyCurveUploadSource }

export function EnergyCurveFileImport({ sampleId, mode, currentSign, onImport, parseFile = parseTabularFile }: { sampleId: string; mode: EnergyCurveMode; currentSign: "positive" | "negative"; onImport: (payload: EnergyCurveImportPayload | null) => void; parseFile?: (file: File) => Promise<TabularSheet[]> }) {
  const { t } = useI18n(); const [parsed, setParsed] = useState<Parsed | null>(null); const [sheetIndex, setSheetIndex] = useState(0); const [headerMode, setHeaderMode] = useState<HeaderMode>("auto"); const [mapping, setMapping] = useState<Mapping>({ x: -1, voltage: -1, current: -1 }); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const generation = useRef(0); const mounted = useRef(true); const latestOnImport = useRef(onImport);
  useLayoutEffect(() => { latestOnImport.current = onImport; }, [onImport]);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useLayoutEffect(() => { generation.current += 1; setBusy(false); setParsed(null); setError(""); latestOnImport.current(null); }, [mode, sampleId]);
  const sheet = parsed?.sheets[sheetIndex]; const structure = sheet ? inspect(sheet, headerMode, (column) => t("rate.import.column", { column })) : null; const validMapping = structure ? mappingIsValid(mapping, structure.headers.length, mode) : false; const adapted = parsed && sheet && structure && validMapping ? adapt(sampleId, mode, currentSign, structure.dataRows, mapping) : null;
  async function select(file?: File) {
    if (!file) return;
    const token = ++generation.current;
    setBusy(true); setError(""); setParsed(null); latestOnImport.current(null);
    try {
      const sheets = (await parseFile(file)).filter(({ rows }) => rows.length > 0);
      if (!mounted.current || token !== generation.current) return;
      if (!sheets.length) throw new TabularParseError("emptyFile");
      const nextStructure = inspect(sheets[0], headerMode, (column) => t("rate.import.column", { column }));
      const nextMapping = detect(nextStructure.headers, mode);
      setParsed({ fileName: file.name, sheets }); setSheetIndex(0); setMapping(nextMapping);
      publish({ fileName: file.name, sheets }, 0, headerMode, nextMapping);
    } catch (caught) {
      if (!mounted.current || token !== generation.current) return;
      setParsed(null);
      latestOnImport.current({ points: [], source: failedSource(file.name, headerMode) });
      setError(t(caught instanceof TabularParseError && caught.code === "resourceLimitExceeded" ? "rate.import.resourceLimit" : "rate.import.parseError"));
    } finally {
      if (mounted.current && token === generation.current) setBusy(false);
    }
  }
  function publish(nextParsed: Parsed, nextSheet: number, nextHeader: HeaderMode, nextMapping: Mapping) { const selected = nextParsed.sheets[nextSheet]; const inspected = inspect(selected, nextHeader, (column) => t("rate.import.column", { column })); const mappingValid = mappingIsValid(nextMapping, inspected.headers.length, mode); const next = mappingValid ? adapt(sampleId, mode, currentSign, inspected.dataRows, nextMapping) : { points: [] }; const source = makeSource(nextParsed.fileName, selected.name, selected, inspected, nextHeader, nextMapping, mode); latestOnImport.current({ points: next.points, source }); setError(mappingValid ? "" : t("rate.energy.curve.mappingError")); }
  function apply(nextSheet: number, nextHeader: HeaderMode, nextMapping?: Mapping) { if (!parsed) return; const inspected = inspect(parsed.sheets[nextSheet], nextHeader, (column) => t("rate.import.column", { column })); const resolved = nextMapping ?? detect(inspected.headers, mode); setSheetIndex(nextSheet); setHeaderMode(nextHeader); setMapping(resolved); publish(parsed, nextSheet, nextHeader, resolved); }
  const summary = adapted?.summary;
  return <section className="energy-curve-file-import"><label>{t("rate.input.file")}<input type="file" accept=".csv,.txt,.xlsx" disabled={busy} onChange={(event) => void select(event.target.files?.[0])} /></label>{busy ? <p role="status" aria-live="polite">{t("rate.import.importing")}</p> : null}{error ? <p role="alert" className="tool-validation">{error}</p> : null}{parsed && sheet && structure ? <><div className="energy-import-controls">{parsed.sheets.length > 1 ? <label>{t("rate.import.sheet")}<select value={sheetIndex} onChange={(event) => apply(Number(event.target.value), headerMode)}>{parsed.sheets.map((item, index) => <option key={`${index}-${item.name}`} value={index}>{item.name}</option>)}</select></label> : null}<label>{t("rate.import.headerMode")}<select aria-label={t("rate.import.headerMode")} value={headerMode} onChange={(event) => apply(sheetIndex, event.target.value as HeaderMode)}><option value="auto">{t("rate.import.headerAuto")}</option><option value="header">{t("rate.import.headerPresent")}</option><option value="data">{t("rate.import.headerAbsent")}</option></select></label></div><fieldset className="rate-column-mapping"><legend>{t("rate.import.mapping")}</legend><MappingSelect label={t("rate.energy.curve.mappedAxis")} headers={structure.headers} value={mapping.x} onChange={(x) => apply(sheetIndex, headerMode, { ...mapping, x })} /><MappingSelect label={t("rate.energy.curve.mappedVoltage")} headers={structure.headers} value={mapping.voltage} onChange={(voltage) => apply(sheetIndex, headerMode, { ...mapping, voltage })} />{mode === "time" ? <MappingSelect label={t("rate.energy.curve.mappedCurrent")} headers={structure.headers} value={mapping.current} onChange={(current) => apply(sheetIndex, headerMode, { ...mapping, current })} /> : null}</fieldset>{summary ? <ImportSummary fileName={parsed.fileName} sheetName={sheet.name} headers={structure.headers} mapping={mapping} mode={mode} summary={summary} /> : null}</> : null}</section>;
}

function ImportSummary({ fileName, sheetName, headers, mapping, mode, summary }: { fileName: string; sheetName: string; headers: ReadonlyArray<string>; mapping: Mapping; mode: EnergyCurveMode; summary: ReturnType<typeof adapt>["summary"] }) { const { t } = useI18n(); return <section className="rate-import-summary" aria-live="polite"><h3>{t("rate.import.summary")}</h3><dl><Item label={t("rate.import.fileName")} value={fileName} /><Item label={t("rate.import.sheetName")} value={sheetName} /><Item label={t("rate.import.detectedColumns")} value={headers.join(", ")} /><Item label={t("rate.energy.curve.mappedAxis")} value={headers[mapping.x] ?? ""} /><Item label={t("rate.energy.curve.mappedVoltage")} value={headers[mapping.voltage] ?? ""} />{mode === "time" ? <Item label={t("rate.energy.curve.mappedCurrent")} value={headers[mapping.current] ?? ""} /> : null}<Item label={t("rate.import.rows")} value={summary.rows} /><Item label={t("rate.energy.curve.parseValid")} value={summary.parseValid} /><Item label={t("rate.energy.curve.scientificValid")} value={summary.scientificValid} /><Item label={t("rate.energy.curve.eligible")} value={summary.eligible} /><Item label={t("rate.energy.curve.invalidPoints")} value={summary.invalid} /><Item label={t("rate.import.missing")} value={summary.missing} /><Item label={t("rate.energy.curve.axisRange")} value={formatRange(summary.xRange)} /><Item label={t("rate.energy.curve.voltageRange")} value={formatRange(summary.voltageRange)} />{mode === "time" ? <Item label={t("rate.energy.curve.currentRange")} value={formatRange(summary.currentRange)} /> : null}</dl></section>; }
function MappingSelect({ label, headers, value, onChange }: { label: string; headers: ReadonlyArray<string>; value: number; onChange: (value: number) => void }) { return <label>{label}<select aria-label={label} value={value} onChange={(event) => onChange(Number(event.target.value))}>{value < 0 ? <option value={-1}>—</option> : null}{headers.map((header, index) => <option key={`${index}-${header}`} value={index}>{header}</option>)}</select></label>; }
function Item({ label, value }: { label: string; value: string | number }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function inspect(sheet: Readonly<TabularSheet>, mode: HeaderMode, label: (column: number) => string) { let width = 0; for (const row of sheet.rows) width = Math.max(width, row.length); const first = sheet.rows[0] ?? []; const hasHeader = mode === "header" || (mode === "auto" && looksLikeHeader(first)); const headers = Array.from({ length: width }, (_, index) => hasHeader ? String(first[index] ?? label(index + 1)).trim() || label(index + 1) : label(index + 1)); return { hasHeader, headers, dataRows: hasHeader ? sheet.rows.slice(1) : sheet.rows }; }
function looksLikeHeader(row: ReadonlyArray<TabularCell>) { let numeric = 0; let recognized = 0; for (const cell of row) { if (typeof cell === "number" || (typeof cell === "string" && cell.trim() && Number.isFinite(Number(cell)))) numeric += 1; else if (typeof cell === "string" && /capacity|time|voltage|current|容量|时间|电压|电流/i.test(cell)) recognized += 1; } return numeric === 0 && recognized > 0; }
function detect(headers: ReadonlyArray<string>, mode: EnergyCurveMode): Mapping { const used = new Set<number>(); const take = (pattern: RegExp) => { let index = headers.findIndex((header, candidate) => !used.has(candidate) && pattern.test(header)); if (index < 0) index = headers.findIndex((_, candidate) => !used.has(candidate)); if (index >= 0) used.add(index); return index; }; return { x: take(mode === "capacity" ? /capacity|capacit|容量/i : /time|时间/i), voltage: take(/voltage|volt|电压/i), current: mode === "time" ? take(/current|电流/i) : -1 }; }
function mappingIsValid(mapping: Mapping, width: number, mode: EnergyCurveMode) { const values = mode === "time" ? [mapping.x, mapping.voltage, mapping.current] : [mapping.x, mapping.voltage]; return values.every((value) => Number.isInteger(value) && value >= 0 && value < width) && new Set(values).size === values.length; }
function adapt(sampleId: string, mode: EnergyCurveMode, sign: "positive" | "negative", rows: ReadonlyArray<ReadonlyArray<TabularCell>>, mapping: Mapping) {
  let missing = 0;
  const points = rows.map((row, index) => {
    const x = numeric(row[mapping.x]);
    const voltage = numeric(row[mapping.voltage]);
    const current = mode === "time" ? numeric(row[mapping.current]) : null;
    missing += Number(isMissing(row[mapping.x])) + Number(isMissing(row[mapping.voltage])) + (mode === "time" ? Number(isMissing(row[mapping.current])) : 0);
    return { id: `${sampleId}-import-${index + 1}`, x, voltage, current };
  });
  const validation = validateEnergyCurvePoints(points, mode, sign);
  const validIndices = validation.points.flatMap((point, index) => point.scientificallyValid ? [index] : []);
  const xs = validIndices.map((index) => points[index].x as number);
  const voltages = validIndices.map((index) => points[index].voltage as number);
  const currents = mode === "time" ? validIndices.map((index) => points[index].current as number) : [];
  return { points, summary: { rows: rows.length, parseValid: validation.counts.parseValid, scientificValid: validation.counts.scientificallyValid, eligible: validation.counts.included, invalid: rows.length - validation.counts.scientificallyValid, missing, xRange: range(xs), voltageRange: range(voltages), currentRange: range(currents) } };
}
function makeSource(fileName: string, sheetName: string, sheet: Readonly<TabularSheet>, structure: ReturnType<typeof inspect>, headerMode: HeaderMode, mapping: Mapping, mode: EnergyCurveMode): EnergyCurveUploadSource { const offset = structure.hasHeader ? 1 : 0; const column = (index: number) => index >= 0 ? { index, name: structure.headers[index] ?? "" } : null; return { kind: "upload", fileName, sheetName, headerMode, hasHeader: structure.hasHeader, allHeaders: [...structure.headers], rawHeader: structure.hasHeader ? [...(sheet.rows[0] ?? [])] : null, mapping: { x: column(mapping.x), voltage: column(mapping.voltage), current: mode === "time" ? column(mapping.current) : null }, rawRows: structure.dataRows.map((cells, index) => ({ rowNumber: index + offset + 1, cells: [...cells] })) }; }
function failedSource(fileName: string, headerMode: HeaderMode): EnergyCurveUploadSource { return { kind: "upload", fileName, sheetName: "", headerMode, hasHeader: false, allHeaders: [], rawHeader: null, mapping: { x: null, voltage: null, current: null }, rawRows: [] }; }
function numeric(value: TabularCell | undefined) { if (isMissing(value)) return null; const next = typeof value === "number" ? value : Number(value); return Number.isFinite(next) ? next : Number.NaN; }
function isMissing(value: TabularCell | undefined) { return value == null || (typeof value === "string" && value.trim() === ""); }
function range(values: ReadonlyArray<number>): readonly [number, number] | null { if (!values.length) return null; let min = values[0]; let max = values[0]; for (let index = 1; index < values.length; index += 1) { min = Math.min(min, values[index]); max = Math.max(max, values[index]); } return [min, max]; }
function formatRange(value: readonly [number, number] | null) { return value ? `${value[0]}–${value[1]}` : "—"; }
