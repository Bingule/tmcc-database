import readXlsxFile from "read-excel-file/browser";
import type { CvSeries } from "./cvTypes";
import { CvCycleStructureError, normalizeAlignedCvCycles, splitAlignedCvCycles } from "./cvCycle";
import { CvParseError, makeColumnPairs } from "./cvImport";
import type { CvColumnPair, CvImportOptions, CvParseErrorCode, ParsedCvTable as CvImportParsedCvTable } from "./cvImport";

export { CvParseError, type CvParseErrorCode } from "./cvImport";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_SHEETS = 50;
export const MAX_ROWS = 200_000;
export const MAX_COLUMNS = 256;
export const MAX_CELLS = 2_000_000;
export const MAX_ZIP_ENTRIES = 10_000;
export const MAX_XLSX_WORKSHEETS = 50;
export const MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
export const MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_XLSX_COMPRESSION_RATIO = 100;

export type ParsedCvTable = CvImportParsedCvTable & {
  potentialColumn: number;
  currentColumns: Array<{
    column: number;
    header: string;
    inferredScanRate: number | null;
  }>;
}

export function parseDelimitedCv(text: string, options: CvImportOptions): ParsedCvTable {
  if (text.trim().length === 0) throw new CvParseError("emptyFile");
  const byteLength = text.length > MAX_FILE_BYTES ? text.length : new TextEncoder().encode(text).byteLength;
  if (byteLength > MAX_FILE_BYTES) throwResourceLimit("fileBytes", MAX_FILE_BYTES, byteLength);
  const delimiter = detectDelimiter(text, options);
  const rawRows = delimiter === null ? parseWhitespaceRows(text) : parseDelimitedRows(text, delimiter);
  const rows = rawRows.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length === 0) throw new CvParseError("emptyFile");
  checkTableLimits(rows);

  const width = rows[0].length;
  if (width === 0) throw new CvParseError("emptyFile");
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].length !== width) {
      throw new CvParseError("malformedFile", {
        reason: "rowWidth",
        row: index + 1,
        expected: width,
        actual: rows[index].length
      });
    }
  }

  return makeParsedTable(rows.map((row) => row.map(parseTextCell)), options);
}

export async function parseCvFile(file: File, options: CvImportOptions): Promise<ParsedCvTable> {
  if (file.size > MAX_FILE_BYTES) throwResourceLimit("fileBytes", MAX_FILE_BYTES, file.size);
  const extension = file.name.trim().toLocaleLowerCase("en-US").match(/\.[^.]+$/)?.[0] ?? "";
  if (extension === ".xls") {
    throw new CvParseError("malformedFile", { reason: "unsupportedXls", fileName: file.name });
  }
  if (extension === ".csv" || extension === ".txt") {
    try {
      return parseDelimitedCv(await readFileText(file), options);
    } catch (error) {
      if (error instanceof CvParseError) throw error;
      throw new CvParseError("malformedFile", {
        reason: "fileReadFailed",
        fileName: file.name,
        errorName: error instanceof Error || error instanceof DOMException ? error.name : "unknown"
      });
    }
  }
  if (extension !== ".xlsx") {
    throw new CvParseError("malformedFile", { reason: "unsupportedFileType", fileName: file.name });
  }

  try {
    const workbookBuffer = await readFileArrayBuffer(file);
    preflightXlsxArchive(workbookBuffer);
    const sheets = await readXlsxFile(workbookBuffer);
    if (sheets.length > MAX_SHEETS) throwResourceLimit("sheets", MAX_SHEETS, sheets.length);
    let workbookCells = 0;
    for (const sheet of sheets) {
      checkTableLimits(sheet.data);
      workbookCells += sheet.data.reduce((total, row) => total + row.length, 0);
      if (workbookCells > MAX_CELLS) throwResourceLimit("cells", MAX_CELLS, workbookCells);
    }
    for (const sheet of sheets) {
      try {
        const table = makeParsedTable(sheet.data.map((row) => row.map(normalizeWorkbookCell)), options);
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
  } catch (error) {
    if (error instanceof CvParseError) throw error;
    throw new CvParseError("malformedFile", {
      reason: "invalidXlsx",
      fileName: file.name,
      errorName: error instanceof Error ? error.name : "unknown"
    });
  }
}

function preflightXlsxArchive(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const minimumEocdSize = 22;
  if (bytes.length < minimumEocdSize) throw new Error("zipEocdMissing");
  const searchStart = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - minimumEocdSize; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;

    const candidateDisk = view.getUint16(offset + 4, true);
    const candidateCentralDisk = view.getUint16(offset + 6, true);
    const candidateEntriesOnDisk = view.getUint16(offset + 8, true);
    const candidateEntryCount = view.getUint16(offset + 10, true);
    const candidateCentralSize = view.getUint32(offset + 12, true);
    const candidateCentralOffset = view.getUint32(offset + 16, true);
    const candidateCommentLength = view.getUint16(offset + 20, true);
    if (offset + minimumEocdSize + candidateCommentLength !== bytes.length) continue;
    if (candidateDisk !== 0 || candidateCentralDisk !== 0 || candidateEntriesOnDisk !== candidateEntryCount) continue;

    const candidateUsesZip64 = candidateEntriesOnDisk === 0xffff
      || candidateEntryCount === 0xffff
      || candidateCentralSize === 0xffffffff
      || candidateCentralOffset === 0xffffffff;
    if (!candidateUsesZip64
      && (candidateCentralOffset > offset || candidateCentralOffset + candidateCentralSize !== offset)) continue;

    eocd = offset;
    break;
  }
  if (eocd < 0) throw new Error("zipEocdMissing");

  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const commentLength = view.getUint16(eocd + 20, true);
  if (entriesOnDisk === 0xffff || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throwResourceLimit("zip64", 0, 1);
  }
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) throw new Error("zipMultiDiskUnsupported");
  if (entryCount > MAX_ZIP_ENTRIES) throwResourceLimit("zipEntries", MAX_ZIP_ENTRIES, entryCount);
  if (eocd + minimumEocdSize + commentLength !== bytes.length) throw new Error("zipEocdBounds");
  if (centralOffset + centralSize !== eocd || centralOffset > bytes.length) throw new Error("zipCentralBounds");

  let cursor = centralOffset;
  let totalUncompressed = 0;
  let worksheets = 0;
  const localChecks: Array<{ offset: number; compressed: number }> = [];
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("zipCentralSignature");
    const compressed = view.getUint32(cursor + 20, true);
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const entryCommentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) throwResourceLimit("zip64", 0, 1);
    const next = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (next > eocd) throw new Error("zipCentralEntryBounds");
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replace(/\\/g, "/");

    if (uncompressed > MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES) throwResourceLimit("zipEntryBytes", MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES, uncompressed);
    totalUncompressed += uncompressed;
    if (totalUncompressed > MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES) throwResourceLimit("zipTotalBytes", MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES, totalUncompressed);
    const ratio = uncompressed === 0 ? 0 : compressed === 0 ? Number.POSITIVE_INFINITY : uncompressed / compressed;
    if (ratio > MAX_XLSX_COMPRESSION_RATIO) throwResourceLimit("zipCompressionRatio", MAX_XLSX_COMPRESSION_RATIO, ratio);
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) {
      worksheets += 1;
      if (worksheets > MAX_XLSX_WORKSHEETS) throwResourceLimit("zipWorksheets", MAX_XLSX_WORKSHEETS, worksheets);
    }

    localChecks.push({ offset: localOffset, compressed });
    cursor = next;
  }
  if (cursor !== eocd) throw new Error("zipCentralSizeMismatch");
  for (const local of localChecks) {
    if (local.offset + 30 > centralOffset || view.getUint32(local.offset, true) !== 0x04034b50) throw new Error("zipLocalHeader");
    const localNameLength = view.getUint16(local.offset + 26, true);
    const localExtraLength = view.getUint16(local.offset + 28, true);
    if (local.offset + 30 + localNameLength + localExtraLength + local.compressed > centralOffset) throw new Error("zipLocalBounds");
  }
}

function checkTableLimits(rows: ReadonlyArray<ReadonlyArray<unknown>>) {
  if (rows.length > MAX_ROWS) throwResourceLimit("rows", MAX_ROWS, rows.length);
  let cells = 0;
  let columns = 0;
  for (const row of rows) {
    columns = Math.max(columns, row.length);
    cells += row.length;
  }
  if (columns > MAX_COLUMNS) throwResourceLimit("columns", MAX_COLUMNS, columns);
  if (cells > MAX_CELLS) throwResourceLimit("cells", MAX_CELLS, cells);
}

function throwResourceLimit(resource: "fileBytes" | "sheets" | "rows" | "columns" | "cells" | "zip64" | "zipEntries" | "zipEntryBytes" | "zipTotalBytes" | "zipCompressionRatio" | "zipWorksheets", limit: number, actual: number): never {
  throw new CvParseError("resourceLimitExceeded", { resource, limit, actual });
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
  const rows = parseWhitespaceRows(text);
  if (rows.length < 2 || rows[0].length < 2
    || rows.some((row) => row.length !== rows[0].length)) return false;
  try {
    const table = makeParsedTable(rows.map((row) => row.map(parseTextCell)), options);
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
    rows = parseDelimitedRows(text, delimiter)
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
    table = makeParsedTable(rows.map((row) => row.map(parseTextCell)), options);
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

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  const finishField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === delimiter) {
        finishField();
      } else if (character === "\n") {
        finishRow();
      } else if (character !== "\r" && character !== " ") {
        throw new CvParseError("malformedFile", {
          reason: "charactersAfterQuote",
          character,
          index
        });
      }
    } else if (character === '"') {
      if (field.length !== 0) {
        throw new CvParseError("malformedFile", { reason: "unexpectedQuote" });
      }
      quoted = true;
    } else if (character === delimiter) {
      finishField();
    } else if (character === "\n") {
      finishRow();
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (quoted) throw new CvParseError("malformedFile", { reason: "unclosedQuote" });
  if (field.length > 0 || row.length > 0) finishRow();
  return rows;
}

function parseWhitespaceRows(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/));
}

function makeParsedTable(rawRows: Array<Array<string | number | null>>, options: CvImportOptions): ParsedCvTable {
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

function parseTextCell(value: string): string | number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (isNumericToken(trimmed)) {
    const number = Number(trimmed);
    if (Number.isFinite(number)) return number;
  }
  return trimmed;
}

function normalizeWorkbookCell(value: unknown): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CvParseError("malformedFile", { reason: "nonFiniteCell" });
    return value;
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  throw new CvParseError("malformedFile", { reason: "unsupportedCellValue" });
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

async function readFileText(file: File) {
  return decodeTextBuffer(await readFileArrayBuffer(file));
}

function decodeTextBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const content = bytes.subarray(2);
    const littleEndian = new Uint8Array(content.length);
    for (let index = 0; index < content.length; index += 2) {
      littleEndian[index] = content[index + 1] ?? 0;
      littleEndian[index + 1] = content[index] ?? 0;
    }
    return new TextDecoder("utf-16le").decode(littleEndian);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gb18030", { fatal: true }).decode(bytes);
  }
}

function readFileArrayBuffer(file: File) {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new TypeError("fileArrayBufferUnavailable"));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsArrayBuffer(file);
  });
}
