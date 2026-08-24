import { readSheet } from "read-excel-file/browser";
import type { CvSeries } from "./cvTypes";

export type CvParseErrorCode =
  | "emptyFile"
  | "malformedFile"
  | "potentialColumnMissing"
  | "currentColumnsMissing"
  | "missingScanRate"
  | "duplicateScanRate"
  | "invalidScanRate"
  | "insufficientSeries";

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
  const delimiter = detectDelimiter(text);
  const rawRows = delimiter === null ? parseWhitespaceRows(text) : parseDelimitedRows(text, delimiter);
  const rows = rawRows.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length === 0) throw new CvParseError("emptyFile");

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
    const sheet = await readSheet(await readFileArrayBuffer(file));
    return makeParsedTable(sheet.map((row) => row.map(normalizeWorkbookCell)));
  } catch (error) {
    if (error instanceof CvParseError) throw error;
    throw new CvParseError("malformedFile", {
      reason: "invalidXlsx",
      fileName: file.name,
      errorName: error instanceof Error ? error.name : "unknown"
    });
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
  let selected: string | null = null;
  let highestCount = 0;
  for (const candidate of candidates) {
    const { count, lineCount } = countOutsideQuotes(text, candidate);
    const hasStructure = lineCount >= 2
      || hasConsistentDelimitedStructure(text, candidate)
      || (count > 0 && text.includes('"'));
    if (hasStructure && count > highestCount) {
      highestCount = count;
      selected = candidate;
    }
  }
  return selected;
}

function countOutsideQuotes(text: string, delimiter: string) {
  let count = 0;
  let lineCount = 0;
  let lineHasDelimiter = false;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && text[index] === delimiter) {
      count += 1;
      lineHasDelimiter = true;
    } else if (!quoted && text[index] === "\n") {
      if (lineHasDelimiter) lineCount += 1;
      lineHasDelimiter = false;
    }
  }
  if (lineHasDelimiter) lineCount += 1;
  return { count, lineCount };
}

function hasConsistentDelimitedStructure(text: string, delimiter: string) {
  try {
    const rows = parseDelimitedRows(text, delimiter)
      .filter((row) => row.some((cell) => cell.trim().length > 0));
    return rows.length >= 2
      && rows[0].length > 1
      && rows.every((row) => row.length === rows[0].length);
  } catch {
    return false;
  }
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
    /([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*m\s*v\s*(?:\/\s*s|(?:[·*]\s*)?s\s*(?:\^\s*)?-\s*1)/i
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
