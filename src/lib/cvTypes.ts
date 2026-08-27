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

export type CvBranchKind = "forward" | "reverse";

export interface NormalizedCvBranch {
  kind: CvBranchKind;
  direction: 1 | -1;
  points: CvSweepPoint[];
}

export interface NormalizedCvCycle {
  originalPoints: CvSeries["points"];
  selectedStartIndex: number;
  selectedEndIndex: number;
  ignoredPointCount: number;
  nativePotentialInterval: number;
  forward: NormalizedCvBranch;
  reverse: NormalizedCvBranch;
  turningPotentials: number[];
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

export type PotentialIntervalSetting =
  | { mode: "auto" }
  | { mode: "manual"; millivolts: number };

export interface CvAlignedBranchGrid {
  potentials: number[];
  scanRates: number[];
  forwardCurrents: number[][];
  reverseCurrents: number[][];
  commonMinimum: number;
  commonMaximum: number;
  nativePotentialInterval: number;
  resolvedPotentialInterval: number;
  cycles: NormalizedCvCycle[];
}

export type TurningPointTrimSetting =
  | { mode: "auto" }
  | { mode: "manual"; millivolts: number };

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

export interface DunnDiagnostics {
  mode: DunnConfidenceMode;
  threshold: number;
  resolvedPotentialInterval: number;
  resolvedTurningPointTrim: number;
  commonMinimum: number;
  commonMaximum: number;
  medianForwardRSquared: number | null;
  medianReverseRSquared: number | null;
  forwardAboveThresholdPercent: number;
  reverseAboveThresholdPercent: number;
  lowFitQuality: boolean;
  scanRateWarning: boolean;
  qualityPassed: boolean;
  forwardAnchorCoverage: number;
  reverseAnchorCoverage: number;
  effectiveAnchorCoverage: number;
  lowerMedianRSquared: number;
  rawFractionNoise: number;
  confidenceBlend: number;
  smoothingMultiplier: number;
  baseLambda: number;
  effectiveLambda: number;
}

export interface DunnContribution {
  scanRate: number;
  potentialGrid: number[];
  g: number[];
  originalForward: number[];
  originalReverse: number[];
  capacitiveForward: number[];
  capacitiveReverse: number[];
  diffusionForward: number[];
  diffusionReverse: number[];
  plotPath: Array<{ potential: number; current: number; branch: CvBranchKind }>;
  capacitivePercent: number;
  diffusionPercent: number;
  diagnostics: DunnDiagnostics;
}

export interface LegacyDunnContribution {
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
  contributions: LegacyDunnContribution[];
}

export type CvFitStatus =
  | "valid"
  | "belowRSquaredThreshold"
  | "insufficientData"
  | "zeroCurrentLogUnavailable"
  | "regressionFailed";

export type DunnFitStatus = CvFitStatus | "trimmed";

export interface DunnBranchFitRecord {
  branch: CvBranchKind;
  potential: number;
  fit: DunnPoint | null;
  status: DunnFitStatus;
  trimmed: boolean;
}

export interface DunnFitGrid {
  forward: DunnBranchFitRecord[];
  reverse: DunnBranchFitRecord[];
  resolvedTurningPointTrim: number;
}

export type DunnConfidenceMode = "threshold" | "weighted";

export interface DunnFractionPoint {
  fraction: number | null;
  confidence: number;
  rSquared: number | null;
  trustedAnchor: boolean;
}

export interface DunnFractionGrid {
  forward: DunnFractionPoint[];
  reverse: DunnFractionPoint[];
}

export interface DunnStabilizationDiagnostics {
  forwardAnchorCoverage: number;
  reverseAnchorCoverage: number;
  effectiveAnchorCoverage: number;
  lowerMedianRSquared: number;
  rawFractionNoise: number;
  confidenceBlend: number;
  smoothingMultiplier: number;
}

export interface DunnStabilizationResult {
  fractions: DunnFractionGrid;
  diagnostics: DunnStabilizationDiagnostics;
}

export interface DunnRegularizationDiagnostics {
  baseLambda: number;
  lambda: number;
  smoothingMultiplier: number;
  iterations: number;
  converged: boolean;
  optimalityResidual: number;
  fidelity: number;
  roughness: number;
}

export interface DunnSharedFractionResult {
  g: number[];
  diagnostics: DunnRegularizationDiagnostics;
}

export interface DunnContributionInput {
  alignedGrid: CvAlignedBranchGrid;
  dunnRecords: DunnFitGrid;
  optimized: DunnSharedFractionResult;
  fractions: DunnFractionGrid;
  stabilization: DunnStabilizationDiagnostics;
  scanRate: number;
  seriesIndex: number;
  mode: DunnConfidenceMode;
  threshold: number;
  resolvedTurningPointTrim: number;
}

export interface CvAnalysisSettings {
  potentialInterval: PotentialIntervalSetting;
  rSquaredThreshold: number;
  dunnConfidenceMode: DunnConfidenceMode;
  turningPointTrim: TurningPointTrimSetting;
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
  alignedGrid: CvAlignedBranchGrid;
  analysisGrid: InterpolatedCvData;
  bRecords: Array<CvFitRecord<BValuePoint>>;
  dunnRecords: DunnFitGrid;
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
  | "invalidPotentialInterval"
  | "invalidTurningPointTrim"
  | "invalidRSquaredThreshold"
  | "reconstructionFailed";

export class CvAnalysisError extends Error {
  readonly code: CvAnalysisErrorCode;

  constructor(code: CvAnalysisErrorCode) {
    super(code);
    this.name = "CvAnalysisError";
    this.code = code;
  }
}
