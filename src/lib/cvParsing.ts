import readXlsxFile from "read-excel-file/browser";
import type { CvSeries } from "./cvTypes";

export type CvParseErrorCode =
  | "emptyFile"
  | "malformedFile"
  | "potentialColumnMissing"
  | "currentColumnsMissing"
  | "missingScanRate"
  | "duplicateScanRate"
  | "invalidScanRate"
  | "insufficientSeries"
  | "resourceLimitExceeded";

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

export interface ParsedCvTable {
  headers: string[];
  rows: Array<Array<string | number | null>>;
  potentialColumn: number;
  currentColumns: Array<{
    column: number;
    header: string;
    inferredScanRate: number | null;
  }>;
}

export class CvParseError extends Error {
  readonly code: CvParseErrorCode;
  readonly detail: Readonly<Record<string, unknown>>;

  constructor(code: CvParseErrorCode, detail: Readonly<Record<string, unknown>> = {}) {
    super(code);
    this.name = "CvParseError";
    this.code = code;
    this.detail = detail;
  }
}

export function parseDelimitedCv(text: string): ParsedCvTable {
  if (text.trim().length === 0) throw new CvParseError("emptyFile");
  const byteLength = text.length > MAX_FILE_BYTES ? text.length : new TextEncoder().encode(text).byteLength;
  if (byteLength > MAX_FILE_BYTES) throwResourceLimit("fileBytes", MAX_FILE_BYTES, byteLength);
  const delimiter = detectDelimiter(text);
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

  return makeParsedTable(rows.map((row) => row.map(parseTextCell)));
}

export async function parseCvFile(file: File): Promise<ParsedCvTable> {
  if (file.size > MAX_FILE_BYTES) throwResourceLimit("fileBytes", MAX_FILE_BYTES, file.size);
  const extension = file.name.trim().toLocaleLowerCase("en-US").match(/\.[^.]+$/)?.[0] ?? "";
  if (extension === ".xls") {
    throw new CvParseError("malformedFile", { reason: "unsupportedXls", fileName: file.name });
  }
  if (extension === ".csv" || extension === ".txt") {
    try {
      return parseDelimitedCv(await readFileText(file));
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
        const table = makeParsedTable(sheet.data.map((row) => row.map(normalizeWorkbookCell)));
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
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
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
  try {
    confirmCvSeries(table, table.currentColumns.map((_, index) => index + 1));
    return true;
  } catch (error) {
    if (error instanceof CvParseError) return false;
    throw error;
  }
}

export function confirmCvSeries(table: ParsedCvTable, scanRates: number[]): CvSeries[] {
  if (table.currentColumns.length < 2) {
    throw new CvParseError("insufficientSeries", {
      reason: "seriesCount",
      seriesCount: table.currentColumns.length
    });
  }
  if (scanRates.length !== table.currentColumns.length) {
    throw new CvParseError("missingScanRate", {
      expected: table.currentColumns.length,
      actual: scanRates.length
    });
  }

  const confirmedRates = Array.from({ length: table.currentColumns.length }, (_, index) => {
    const scanRate = scanRates[index];
    if (scanRate === undefined || scanRate === null) {
      throw new CvParseError("missingScanRate", { column: table.currentColumns[index].column });
    }
    if (!Number.isFinite(scanRate) || scanRate <= 0) {
      throw new CvParseError("invalidScanRate", {
        column: table.currentColumns[index].column,
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

  return table.currentColumns.map((currentColumn, seriesIndex) => {
    const points: CvSeries["points"] = [];
    const seenPotentials = new Set<number>();
    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      const row = table.rows[rowIndex];
      const currentCell = row[currentColumn.column] ?? null;
      if (isMissingCell(currentCell)) continue;
      const potential = finiteNumber(row[table.potentialColumn]);
      if (potential === null) {
        throw new CvParseError("malformedFile", {
          reason: "invalidPotential",
          row: rowIndex + 2,
          value: row[table.potentialColumn]
        });
      }
      const current = finiteNumber(currentCell);
      if (current === null) {
        throw new CvParseError("malformedFile", {
          reason: "invalidCurrent",
          row: rowIndex + 2,
          header: currentColumn.header,
          value: currentCell
        });
      }
      if (seenPotentials.has(potential)) {
        throw new CvParseError("malformedFile", {
          reason: "duplicatePotential",
          row: rowIndex + 2,
          header: currentColumn.header,
          potential
        });
      }
      seenPotentials.add(potential);
      points.push({ potential, current });
    }
    if (points.length < 2) {
      throw new CvParseError("insufficientSeries", {
        reason: "pointCount",
        header: currentColumn.header,
        pointCount: points.length
      });
    }
    points.sort((left, right) => left.potential - right.potential);
    return { label: currentColumn.header, scanRate: confirmedRates[seriesIndex], points };
  });
}

function detectDelimiter(text: string) {
  const candidates = [",", "\t", ";"] as const;
  const evaluations = candidates.map((delimiter) => evaluateDelimiter(text, delimiter));
  const valid = evaluations
    .filter((evaluation) => evaluation.valid)
    .sort(compareDelimiterEvaluations);
  if (valid.length > 0) return valid[0].delimiter;
  if (hasValidWhitespaceCvStructure(text)) return null;

  const malformed = evaluations
    .filter((evaluation) => evaluation.headerCurrentCount > 0 || evaluation.quotedCvPrefix)
    .sort(compareDelimiterEvaluations);
  return malformed[0]?.delimiter ?? null;
}

function hasValidWhitespaceCvStructure(text: string) {
  const rows = parseWhitespaceRows(text);
  if (rows.length < 2 || rows[0].length < 2
    || rows.some((row) => row.length !== rows[0].length)) return false;
  try {
    const table = makeParsedTable(rows.map((row) => row.map(parseTextCell)));
    return table.rows.some((row) => finiteNumber(row[table.potentialColumn]) !== null
      && table.currentColumns.some((currentColumn) => finiteNumber(row[currentColumn.column]) !== null));
  } catch {
    return false;
  }
}

interface DelimiterEvaluation {
  delimiter: string;
  valid: boolean;
  validDataRows: number;
  headerCurrentCount: number;
  columnCount: number;
  consistentRows: number;
  quotedCvPrefix: boolean;
}

function evaluateDelimiter(text: string, delimiter: string): DelimiterEvaluation {
  const empty = {
    delimiter,
    valid: false,
    validDataRows: 0,
    headerCurrentCount: 0,
    columnCount: 0,
    consistentRows: 0,
    quotedCvPrefix: looksLikeQuotedCvDelimiter(text, delimiter)
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
  const headers = rows[0].map((cell) => headerText(parseTextCell(cell)));
  const potentialColumn = headers.findIndex(isPotentialHeader);
  const headerCurrentCount = headers.filter((header, column) => column !== potentialColumn
    && (inferScanRate(header) !== null || isCurrentHeader(header))).length;
  const consistentRows = rows.filter((row) => row.length === columnCount).length;
  if (rows.length < 2 || columnCount < 2 || consistentRows !== rows.length
    || potentialColumn === -1 || headerCurrentCount === 0) {
    return { ...empty, columnCount, consistentRows, headerCurrentCount };
  }

  let table: ParsedCvTable;
  try {
    table = makeParsedTable(rows.map((row) => row.map(parseTextCell)));
  } catch {
    return { ...empty, columnCount, consistentRows, headerCurrentCount };
  }
  const validDataRows = table.rows.filter((row) => finiteNumber(row[table.potentialColumn]) !== null
    && table.currentColumns.some((currentColumn) => finiteNumber(row[currentColumn.column]) !== null)).length;
  return {
    ...empty,
    valid: validDataRows > 0,
    validDataRows,
    headerCurrentCount: table.currentColumns.length,
    columnCount,
    consistentRows
  };
}

function compareDelimiterEvaluations(left: DelimiterEvaluation, right: DelimiterEvaluation) {
  return right.validDataRows - left.validDataRows
    || right.headerCurrentCount - left.headerCurrentCount
    || right.columnCount - left.columnCount
    || right.consistentRows - left.consistentRows;
}

function looksLikeQuotedCvDelimiter(text: string, delimiter: string) {
  const delimiterIndex = text.indexOf(delimiter);
  return delimiterIndex > 0
    && text.includes(`${delimiter}"`)
    && isPotentialHeader(text.slice(0, delimiterIndex).trim());
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

function makeParsedTable(inputRows: Array<Array<string | number | null>>) {
  const rows = inputRows.filter((row) => row.some((cell) => !isMissingCell(cell)));
  if (rows.length === 0) throw new CvParseError("emptyFile");
  const headers = rows[0].map(headerText);
  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    throw new CvParseError("malformedFile", { reason: "headerMissing" });
  }
  const dataRows = rows.slice(1).map((row) => Array.from(
    { length: headers.length },
    (_, column) => row[column] ?? null
  ));
  if (dataRows.length === 0) throw new CvParseError("malformedFile", { reason: "dataRowsMissing" });

  const potentialColumn = headers.findIndex(isPotentialHeader);
  if (potentialColumn === -1) throw new CvParseError("potentialColumnMissing");
  const currentColumns = headers.flatMap((header, column) => {
    if (column === potentialColumn) return [];
    const inferredScanRate = inferScanRate(header);
    if (inferredScanRate === null && !isCurrentHeader(header)) return [];
    return [{ column, header, inferredScanRate }];
  });
  if (currentColumns.length === 0) throw new CvParseError("currentColumnsMissing");
  return { headers, rows: dataRows, potentialColumn, currentColumns };
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

function isPotentialHeader(header: string) {
  const normalized = header.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (["potential", "voltage", "电位", "电压", "電位", "電壓", "potencial", "potenziale"].includes(normalized)) {
    return true;
  }
  if (/(?:^|[^a-z])(potential|voltage)(?:$|[^a-z])/.test(normalized)) return true;
  return /^e(?:\s*(?:[/(_-]\s*)?(?:m?v|volts?)\s*\)?)?$/.test(normalized);
}

function isCurrentHeader(header: string) {
  const normalized = header.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (["i", "current", "电流", "電流", "corriente", "courant", "strom"].includes(normalized)) return true;
  return /(?:^|[^a-z])current(?:$|[^a-z])/.test(normalized) || /电流|電流/.test(normalized);
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

function readFileText(file: File) {
  if (typeof file.text === "function") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(file);
  });
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
