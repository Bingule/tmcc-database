export interface CvSeries {
  label: string;
  scanRate: number;
  points: Array<{ potential: number; current: number }>;
}

export interface InterpolatedCvData {
  potentials: number[];
  scanRates: number[];
  currents: number[][];
}

export interface BValuePoint {
  potential: number;
  b: number;
  intercept: number;
  rSquared: number;
  pointCount: number;
  fitPoints: Array<{ logScanRate: number; logCurrentMagnitude: number }>;
}

export interface DunnPoint {
  potential: number;
  k1: number;
  k2: number;
  rSquared: number;
  pointCount: number;
}

export interface DunnContribution {
  scanRate: number;
  capacitivePercent: number;
  diffusionPercent: number;
  /** Reconstructed signed currents; null marks a potential without a valid Dunn fit. */
  capacitiveCurrent: Array<number | null>;
  diffusionCurrent: Array<number | null>;
}

export interface DunnAnalysisResult {
  points: DunnPoint[];
  /** Valid summaries only: at least one jointly valid interval and a non-zero total magnitude area. */
  contributions: DunnContribution[];
}

export type CvAnalysisErrorCode =
  | "noSeries"
  | "noPoints"
  | "invalidScanRate"
  | "invalidPotential"
  | "invalidCurrent"
  | "duplicatePotential"
  | "noCommonPotentialRange"
  | "invalidDataShape";

export class CvAnalysisError extends Error {
  readonly code: CvAnalysisErrorCode;

  constructor(code: CvAnalysisErrorCode) {
    super(code);
    this.name = "CvAnalysisError";
    this.code = code;
  }
}
