import { useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sheet = parsed?.sheets[sheetIndex];
  const structure = sheet ? inspectSheet(sheet, (column) => t("rate.import.column", { column })) : null;
  const result = parsed && sheet && structure
    ? adaptRateSheet(parsed.fileName, sheet, structure.dataRows, structure.headers, mapping, rateUnit, capacityUnit)
    : null;

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const sheets = await parseFile(file);
      const usable = sheets.filter(({ rows }) => rows.length > 0);
      if (usable.length === 0) throw new TabularParseError("emptyFile");
      const nextSheet = usable[0];
      const detected = inspectSheet(nextSheet, (column) => t("rate.import.column", { column }));
      const nextMapping = detectMapping(detected.headers);
      setParsed({ fileName: file.name, sheets: usable });
      setSheetIndex(0);
      setMapping(nextMapping);
      onImport(adaptRateSheet(
        file.name,
        nextSheet,
        detected.dataRows,
        detected.headers,
        nextMapping,
        rateUnit,
        capacityUnit,
      ).points);
    } catch (caught) {
      setParsed(null);
      setError(t(caught instanceof TabularParseError && caught.code === "resourceLimitExceeded"
        ? "rate.import.resourceLimit"
        : "rate.import.parseError"));
    } finally {
      setBusy(false);
    }
  }

  function applyMapping(next: RateColumnMappingValue) {
    setMapping(next);
    if (parsed && sheet && structure) {
      onImport(adaptRateSheet(parsed.fileName, sheet, structure.dataRows, structure.headers, next, rateUnit, capacityUnit).points);
    }
  }

  function applySheet(nextIndex: number) {
    if (!parsed) return;
    const nextSheet = parsed.sheets[nextIndex];
    const inspected = inspectSheet(nextSheet, (column) => t("rate.import.column", { column }));
    const nextMapping = detectMapping(inspected.headers);
    setSheetIndex(nextIndex);
    setMapping(nextMapping);
    onImport(adaptRateSheet(parsed.fileName, nextSheet, inspected.dataRows, inspected.headers, nextMapping, rateUnit, capacityUnit).points);
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
    },
  };
}

function inspectSheet(sheet: Readonly<TabularSheet>, columnLabel: (column: number) => string) {
  const width = Math.max(0, ...sheet.rows.map((row) => row.length));
  const first = sheet.rows[0] ?? [];
  const hasHeader = first.some((cell) => typeof cell === "string" && cell.trim() !== "");
  const headers = Array.from({ length: width }, (_, index) => hasHeader
    ? String(first[index] ?? columnLabel(index + 1)).trim() || columnLabel(index + 1)
    : columnLabel(index + 1));
  return { headers, dataRows: hasHeader ? sheet.rows.slice(1) : sheet.rows };
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
  return values.length === 0 ? null : [Math.min(...values), Math.max(...values)];
}

function safeId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "sheet";
}
