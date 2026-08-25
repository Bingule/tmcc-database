export type CvDataLayout = "sharedPotential" | "pairedPotentialCurrent";
export type CvHeaderMode = "header" | "data";

export interface CvImportOptions {
  layout: CvDataLayout;
  headerMode: CvHeaderMode;
}

export interface CvColumnPair {
  potentialColumn: number;
  currentColumn: number;
  potentialHeader: string;
  currentHeader: string;
}

export interface ParsedCvTable {
  layout: CvDataLayout;
  headerMode: CvHeaderMode;
  headers: string[];
  rows: Array<Array<string | number | null>>;
  pairs: CvColumnPair[];
}

export const MIN_SCAN_RATE_COUNT = 3;
export const MAX_SCAN_RATE_COUNT = 20;

export type CvParseErrorCode =
  | "emptyFile"
  | "malformedFile"
  | "potentialColumnMissing"
  | "currentColumnsMissing"
  | "formatRequired"
  | "oddPairColumnCount"
  | "missingScanRate"
  | "duplicateScanRate"
  | "invalidScanRate"
  | "insufficientSeries"
  | "tooManySeries"
  | "scanRateCountMismatch"
  | "invalidCycleStructure"
  | "resourceLimitExceeded";

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

const ASCII_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function parseScanRateList(value: string): number[] {
  const tokens = value.trim().split(/[;,\s]+/u).filter(Boolean);
  const rates = tokens.map((token) => {
    if (!ASCII_NUMBER.test(token)) throw new CvParseError("invalidScanRate", { token });
    const rate = Number(token);
    if (!Number.isFinite(rate) || rate <= 0) throw new CvParseError("invalidScanRate", { token });
    return rate;
  });

  if (rates.length < MIN_SCAN_RATE_COUNT) {
    throw new CvParseError("insufficientSeries", { count: rates.length, minimum: MIN_SCAN_RATE_COUNT });
  }
  if (rates.length > MAX_SCAN_RATE_COUNT) {
    throw new CvParseError("tooManySeries", { count: rates.length, maximum: MAX_SCAN_RATE_COUNT });
  }

  const seen = new Set<number>();
  for (const rate of rates) {
    if (seen.has(rate)) throw new CvParseError("duplicateScanRate", { scanRate: rate });
    seen.add(rate);
  }
  return rates;
}

export function makeColumnPairs(headers: string[], options: CvImportOptions): CvColumnPair[] {
  if (options.layout === "sharedPotential") {
    if (headers.length === 0) throw new CvParseError("potentialColumnMissing");
    if (headers.length === 1) throw new CvParseError("currentColumnsMissing");
    return headers.slice(1).map((currentHeader, currentColumn) => ({
      potentialColumn: 0,
      currentColumn: currentColumn + 1,
      potentialHeader: headers[0],
      currentHeader
    }));
  }

  if (headers.length % 2 !== 0) {
    throw new CvParseError("oddPairColumnCount", { columnCount: headers.length });
  }
  if (headers.length === 0) throw new CvParseError("potentialColumnMissing");
  return Array.from({ length: headers.length / 2 }, (_, pairIndex) => {
    const potentialColumn = pairIndex * 2;
    const currentColumn = potentialColumn + 1;
    return {
      potentialColumn,
      currentColumn,
      potentialHeader: headers[potentialColumn],
      currentHeader: headers[currentColumn]
    };
  });
}
