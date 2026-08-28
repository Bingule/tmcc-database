import { useEffect, useRef, useState } from "react";
import {
  parseTabularFile,
  TabularParseError,
  type TabularCell,
  type TabularSheet,
} from "../../../lib/tabularParsing";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CapacityUnit, RatePoint, RateUnit } from "../models/types";
import { validateRatePoints } from "../utils/rateValidation";
import { ColumnMapping, type RateColumnMappingValue } from "./ColumnMapping";
import { DatasetSummary, type RateImportSummary } from "./DatasetSummary";

interface ParsedRateFile {
  readonly fileName: string;
  readonly sheets: ReadonlyArray<Readonly<TabularSheet>>;
}

type RateHeaderMode = "auto" | "header" | "data";

export function RateFileImport({
  rateUnit,
  capacityUnit,
  onImport,
  parseFile = parseTabularFile,
}: {
  rateUnit: RateUnit;
  capacityUnit: CapacityUnit;
  onImport: (points: RatePoint[]) => void;
  parseFile?: (file: File) => Promise<TabularSheet[]>;
}) {
  const { t } = useI18n();
  const [parsed, setParsed] = useState<ParsedRateFile | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<RateColumnMappingValue>({ rateColumn: 0, capacityColumn: 1 });
  const [headerMode, setHeaderMode] = useState<RateHeaderMode>("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const mounted = useRef(true);
  const latestOnImport = useRef(onImport);
  latestOnImport.current = onImport;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  const sheet = parsed?.sheets[sheetIndex];
  const structure = sheet ? inspectSheet(sheet, (column) => t("rate.import.column", { column }), headerMode) : null;
  const result = parsed && sheet && structure
    ? adaptRateSheet(parsed.fileName, sheet, structure.dataRows, structure.headers, mapping, rateUnit, capacityUnit)
    : null;

  async function selectFile(file: File | undefined) {
    if (!file) return;
    const token = generation.current + 1;
    generation.current = token;
    setBusy(true);
    setError("");
    try {
      const sheets = await parseFile(file);
      if (!mounted.current || generation.current !== token) return;
      const usable = sheets.filter(({ rows }) => rows.length > 0);
      if (usable.length === 0) throw new TabularParseError("emptyFile");
      const nextSheet = usable[0];
      const detected = inspectSheet(nextSheet, (column) => t("rate.import.column", { column }), headerMode);
      const nextMapping = detectMapping(detected.headers);
      setParsed({ fileName: file.name, sheets: usable });
      setSheetIndex(0);
      setMapping(nextMapping);
      latestOnImport.current(adaptRateSheet(
        file.name,
        nextSheet,
        detected.dataRows,
        detected.headers,
        nextMapping,
        rateUnit,
        capacityUnit,
      ).points);
    } catch (caught) {
      if (!mounted.current || generation.current !== token) return;
      setParsed(null);
      setError(t(caught instanceof TabularParseError && caught.code === "resourceLimitExceeded"
        ? "rate.import.resourceLimit"
        : "rate.import.parseError"));
    } finally {
      if (mounted.current && generation.current === token) setBusy(false);
    }
  }

  function applyMapping(next: RateColumnMappingValue) {
    setMapping(next);
    if (parsed && sheet && structure) {
      latestOnImport.current(adaptRateSheet(parsed.fileName, sheet, structure.dataRows, structure.headers, next, rateUnit, capacityUnit).points);
    }
  }

  function applySheet(nextIndex: number) {
    if (!parsed) return;
    const nextSheet = parsed.sheets[nextIndex];
    const inspected = inspectSheet(nextSheet, (column) => t("rate.import.column", { column }), headerMode);
    const nextMapping = detectMapping(inspected.headers);
    setSheetIndex(nextIndex);
    setMapping(nextMapping);
    latestOnImport.current(adaptRateSheet(parsed.fileName, nextSheet, inspected.dataRows, inspected.headers, nextMapping, rateUnit, capacityUnit).points);
  }

  function applyHeaderMode(next: RateHeaderMode) {
    setHeaderMode(next);
    if (!parsed || !sheet) return;
    const inspected = inspectSheet(sheet, (column) => t("rate.import.column", { column }), next);
    const nextMapping = detectMapping(inspected.headers);
    setMapping(nextMapping);
    latestOnImport.current(adaptRateSheet(
      parsed.fileName,
      sheet,
      inspected.dataRows,
      inspected.headers,
      nextMapping,
      rateUnit,
      capacityUnit,
    ).points);
  }

  return <section className="rate-file-import">
    <label className="rate-file-label">{t("rate.input.file")}
      <input
        type="file"
        accept=".csv,.txt,.xlsx"
        aria-label={t("rate.input.file")}
        disabled={busy}
        onChange={(event) => void selectFile(event.target.files?.[0])}
      />
    </label>
    {busy ? <p role="status" aria-live="polite">{t("rate.import.importing")}</p> : null}
    {error ? <p className="tool-validation" role="alert">{error}</p> : null}
    {parsed && sheet && structure && result ? <>
      {parsed.sheets.length > 1 ? <label>{t("rate.import.sheet")}
        <select value={sheetIndex} onChange={(event) => applySheet(Number(event.target.value))}>
          {parsed.sheets.map((item, index) => <option key={`${index}-${item.name}`} value={index}>{item.name}</option>)}
        </select>
      </label> : null}
      <label>{t("rate.import.headerMode")}
        <select
          aria-label={t("rate.import.headerMode")}
          value={headerMode}
          onChange={(event) => applyHeaderMode(event.target.value as RateHeaderMode)}
        >
          <option value="auto">{t("rate.import.headerAuto")}</option>
          <option value="header">{t("rate.import.headerPresent")}</option>
          <option value="data">{t("rate.import.headerAbsent")}</option>
        </select>
      </label>
      <ColumnMapping headers={structure.headers} value={mapping} onChange={applyMapping} />
      <DatasetSummary summary={result.summary} />
    </> : null}
  </section>;
}

export function adaptRateSheet(
  fileName: string,
  sheet: Readonly<TabularSheet>,
  dataRows: ReadonlyArray<ReadonlyArray<TabularCell>>,
  headers: ReadonlyArray<string>,
  mapping: Readonly<RateColumnMappingValue>,
  rateUnit: RateUnit,
  capacityUnit: CapacityUnit,
): { points: RatePoint[]; summary: RateImportSummary } {
  const headerOffset = sheet.rows.length - dataRows.length;
  const points = dataRows.map((row, index): RatePoint => ({
    id: `rate-import-${safeId(sheet.name)}-row-${index + headerOffset + 1}`,
    rate: numericCell(row[mapping.rateColumn]),
    rateUnit,
    capacity: numericCell(row[mapping.capacityColumn]),
    capacityUnit,
  }));
  const report = validateRatePoints(points);
  const missingValues = dataRows.reduce((count, row) => count
    + Number(isMissing(row[mapping.rateColumn]))
    + Number(isMissing(row[mapping.capacityColumn])), 0);
  const validRates = report.validPoints.map(({ rate }) => rate as number);
  const validCapacities = report.validPoints.map(({ capacity }) => capacity as number);
  return {
    points,
    summary: {
      fileName,
      sheetName: sheet.name,
      detectedHeaders: headers,
      mappedRateColumn: headers[mapping.rateColumn] ?? "",
      mappedCapacityColumn: headers[mapping.capacityColumn] ?? "",
      totalRows: dataRows.length,
      validPoints: report.validPoints.length,
      invalidRows: report.invalidPoints.length,
      missingValues,
      rateRange: range(validRates),
      capacityRange: range(validCapacities),
      rateUnit,
      capacityUnit,
    },
  };
}

function inspectSheet(
  sheet: Readonly<TabularSheet>,
  columnLabel: (column: number) => string,
  headerMode: RateHeaderMode,
) {
  let width = 0;
  for (const row of sheet.rows) width = Math.max(width, row.length);
  const first = sheet.rows[0] ?? [];
  const hasHeader = headerMode === "header" || (headerMode === "auto" && looksLikeHeader(first));
  const headers = Array.from({ length: width }, (_, index) => hasHeader
    ? String(first[index] ?? columnLabel(index + 1)).trim() || columnLabel(index + 1)
    : columnLabel(index + 1));
  return { headers, dataRows: hasHeader ? sheet.rows.slice(1) : sheet.rows };
}

function looksLikeHeader(row: ReadonlyArray<TabularCell>) {
  let numericCells = 0;
  let recognizedLabels = 0;
  for (const cell of row) {
    if (typeof cell === "number" || (typeof cell === "string" && cell.trim() !== "" && Number.isFinite(Number(cell)))) {
      numericCells += 1;
    } else if (typeof cell === "string" && /(?:^|\b)(?:rate|current|c-rate|capacity|capacit)(?:\b|$)|倍率|电流|容量/i.test(cell.trim())) {
      recognizedLabels += 1;
    }
  }
  return numericCells === 0 && recognizedLabels > 0;
}

function detectMapping(headers: ReadonlyArray<string>): RateColumnMappingValue {
  const rateColumn = headers.findIndex((header) => /(?:^|\b)(?:rate|current|c-rate)(?:\b|$)|倍率|电流/i.test(header));
  const capacityColumn = headers.findIndex((header) => /capacity|capacit|容量/i.test(header));
  return {
    rateColumn: rateColumn >= 0 ? rateColumn : 0,
    capacityColumn: capacityColumn >= 0 ? capacityColumn : Math.min(1, Math.max(0, headers.length - 1)),
  };
}

function numericCell(cell: TabularCell | undefined): number | null {
  if (isMissing(cell)) return null;
  const value = typeof cell === "number" ? cell : Number(cell);
  return Number.isFinite(value) ? value : Number.NaN;
}

function isMissing(cell: TabularCell | undefined) {
  return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}

function range(values: ReadonlyArray<number>): readonly [number, number] | null {
  if (values.length === 0) return null;
  let minimum = values[0];
  let maximum = values[0];
  for (let index = 1; index < values.length; index += 1) {
    minimum = Math.min(minimum, values[index]);
    maximum = Math.max(maximum, values[index]);
  }
  return [minimum, maximum];
}

function safeId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "sheet";
}
