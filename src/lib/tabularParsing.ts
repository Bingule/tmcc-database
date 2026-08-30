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

export type TabularParseErrorCode = "emptyFile" | "malformedFile" | "resourceLimitExceeded";

export class TabularParseError extends Error {
  readonly code: TabularParseErrorCode;
  readonly detail: Readonly<Record<string, unknown>>;

  constructor(code: TabularParseErrorCode, detail: Readonly<Record<string, unknown>> = {}) {
    super(code);
    this.name = "TabularParseError";
    this.code = code;
    this.detail = detail;
  }
}

export type TabularCell = string | number | null;

export interface TabularSheet {
  name: string;
  rows: TabularCell[][];
}

type TextTableParser = (text: string) => TabularCell[][];
type TabularFileAdapterOptions = { skipInvalidWorkbookSheets?: boolean };

export function parseDelimitedTable(text: string): TabularCell[][] {
  checkTabularTextSize(text);
  return parseDelimitedTableWithDelimiter(text, detectDelimiter(text));
}

export function parseDelimitedTableWithDelimiter(text: string, delimiter: string | null): TabularCell[][] {
  checkTabularTextSize(text);
  if (text.trim().length === 0) throw new TabularParseError("emptyFile");
  const rows = parseRawTabularRows(text, delimiter)
    .filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length === 0) throw new TabularParseError("emptyFile");
  checkTableLimits(rows);
  checkRowWidths(rows);
  return rows.map((row) => row.map(parseTextCell));
}

export function parseRawTabularRows(text: string, delimiter: string | null): string[][] {
  return delimiter === null ? parseWhitespaceRows(text) : parseDelimitedRows(text, delimiter);
}

export function checkTabularTextSize(text: string) {
  const byteLength = text.length > MAX_FILE_BYTES ? text.length : new TextEncoder().encode(text).byteLength;
  if (byteLength > MAX_FILE_BYTES) throwResourceLimit("fileBytes", MAX_FILE_BYTES, byteLength);
}

export function parseTabularFile(file: File): Promise<TabularSheet[]> {
  return parseTabularFileWithTextParser(file, parseDelimitedTable);
}

export async function parseTabularFileWithTextParser(
  file: File,
  parseTextTable: TextTableParser,
  options: TabularFileAdapterOptions = {}
): Promise<TabularSheet[]> {
  if (file.size > MAX_FILE_BYTES) throwResourceLimit("fileBytes", MAX_FILE_BYTES, file.size);
  const extension = file.name.trim().toLocaleLowerCase("en-US").match(/\.[^.]+$/)?.[0] ?? "";
  if (extension === ".xls") {
    throw new TabularParseError("malformedFile", { reason: "unsupportedXls", fileName: file.name });
  }
  if (extension === ".csv" || extension === ".txt") {
    try {
      return [{ name: file.name, rows: parseTextTable(await readFileText(file)) }];
    } catch (error) {
      if (error instanceof TabularParseError) throw error;
      throw new TabularParseError("malformedFile", {
        reason: "fileReadFailed",
        fileName: file.name,
        errorName: error instanceof Error || error instanceof DOMException ? error.name : "unknown"
      });
    }
  }
  if (extension !== ".xlsx") {
    throw new TabularParseError("malformedFile", { reason: "unsupportedFileType", fileName: file.name });
  }

  try {
    const workbookBuffer = await readFileArrayBuffer(file);
    preflightXlsxArchive(workbookBuffer);
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(workbookBuffer);
    if (sheets.length > MAX_SHEETS) throwResourceLimit("sheets", MAX_SHEETS, sheets.length);
    let workbookCells = 0;
    const normalized = sheets.map((sheet) => {
      checkTableLimits(sheet.data);
      workbookCells += sheet.data.reduce((total, row) => total + row.length, 0);
      if (workbookCells > MAX_CELLS) throwResourceLimit("cells", MAX_CELLS, workbookCells);
      let rows: TabularCell[][];
      try {
        rows = sheet.data.map((row) => row.map(normalizeWorkbookCell));
      } catch (error) {
        if (!options.skipInvalidWorkbookSheets || !(error instanceof TabularParseError)) throw error;
        rows = [];
      }
      return { name: sheet.sheet ?? (sheet as typeof sheet & { name?: string }).name ?? "", rows };
    });
    return normalized;
  } catch (error) {
    if (error instanceof TabularParseError) throw error;
    throw new TabularParseError("malformedFile", {
      reason: "invalidXlsx",
      fileName: file.name,
      errorName: error instanceof Error ? error.name : "unknown"
    });
  }
}

function detectDelimiter(text: string) {
  const candidates = [",", "\t", ";"] as const;
  const evaluations = candidates.map((delimiter) => evaluateDelimiter(text, delimiter));
  const valid = evaluations
    .filter((evaluation) => evaluation.totalRows > 0
      && evaluation.consistentRows === evaluation.totalRows
      && evaluation.columnCount > 1)
    .sort(compareDelimiterEvaluations);
  if (valid.length > 0) return valid[0].delimiter;
  if (hasValidWhitespaceStructure(text)) return null;

  const malformed = evaluations
    .filter((evaluation) => evaluation.columnCount > 1 || evaluation.quotedDelimiterPrefix)
    .sort(compareDelimiterEvaluations);
  return malformed[0]?.delimiter ?? null;
}

interface DelimiterEvaluation {
  delimiter: string;
  columnCount: number;
  consistentRows: number;
  totalRows: number;
  quotedDelimiterPrefix: boolean;
}

function evaluateDelimiter(text: string, delimiter: string): DelimiterEvaluation {
  const empty = {
    delimiter,
    columnCount: 0,
    consistentRows: 0,
    totalRows: 0,
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
  return {
    ...empty,
    columnCount,
    consistentRows: rows.filter((row) => row.length === columnCount).length,
    totalRows: rows.length
  };
}

function compareDelimiterEvaluations(left: DelimiterEvaluation, right: DelimiterEvaluation) {
  const leftFullyConsistent = left.consistentRows === left.totalRows ? 1 : 0;
  const rightFullyConsistent = right.consistentRows === right.totalRows ? 1 : 0;
  return rightFullyConsistent - leftFullyConsistent
    || right.consistentRows - left.consistentRows
    || right.columnCount - left.columnCount;
}

function hasValidWhitespaceStructure(text: string) {
  const rows = parseWhitespaceRows(text);
  return rows.length > 0 && rows[0].length > 1
    && rows.every((row) => row.length === rows[0].length);
}

function looksLikeQuotedDelimiter(text: string, delimiter: string) {
  const delimiterIndex = text.indexOf(delimiter);
  return delimiterIndex > 0 && text.includes(`${delimiter}"`);
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
        throw new TabularParseError("malformedFile", {
          reason: "charactersAfterQuote",
          character,
          index
        });
      }
    } else if (character === '"') {
      if (field.length !== 0) {
        throw new TabularParseError("malformedFile", { reason: "unexpectedQuote" });
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
  if (quoted) throw new TabularParseError("malformedFile", { reason: "unclosedQuote" });
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

function checkRowWidths(rows: string[][]) {
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new TabularParseError("emptyFile");
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].length !== width) {
      throw new TabularParseError("malformedFile", {
        reason: "rowWidth",
        row: index + 1,
        expected: width,
        actual: rows[index].length
      });
    }
  }
}

function parseTextCell(value: string): TabularCell {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (isNumericToken(trimmed)) {
    const number = Number(trimmed);
    if (Number.isFinite(number)) return number;
  }
  return trimmed;
}

function isNumericToken(value: string) {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value);
}

function normalizeWorkbookCell(value: unknown): TabularCell {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TabularParseError("malformedFile", { reason: "nonFiniteCell" });
    return value;
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  throw new TabularParseError("malformedFile", { reason: "unsupportedCellValue" });
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
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) {
      throwResourceLimit("zip64", 0, 1);
    }
    const next = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (next > eocd) throw new Error("zipCentralEntryBounds");
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replace(/\\/g, "/");
    if (uncompressed > MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES) {
      throwResourceLimit("zipEntryBytes", MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES, uncompressed);
    }
    totalUncompressed += uncompressed;
    if (totalUncompressed > MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES) {
      throwResourceLimit("zipTotalBytes", MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES, totalUncompressed);
    }
    const ratio = uncompressed === 0 ? 0 : compressed === 0 ? Number.POSITIVE_INFINITY : uncompressed / compressed;
    if (ratio > MAX_XLSX_COMPRESSION_RATIO) {
      throwResourceLimit("zipCompressionRatio", MAX_XLSX_COMPRESSION_RATIO, ratio);
    }
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) {
      worksheets += 1;
      if (worksheets > MAX_XLSX_WORKSHEETS) {
        throwResourceLimit("zipWorksheets", MAX_XLSX_WORKSHEETS, worksheets);
      }
    }
    localChecks.push({ offset: localOffset, compressed });
    cursor = next;
  }
  if (cursor !== eocd) throw new Error("zipCentralSizeMismatch");
  for (const local of localChecks) {
    if (local.offset + 30 > centralOffset || view.getUint32(local.offset, true) !== 0x04034b50) {
      throw new Error("zipLocalHeader");
    }
    const localNameLength = view.getUint16(local.offset + 26, true);
    const localExtraLength = view.getUint16(local.offset + 28, true);
    if (local.offset + 30 + localNameLength + localExtraLength + local.compressed > centralOffset) {
      throw new Error("zipLocalBounds");
    }
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

function throwResourceLimit(
  resource: "fileBytes" | "sheets" | "rows" | "columns" | "cells" | "zip64" | "zipEntries"
    | "zipEntryBytes" | "zipTotalBytes" | "zipCompressionRatio" | "zipWorksheets",
  limit: number,
  actual: number
): never {
  throw new TabularParseError("resourceLimitExceeded", { resource, limit, actual });
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
