import type { CvSeries } from "./cvTypes";
import { CvCycleStructureError, normalizeAlignedCvCycles, splitAlignedCvCycles } from "./cvCycle";
import { CvParseError, makeColumnPairs } from "./cvImport";
import type { CvColumnPair, CvImportOptions, CvParseErrorCode, ParsedCvTable as CvImportParsedCvTable } from "./cvImport";
import {
  TabularParseError,
  checkTabularTextSize,
  parseDelimitedTableWithDelimiter,
  parseRawTabularRows,
  parseTabularFileWithTextParser
} from "./tabularParsing";
import type { TabularCell } from "./tabularParsing";

export { CvParseError, type CvParseErrorCode } from "./cvImport";
export {
  MAX_CELLS,
  MAX_COLUMNS,
  MAX_FILE_BYTES,
  MAX_ROWS,
  MAX_SHEETS,
  MAX_XLSX_COMPRESSION_RATIO,
  MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES,
  MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_XLSX_WORKSHEETS,
  MAX_ZIP_ENTRIES
} from "./tabularParsing";

export type ParsedCvTable = CvImportParsedCvTable & {
  potentialColumn: number;
  currentColumns: Array<{
    column: number;
    header: string;
    inferredScanRate: number | null;
  }>;
}

export function parseDelimitedCv(text: string, options: CvImportOptions): ParsedCvTable {
  try {
    checkTabularTextSize(text);
    const delimiter = detectDelimiter(text, options);
    return makeParsedTable(parseDelimitedTableWithDelimiter(text, delimiter), options);
  } catch (error) {
    throwCvParseError(error);
  }
}

export async function parseCvFile(file: File, options: CvImportOptions): Promise<ParsedCvTable> {
  try {
    return await parseCvFileFromTabular(file, options);
  } catch (error) {
    throwCvParseError(error);
  }
}

async function parseCvFileFromTabular(file: File, options: CvImportOptions): Promise<ParsedCvTable> {
  const extension = file.name.trim().toLocaleLowerCase("en-US").match(/\.[^.]+$/)?.[0] ?? "";
  const sheets = await parseTabularFileWithTextParser(file, (text) => {
    checkTabularTextSize(text);
    const delimiter = detectDelimiter(text, options);
    return parseDelimitedTableWithDelimiter(text, delimiter);
  }, { skipInvalidWorkbookSheets: true });
  if (extension === ".csv" || extension === ".txt") {
    return makeParsedTable(sheets[0]?.rows ?? [], options);
  }
  for (const sheet of sheets) {
    try {
      const table = makeParsedTable(sheet.rows, options);
      if (isUsefulCvTable(table)) return table;
    } catch (error) {
      if (!(error instanceof CvParseError)) throw error;
    }
  }
  throw new CvParseError("malformedFile", {
    reason: "usefulSheetMissing",
    fileName: file.name,
    sheetCount: sheets.length
  });
}

function isUsefulCvTable(table: ParsedCvTable) {
  if (table.pairs.length < 2) return false;
  try {
    table.pairs.forEach((pair) => collectPointsInRowOrder(table, pair));
    return true;
  } catch (error) {
    if (error instanceof CvParseError) return false;
    throw error;
  }
}

export function confirmCvSeries(table: ParsedCvTable, scanRates: number[]): CvSeries[] {
  if (table.pairs.length < 2) {
    throw new CvParseError("insufficientSeries", {
      reason: "seriesCount",
      seriesCount: table.pairs.length
    });
  }
  if (scanRates.length !== table.pairs.length) {
    throw new CvParseError("scanRateCountMismatch", {
      expected: table.pairs.length,
      actual: scanRates.length
    });
  }

  const confirmedRates = Array.from({ length: table.pairs.length }, (_, index) => {
    const scanRate = scanRates[index];
    if (scanRate === undefined || scanRate === null) {
      throw new CvParseError("missingScanRate", { column: table.pairs[index].currentColumn });
    }
    if (!Number.isFinite(scanRate) || scanRate <= 0) {
      throw new CvParseError("invalidScanRate", {
        column: table.pairs[index].currentColumn,
        scanRate
      });
    }
    return scanRate;
  });
  const seenRates = new Set<number>();
  for (const scanRate of confirmedRates) {
    if (seenRates.has(scanRate)) throw new CvParseError("duplicateScanRate", { scanRate });
    seenRates.add(scanRate);
  }

  const series = table.pairs.map((pair, seriesIndex) => ({
    label: pair.currentHeader,
    scanRate: confirmedRates[seriesIndex],
    points: collectPointsInRowOrder(table, pair)
  }));

  try {
    validateConfirmedCycleStructure(series);
  } catch (error) {
    if (error instanceof CvCycleStructureError) {
      throw new CvParseError("invalidCycleStructure", {
        reason: error.reason,
        ...error.detail
      });
    }
    throw error;
  }
  return series;
}

function validateConfirmedCycleStructure(series: CvSeries[]) {
  try {
    const normalized = normalizeAlignedCvCycles(series);
    const tailWithAnotherTurn = normalized.findIndex((cycle, seriesIndex) =>
      ignoredTailChangesDirection(
        series[seriesIndex]!.points,
        cycle.selectedEndIndex,
        cycle.nativePotentialInterval
      ));
    if (tailWithAnotherTurn >= 0) {
      throw new CvCycleStructureError("tooManyTurningPoints", { seriesIndex: tailWithAnotherTurn });
    }
    return;
  } catch (normalizedError) {
    if (!(normalizedError instanceof CvCycleStructureError)) throw normalizedError;
    try {
      const legacyBranches = splitAlignedCvCycles(series);
      if (legacyBranches.every((branches) => branches.length === 1)) return;
    } catch (legacyError) {
      if (legacyError instanceof CvCycleStructureError) throw legacyError;
      throw normalizedError;
    }
    throw normalizedError;
  }
}

function ignoredTailChangesDirection(
  points: CvSeries["points"],
  selectedEndIndex: number,
  nativePotentialInterval: number
): boolean {
  if (selectedEndIndex >= points.length - 1) return false;
  const potentialScale = points.reduce(
    (scale, point) => Math.max(scale, Math.abs(point.potential)),
    1
  );
  const tolerance = Math.max(Number.EPSILON * potentialScale * 32, nativePotentialInterval * 1e-6);
  let direction: -1 | 1 | null = null;
  for (let index = selectedEndIndex + 1; index < points.length; index += 1) {
    const delta = points[index]!.potential - points[index - 1]!.potential;
    if (Math.abs(delta) <= tolerance) continue;
    const nextDirection = delta > 0 ? 1 : -1;
    if (direction !== null && direction !== nextDirection) return true;
    direction = nextDirection;
  }
  return false;
}

function collectPointsInRowOrder(table: ParsedCvTable, pair: CvColumnPair): CvSeries["points"] {
  const points: CvSeries["points"] = [];
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex];
    const potentialCell = row[pair.potentialColumn] ?? null;
    const currentCell = row[pair.currentColumn] ?? null;
    const potentialMissing = isMissingCell(potentialCell);
    const currentMissing = isMissingCell(currentCell);
    if (table.layout === "sharedPotential" && currentMissing) continue;
    if (table.layout === "pairedPotentialCurrent" && potentialMissing && currentMissing) continue;
    if (table.layout === "pairedPotentialCurrent" && potentialMissing !== currentMissing) {
      throw new CvParseError("malformedFile", {
        reason: "incompletePairRow",
        row: rowIndex + (table.headerMode === "header" ? 2 : 1),
        potentialColumn: pair.potentialColumn,
        currentColumn: pair.currentColumn
      });
    }
    const potential = finiteNumber(potentialCell);
    if (potential === null) {
      throw new CvParseError("malformedFile", {
        reason: "invalidPotential",
        row: rowIndex + (table.headerMode === "header" ? 2 : 1),
        value: potentialCell
      });
    }
    const current = finiteNumber(currentCell);
    if (current === null) {
      throw new CvParseError("malformedFile", {
        reason: "invalidCurrent",
        row: rowIndex + (table.headerMode === "header" ? 2 : 1),
        header: pair.currentHeader,
        value: currentCell
      });
    }
    points.push({ potential, current });
  }
  if (points.length < 2) {
    throw new CvParseError("insufficientSeries", {
      reason: "pointCount",
      header: pair.currentHeader,
      pointCount: points.length
    });
  }
  return points;
}

function detectDelimiter(text: string, options: CvImportOptions) {
  const candidates = [",", "\t", ";"] as const;
  const evaluations = candidates.map((delimiter) => evaluateDelimiter(text, delimiter, options));
  const valid = evaluations
    .filter((evaluation) => evaluation.valid)
    .sort(compareDelimiterEvaluations);
  if (valid.length > 0) return valid[0].delimiter;
  if (hasValidWhitespaceStructure(text, options)) return null;

  const malformed = evaluations
    .filter((evaluation) => evaluation.columnCount > 1 || evaluation.quotedDelimiterPrefix)
    .sort(compareDelimiterEvaluations);
  return malformed[0]?.delimiter ?? null;
}

function hasValidWhitespaceStructure(text: string, options: CvImportOptions) {
  const rows = parseRawTabularRows(text, null);
  if (rows.length < 2 || rows[0].length < 2
    || rows.some((row) => row.length !== rows[0].length)) return false;
  try {
    const table = makeParsedTable(parseDelimitedTableWithDelimiter(text, null), options);
    return hasCompletePairRow(table);
  } catch {
    return false;
  }
}

interface DelimiterEvaluation {
  delimiter: string;
  valid: boolean;
  validDataRows: number;
  pairCount: number;
  columnCount: number;
  consistentRows: number;
  quotedDelimiterPrefix: boolean;
}

function evaluateDelimiter(text: string, delimiter: string, options: CvImportOptions): DelimiterEvaluation {
  const empty = {
    delimiter,
    valid: false,
    validDataRows: 0,
    pairCount: 0,
    columnCount: 0,
    consistentRows: 0,
    quotedDelimiterPrefix: looksLikeQuotedDelimiter(text, delimiter)
  };
  let rows: string[][];
  try {
    rows = parseRawTabularRows(text, delimiter)
      .filter((row) => row.some((cell) => cell.trim().length > 0));
  } catch {
    return empty;
  }
  if (rows.length === 0) return empty;

  const columnCount = rows[0].length;
  const consistentRows = rows.filter((row) => row.length === columnCount).length;
  if (rows.length < 2 || columnCount < 2 || consistentRows !== rows.length) {
    return { ...empty, columnCount, consistentRows };
  }

  let table: ParsedCvTable;
  try {
    table = makeParsedTable(parseDelimitedTableWithDelimiter(text, delimiter), options);
  } catch {
    return { ...empty, columnCount, consistentRows };
  }
  const validDataRows = table.rows.filter((row) => table.pairs.some((pair) =>
    finiteNumber(row[pair.potentialColumn]) !== null && finiteNumber(row[pair.currentColumn]) !== null
  )).length;
  return {
    ...empty,
    valid: validDataRows > 0,
    validDataRows,
    pairCount: table.pairs.length,
    columnCount,
    consistentRows
  };
}

function compareDelimiterEvaluations(left: DelimiterEvaluation, right: DelimiterEvaluation) {
  return right.validDataRows - left.validDataRows
    || right.pairCount - left.pairCount
    || right.columnCount - left.columnCount
    || right.consistentRows - left.consistentRows;
}

function looksLikeQuotedDelimiter(text: string, delimiter: string) {
  const delimiterIndex = text.indexOf(delimiter);
  return delimiterIndex > 0
    && text.includes(`${delimiter}"`)
}

function makeParsedTable(rawRows: TabularCell[][], options: CvImportOptions): ParsedCvTable {
  const rows = rawRows.filter((row) => row.some((cell) => !isMissingCell(cell)));
  if (rows.length === 0) throw new CvParseError("emptyFile");
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new CvParseError("emptyFile");
  const sourceHeaders = options.headerMode === "header" ? rows[0] : [];
  const dataRows = options.headerMode === "header" ? rows.slice(1) : rows;
  if (dataRows.length === 0) throw new CvParseError("malformedFile", { reason: "dataRowsMissing" });
  const headers = options.headerMode === "header"
    ? sourceHeaders.map(headerText)
    : makeGeneratedHeaders(width, options);
  const pairs = makeColumnPairs(headers, options);
  return { ...options, headers, rows: dataRows, pairs, ...makeLegacyCompatibility(pairs) };
}

function makeGeneratedHeaders(width: number, options: CvImportOptions) {
  if (options.layout === "sharedPotential") {
    return Array.from({ length: width }, (_, column) => column === 0 ? "X" : `Y${column}`);
  }
  return Array.from({ length: width }, (_, column) => `${column % 2 === 0 ? "X" : "Y"}${Math.floor(column / 2) + 1}`);
}

function makeLegacyCompatibility(pairs: CvColumnPair[]) {
  return {
    potentialColumn: pairs[0]?.potentialColumn ?? 0,
    currentColumns: pairs.map((pair) => ({
      column: pair.currentColumn,
      header: pair.currentHeader,
      inferredScanRate: inferScanRate(pair.currentHeader)
    }))
  };
}

function hasCompletePairRow(table: ParsedCvTable) {
  return table.rows.some((row) => table.pairs.some((pair) =>
    finiteNumber(row[pair.potentialColumn]) !== null && finiteNumber(row[pair.currentColumn]) !== null
  ));
}

function headerText(value: string | number | null) {
  return value === null ? "" : String(value).trim();
}

function inferScanRate(header: string) {
  const normalized = header
    .normalize("NFKC")
    .replace(/[−⁻]/g, "-")
    .replace(/¹/g, "1")
    .trim();
  if (isNumericToken(normalized)) return positiveFiniteOrNull(Number(normalized));
  const match = normalized.match(
    /^[^\d.,+-]*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*m\s*v\s*(?:\/\s*s|(?:[·*]\s*)?s\s*(?:\^\s*)?-\s*1)$/i
  );
  return match ? positiveFiniteOrNull(Number(match[1])) : null;
}

function positiveFiniteOrNull(value: number) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function finiteNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!isNumericToken(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function isMissingCell(value: unknown): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

function isNumericToken(value: string) {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value);
}

function throwCvParseError(error: unknown): never {
  if (error instanceof TabularParseError) throw new CvParseError(error.code, error.detail);
  throw error;
}
