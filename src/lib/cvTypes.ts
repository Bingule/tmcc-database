export interface CvSeries {
  label: string;
  scanRate: number;
  points: Array<{ potential: number; current: number }>;
}

export type SweepDirection = 1 | -1;

export interface CvSweepPoint {
  potential: number;
  current: number;
  sourceIndex: number;
}

export interface CvSweepBranch {
  branchIndex: number;
  direction: SweepDirection;
  points: CvSweepPoint[];
  sharesStartWithPrevious: boolean;
  cyclicClosure?: boolean;
}

export interface CvGridBranch {
  branchIndex: number;
  direction: SweepDirection;
  startIndex: number;
  endIndex: number;
}

export interface InterpolatedCvData {
  potentials: number[];
  scanRates: number[];
  currents: number[][];
  branches?: CvGridBranch[];
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
  validPointCount: number;
  sampledPointCount: number;
  coveragePercent: number;
  /** Reconstructed signed currents; null marks a potential without a valid Dunn fit. */
  capacitiveCurrent: Array<number | null>;
  diffusionCurrent: Array<number | null>;
}

export interface DunnAnalysisResult {
  points: DunnPoint[];
  /** Valid summaries only: at least one jointly valid interval and a non-zero total magnitude area. */
  contributions: DunnContribution[];
}

export type CvFitStatus =
  | "valid"
  | "belowRSquaredThreshold"
  | "insufficientData"
  | "zeroCurrentLogUnavailable"
  | "regressionFailed";

export interface CvAnalysisSettings {
  pointInterval: number;
  rSquaredThreshold: number;
}

export interface CvFitRecord<T> {
  sequenceIndex: number;
  branchIndex: number;
  potential: number;
  fit: T | null;
  status: CvFitStatus;
}

export interface CvQualitySummary {
  commonPointCount: number;
  retainedPointCount: number;
  validBCount: number;
  excludedBCount: number;
  unavailableBCount: number;
  validDunnCount: number;
  excludedDunnCount: number;
  unavailableDunnCount: number;
}

export interface CvWorkflowResult {
  series: CvSeries[];
  fullGrid: InterpolatedCvData;
  analysisGrid: InterpolatedCvData;
  bRecords: Array<CvFitRecord<BValuePoint>>;
  dunnRecords: Array<CvFitRecord<DunnPoint>>;
  contributions: DunnContribution[];
  summary: CvQualitySummary;
  settings: CvAnalysisSettings;
}

export type CvAnalysisErrorCode =
  | "noSeries"
  | "noPoints"
  | "invalidScanRate"
  | "invalidPotential"
  | "invalidCurrent"
  | "duplicatePotential"
  | "invalidCycleStructure"
  | "noCommonPotentialRange"
  | "invalidDataShape"
  | "invalidPointInterval"
  | "invalidRSquaredThreshold";

export class CvAnalysisError extends Error {
  readonly code: CvAnalysisErrorCode;

  constructor(code: CvAnalysisErrorCode) {
    super(code);
    this.name = "CvAnalysisError";
    this.code = code;
  }
}
