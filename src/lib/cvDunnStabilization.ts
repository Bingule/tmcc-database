import { makeDunnFractionGrid } from "./cvDunnConfidence";
import {
  CvAnalysisError,
  type DunnConfidenceMode,
  type DunnFitGrid,
  type DunnFractionGrid,
  type DunnFractionPoint,
  type DunnStabilizationDiagnostics,
  type DunnStabilizationResult
} from "./cvTypes";

export type {
  DunnStabilizationDiagnostics,
  DunnStabilizationResult
} from "./cvTypes";

const DIAGNOSTIC_NODE_COUNT = 101;
const MEDIAN_WINDOW_RADIUS = 4;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothStep = (value: number) => value * value * (3 - 2 * value);

export function confidenceBlendForCoverage(coverage: number): number {
  const t = clamp01((0.50 - coverage) / 0.40);
  return 0.85 * smoothStep(t);
}

export function stabilizeDunnFractions(
  fits: DunnFitGrid,
  scanRate: number,
  mode: DunnConfidenceMode,
  threshold: number
): DunnStabilizationResult {
  const thresholdFractions = makeDunnFractionGrid(fits, scanRate, "threshold", threshold);
  const weightedFractions = makeDunnFractionGrid(fits, scanRate, "weighted", threshold);
  const forwardAnchorCoverage = anchorCoverage(fits.forward, threshold);
  const reverseAnchorCoverage = anchorCoverage(fits.reverse, threshold);
  const effectiveAnchorCoverage = effectiveCoverage(forwardAnchorCoverage, reverseAnchorCoverage);
  const lowerMedianRSquared = Math.min(
    medianRSquared(fits.forward),
    medianRSquared(fits.reverse)
  );

  if (!hasFiniteFractionEvidence(thresholdFractions)) {
    throw new CvAnalysisError("reconstructionFailed");
  }

  const confidenceBlend = mode === "weighted" ? 0 : confidenceBlendForCoverage(effectiveAnchorCoverage);
  const fractions = mode === "weighted"
    ? weightedFractions
    : blendGrid(thresholdFractions, weightedFractions, confidenceBlend);
  const rawFractionNoise = robustFractionNoise(fits, weightedFractions);
  const smoothingMultiplier = smoothingMultiplierFor(
    effectiveAnchorCoverage,
    lowerMedianRSquared,
    rawFractionNoise
  );
  const diagnostics = {
    forwardAnchorCoverage,
    reverseAnchorCoverage,
    effectiveAnchorCoverage,
    lowerMedianRSquared,
    rawFractionNoise,
    confidenceBlend,
    smoothingMultiplier
  };

  validatePolicyOutput(fractions, diagnostics);
  return { fractions, diagnostics };
}

function anchorCoverage(records: DunnFitGrid["forward"], threshold: number): number {
  const eligible = records.filter(isEligibleRecord);
  if (eligible.length === 0) return 0;
  return eligible.filter((record) => record.fit!.rSquared >= threshold).length / eligible.length;
}

function isEligibleRecord(record: DunnFitGrid["forward"][number]): boolean {
  return !record.trimmed
    && record.status !== "insufficientData"
    && record.status !== "zeroCurrentLogUnavailable"
    && record.status !== "regressionFailed"
    && record.fit !== null
    && Number.isFinite(record.fit.rSquared);
}

function medianRSquared(records: DunnFitGrid["forward"]): number {
  const values = records
    .filter(isEligibleRecord)
    .map((record) => clamp01(record.fit!.rSquared))
    .sort((left, right) => left - right);
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]!
    : (values[middle - 1]! + values[middle]!) / 2;
}

function effectiveCoverage(forward: number, reverse: number): number {
  return Math.sqrt(forward * reverse);
}

function blendGrid(
  thresholdFractions: DunnFractionGrid,
  weightedFractions: DunnFractionGrid,
  beta: number
): DunnFractionGrid {
  return {
    forward: thresholdFractions.forward.map((point, index) =>
      blendPoint(point, weightedFractions.forward[index]!, beta)),
    reverse: thresholdFractions.reverse.map((point, index) =>
      blendPoint(point, weightedFractions.reverse[index]!, beta))
  };
}

function blendPoint(
  thresholdPoint: DunnFractionPoint,
  weightedPoint: DunnFractionPoint,
  beta: number
): DunnFractionPoint {
  return {
    ...thresholdPoint,
    confidence: (1 - beta) * thresholdPoint.confidence + beta * weightedPoint.confidence
  };
}

function robustFractionNoise(fits: DunnFitGrid, weightedFractions: DunnFractionGrid): number {
  const diagnostic = diagnosticCombination(fits, weightedFractions);
  const rawTrend = linearGapFill(diagnostic);
  const smoothed = centeredRunningMedian(rawTrend, MEDIAN_WINDOW_RADIUS);
  const residuals = rawTrend.map((value, index) => value - smoothed[index]!);
  const medianResidual = median(residuals);
  const mad = median(residuals.map((value) => Math.abs(value - medianResidual)));
  const interquartileRange = percentile(rawTrend, 0.75) - percentile(rawTrend, 0.25);
  return clamp01(1.4826 * mad / Math.max(interquartileRange, 0.10));
}

function diagnosticCombination(fits: DunnFitGrid, fractions: DunnFractionGrid): Array<number | null> {
  const forward = resampleBranch(fits.forward, fractions.forward);
  const reverse = resampleBranch(fits.reverse, fractions.reverse);
  return forward.map((forwardPoint, index) => {
    const reversePoint = reverse[index]!;
    const points = [forwardPoint, reversePoint].filter(
      (point): point is { fraction: number; confidence: number } => point !== null
    );
    const totalConfidence = points.reduce((sum, point) => sum + point.confidence, 0);
    if (totalConfidence <= 0) return null;
    return points.reduce((sum, point) => sum + point.fraction * point.confidence, 0) / totalConfidence;
  });
}

function resampleBranch(
  records: DunnFitGrid["forward"],
  points: DunnFractionPoint[]
): Array<{ fraction: number; confidence: number } | null> {
  if (records.length !== points.length) throw new CvAnalysisError("reconstructionFailed");
  if (points.length === 0) return Array.from({ length: DIAGNOSTIC_NODE_COUNT }, () => null);
  const positions = normalizedPotentialPositions(records);
  const evidence = positions.flatMap((position, index) => {
    const point = evidenceAt(points[index]!);
    return point === null ? [] : [{ position, ...point }];
  });
  if (evidence.length === 0) {
    return Array.from({ length: DIAGNOSTIC_NODE_COUNT }, () => null);
  }
  if (evidence.length === 1) {
    const [{ fraction, confidence }] = evidence;
    return Array.from({ length: DIAGNOSTIC_NODE_COUNT }, () => ({ fraction, confidence }));
  }

  return Array.from({ length: DIAGNOSTIC_NODE_COUNT }, (_value, nodeIndex) => {
    const position = nodeIndex / (DIAGNOSTIC_NODE_COUNT - 1);
    const first = evidence[0]!;
    const last = evidence.at(-1)!;
    if (position <= first.position) {
      return { fraction: first.fraction, confidence: first.confidence };
    }
    if (position >= last.position) {
      return { fraction: last.fraction, confidence: last.confidence };
    }
    const rightIndex = evidence.findIndex((point) => point.position >= position);
    const left = evidence[rightIndex - 1]!;
    const right = evidence[rightIndex]!;
    const blend = (position - left.position) / (right.position - left.position);
    return {
      fraction: left.fraction + blend * (right.fraction - left.fraction),
      confidence: left.confidence + blend * (right.confidence - left.confidence)
    };
  });
}

function normalizedPotentialPositions(records: DunnFitGrid["forward"]): number[] {
  if (records.length === 1) {
    if (!Number.isFinite(records[0]!.potential)) throw new CvAnalysisError("reconstructionFailed");
    return [0];
  }
  const minimum = records[0]!.potential;
  const maximum = records.at(-1)!.potential;
  const span = maximum - minimum;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || !Number.isFinite(span) || span <= 0) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  const normalized = records.map((record) => (record.potential - minimum) / span);
  if (normalized.some((value) => !Number.isFinite(value))
    || normalized.some((value, index) => index > 0 && value <= normalized[index - 1]!)) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  return normalized;
}

function evidenceAt(point: DunnFractionPoint): { fraction: number; confidence: number } | null {
  if (point.fraction === null || !Number.isFinite(point.fraction)
    || !Number.isFinite(point.confidence) || point.confidence <= 0) {
    return null;
  }
  return { fraction: point.fraction, confidence: point.confidence };
}

function linearGapFill(values: Array<number | null>): number[] {
  const anchorIndices = values
    .map((value, index) => value !== null && Number.isFinite(value) ? index : -1)
    .filter((index) => index >= 0);
  if (anchorIndices.length === 0) throw new CvAnalysisError("reconstructionFailed");

  const result = new Array<number>(values.length);
  let previousAnchor = anchorIndices[0]!;
  result.fill(values[previousAnchor]!, 0, previousAnchor + 1);
  for (const nextAnchor of anchorIndices.slice(1)) {
    const left = values[previousAnchor]!;
    const right = values[nextAnchor]!;
    const width = nextAnchor - previousAnchor;
    for (let index = previousAnchor + 1; index < nextAnchor; index += 1) {
      result[index] = left + (index - previousAnchor) * (right - left) / width;
    }
    result[nextAnchor] = right;
    previousAnchor = nextAnchor;
  }
  result.fill(values[previousAnchor]!, previousAnchor);
  return result;
}

function centeredRunningMedian(values: number[], radius: number): number[] {
  return values.map((_value, index) => median(
    values.slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1))
  ));
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentileValue;
  const left = Math.floor(position);
  const right = Math.ceil(position);
  return sorted[left]! + (position - left) * (sorted[right]! - sorted[left]!);
}

function smoothingMultiplierFor(coverage: number, lowerMedianRSquared: number, rawFractionNoise: number): number {
  const coverageDeficiency = clamp01((0.50 - coverage) / 0.50);
  const rSquaredDeficiency = clamp01((0.95 - lowerMedianRSquared) / 0.45);
  return Math.min(30, Math.max(1,
    1
    + 12 * coverageDeficiency ** 2
    + 6 * rSquaredDeficiency ** 2
    + 10 * rawFractionNoise ** 2
  ));
}

function hasFiniteFractionEvidence(fractions: DunnFractionGrid): boolean {
  return [...fractions.forward, ...fractions.reverse]
    .some((point) => point.fraction !== null && Number.isFinite(point.fraction));
}

function validatePolicyOutput(
  fractions: DunnFractionGrid,
  diagnostics: DunnStabilizationDiagnostics
): void {
  const scalarValues = Object.values(diagnostics);
  if (scalarValues.some((value) => !Number.isFinite(value))
    || diagnostics.forwardAnchorCoverage < 0
    || diagnostics.reverseAnchorCoverage < 0
    || diagnostics.effectiveAnchorCoverage < 0
    || diagnostics.lowerMedianRSquared < 0
    || diagnostics.rawFractionNoise < 0
    || diagnostics.confidenceBlend < 0
    || diagnostics.smoothingMultiplier < 1
    || diagnostics.smoothingMultiplier > 30
    || [...fractions.forward, ...fractions.reverse].some((point) =>
      !Number.isFinite(point.confidence)
      || point.confidence < 0
      || (point.fraction !== null && !Number.isFinite(point.fraction)))) {
    throw new CvAnalysisError("reconstructionFailed");
  }
}
