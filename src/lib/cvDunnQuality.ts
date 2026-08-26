import { pchipInterpolate } from "./cvInterpolation";
import {
  CvAnalysisError,
  type CvBranchKind,
  type DunnBranchFitRecord,
  type DunnContribution,
  type DunnContributionInput,
  type DunnDiagnostics,
  type NormalizedCvCycle
} from "./cvTypes";

export type {
  DunnContribution,
  DunnContributionInput,
  DunnDiagnostics
} from "./cvTypes";

const RECONSTRUCTION_TOLERANCE_SCALE = 1e-10;

export function reconstructBranchCurrents(
  original: number[],
  g: number[]
): { capacitive: number[]; diffusion: number[] } {
  if (original.length !== g.length) throw new CvAnalysisError("invalidDataShape");

  const capacitive = original.map((current, index) => {
    const fraction = g[index]!;
    validateOriginalAndFraction(current, fraction);
    return cleanZero(fraction * current);
  });
  const diffusion = original.map((current, index) => cleanZero(current - capacitive[index]!));

  for (let index = 0; index < original.length; index += 1) {
    validateReconstructedPoint(original[index]!, capacitive[index]!, diffusion[index]!);
  }
  return { capacitive, diffusion };
}

export function integrateMagnitude(potentials: number[], currents: number[]): number {
  if (potentials.length !== currents.length) throw new CvAnalysisError("invalidDataShape");
  if (potentials.some((potential) => !Number.isFinite(potential))
    || currents.some((current) => !Number.isFinite(current))) {
    throw new CvAnalysisError("invalidDataShape");
  }

  let area = 0;
  for (let index = 0; index < potentials.length - 1; index += 1) {
    const width = potentials[index + 1]! - potentials[index]!;
    if (!Number.isFinite(width) || width < 0) throw new CvAnalysisError("invalidDataShape");
    area += width * (Math.abs(currents[index]!) + Math.abs(currents[index + 1]!)) / 2;
  }
  return area;
}

export function isLowFitQuality(
  forwardRSquared: number[],
  reverseRSquared: number[],
  threshold: number
): boolean {
  validateThreshold(threshold);
  return branchAboveThresholdFraction(forwardRSquared, threshold) < 0.5
    || branchAboveThresholdFraction(reverseRSquared, threshold) < 0.5;
}

export function reconstructDunnContribution(input: DunnContributionInput): DunnContribution {
  validateContributionInput(input);

  const { alignedGrid, optimized, seriesIndex } = input;
  const potentialGrid = [...alignedGrid.potentials];
  const g = [...optimized.g];
  const originalForward = [...alignedGrid.forwardCurrents[seriesIndex]!];
  const originalReverse = [...alignedGrid.reverseCurrents[seriesIndex]!];
  const forward = reconstructBranchCurrents(originalForward, g);
  const reverse = reconstructBranchCurrents(originalReverse, g);
  const totalArea = integrateMagnitude(potentialGrid, originalForward)
    + integrateMagnitude(potentialGrid, originalReverse);
  const capacitiveArea = integrateMagnitude(potentialGrid, forward.capacitive)
    + integrateMagnitude(potentialGrid, reverse.capacitive);
  const diffusionArea = integrateMagnitude(potentialGrid, forward.diffusion)
    + integrateMagnitude(potentialGrid, reverse.diffusion);

  if (!Number.isFinite(totalArea) || totalArea <= 0) throw new CvAnalysisError("reconstructionFailed");

  const contribution: DunnContribution = {
    scanRate: input.scanRate,
    potentialGrid,
    g,
    originalForward,
    originalReverse,
    capacitiveForward: forward.capacitive,
    capacitiveReverse: reverse.capacitive,
    diffusionForward: forward.diffusion,
    diffusionReverse: reverse.diffusion,
    plotPath: reconstructOriginalOrderPath(input),
    capacitivePercent: 100 * capacitiveArea / totalArea,
    diffusionPercent: 100 * diffusionArea / totalArea,
    diagnostics: makeDiagnostics(input)
  };

  validateDunnContribution(contribution);
  return contribution;
}

export function validateDunnContribution(contribution: DunnContribution): void {
  if (!Number.isFinite(contribution.scanRate) || contribution.scanRate <= 0) {
    throw new CvAnalysisError("invalidScanRate");
  }
  const {
    potentialGrid,
    g,
    originalForward,
    originalReverse,
    capacitiveForward,
    capacitiveReverse,
    diffusionForward,
    diffusionReverse,
    plotPath,
    diagnostics
  } = contribution;
  validateAlignedArrays(potentialGrid, g, originalForward, originalReverse, capacitiveForward, capacitiveReverse, diffusionForward, diffusionReverse);
  originalForward.forEach((current, index) => {
    validateReconstructedPoint(current, capacitiveForward[index]!, diffusionForward[index]!);
  });
  originalReverse.forEach((current, index) => {
    validateReconstructedPoint(current, capacitiveReverse[index]!, diffusionReverse[index]!);
  });
  validatePlotPath(plotPath);
  validateDiagnostics(diagnostics);
  if (!Number.isFinite(contribution.capacitivePercent)
    || !Number.isFinite(contribution.diffusionPercent)
    || Math.abs(contribution.capacitivePercent + contribution.diffusionPercent - 100) > 1e-8) {
    throw new CvAnalysisError("reconstructionFailed");
  }
}

function validateContributionInput(input: DunnContributionInput) {
  const { alignedGrid, optimized, seriesIndex, scanRate, threshold } = input;
  validateThreshold(threshold);
  if (!Number.isInteger(seriesIndex)
    || seriesIndex < 0
    || seriesIndex >= alignedGrid.scanRates.length
    || !Number.isFinite(scanRate)
    || scanRate <= 0) {
    throw new CvAnalysisError("invalidDataShape");
  }
  const pointCount = alignedGrid.potentials.length;
  if (pointCount === 0
    || optimized.g.length !== pointCount
    || input.dunnRecords.forward.length !== pointCount
    || input.dunnRecords.reverse.length !== pointCount
    || input.fractions.forward.length !== pointCount
    || input.fractions.reverse.length !== pointCount
    || alignedGrid.forwardCurrents.length !== alignedGrid.scanRates.length
    || alignedGrid.reverseCurrents.length !== alignedGrid.scanRates.length
    || alignedGrid.cycles.length !== alignedGrid.scanRates.length
    || !alignedGrid.forwardCurrents[seriesIndex]
    || !alignedGrid.reverseCurrents[seriesIndex]) {
    throw new CvAnalysisError("invalidDataShape");
  }
  validateAlignedArrays(alignedGrid.potentials, optimized.g, alignedGrid.forwardCurrents[seriesIndex]!, alignedGrid.reverseCurrents[seriesIndex]!);
  if (!Number.isFinite(alignedGrid.commonMinimum)
    || !Number.isFinite(alignedGrid.commonMaximum)
    || alignedGrid.commonMinimum > alignedGrid.commonMaximum
    || !Number.isFinite(alignedGrid.resolvedPotentialInterval)
    || alignedGrid.resolvedPotentialInterval <= 0
    || !Number.isFinite(input.resolvedTurningPointTrim)
    || input.resolvedTurningPointTrim < 0) {
    throw new CvAnalysisError("invalidDataShape");
  }
}

function validateAlignedArrays(reference: number[], ...arrays: number[][]) {
  for (const array of arrays) {
    if (array.length !== reference.length || array.some((value) => !Number.isFinite(value))) {
      throw new CvAnalysisError("invalidDataShape");
    }
  }
  if (reference.some((value) => !Number.isFinite(value))) throw new CvAnalysisError("invalidDataShape");
}

function reconstructOriginalOrderPath(input: DunnContributionInput): DunnContribution["plotPath"] {
  const cycle = input.alignedGrid.cycles[input.seriesIndex]!;
  const branchBySourceIndex = branchOwnershipBySourceIndex(cycle);

  return cycle.originalPoints.map((point, sourceIndex) => {
    const branch = branchBySourceIndex.get(sourceIndex);
    if (branch === undefined) throw new CvAnalysisError("invalidDataShape");
    const fraction = evaluateSharedFraction(input.alignedGrid.potentials, input.optimized.g, point.potential);
    validateOriginalAndFraction(point.current, fraction);
    return {
      potential: point.potential,
      current: cleanZero(fraction * point.current),
      branch
    };
  });
}

function branchOwnershipBySourceIndex(cycle: NormalizedCvCycle): Map<number, CvBranchKind> {
  const normalizedBranchBySourceIndex = new Map<number, CvBranchKind>();
  for (const point of cycle.forward.points) normalizedBranchBySourceIndex.set(point.sourceIndex, "forward");
  for (const point of cycle.reverse.points) {
    if (!normalizedBranchBySourceIndex.has(point.sourceIndex)) {
      normalizedBranchBySourceIndex.set(point.sourceIndex, "reverse");
    }
  }

  const branchBySourceIndex = new Map<number, CvBranchKind>();
  for (let sourceIndex = 0; sourceIndex < cycle.originalPoints.length; sourceIndex += 1) {
    const branch = inferBranchFromOriginalPath(cycle, sourceIndex)
      ?? normalizedBranchBySourceIndex.get(sourceIndex);
    if (branch === undefined) throw new CvAnalysisError("invalidDataShape");
    branchBySourceIndex.set(sourceIndex, branch);
  }
  return branchBySourceIndex;
}

function inferBranchFromOriginalPath(cycle: NormalizedCvCycle, sourceIndex: number): CvBranchKind | null {
  const points = cycle.originalPoints;
  const previous = points[sourceIndex - 1];
  const current = points[sourceIndex];
  const next = points[sourceIndex + 1];
  if (current === undefined) throw new CvAnalysisError("invalidDataShape");

  if (previous !== undefined) {
    const branch = branchFromDelta(current.potential - previous.potential);
    if (branch) return branch;
  }
  if (next !== undefined) {
    const branch = branchFromDelta(next.potential - current.potential);
    if (branch) return branch;
  }
  return null;
}

function branchFromDelta(delta: number): CvBranchKind | null {
  if (!Number.isFinite(delta)) throw new CvAnalysisError("invalidPotential");
  if (delta > 0) return "forward";
  if (delta < 0) return "reverse";
  return null;
}

function validatePlotPath(plotPath: DunnContribution["plotPath"]) {
  if (plotPath.length < 4) throw new CvAnalysisError("invalidDataShape");

  const runs: Array<{ branch: CvBranchKind; potentials: number[] }> = [];
  for (const point of plotPath) {
    if (!Number.isFinite(point.potential)
      || !Number.isFinite(point.current)
      || (point.branch !== "forward" && point.branch !== "reverse")) {
      throw new CvAnalysisError("invalidDataShape");
    }
    const currentRun = runs.at(-1);
    if (currentRun?.branch === point.branch) {
      currentRun.potentials.push(point.potential);
    } else {
      runs.push({ branch: point.branch, potentials: [point.potential] });
    }
  }

  if (runs.length < 2 || runs.length > 3) throw new CvAnalysisError("invalidDataShape");
  for (const run of runs) {
    if (run.potentials.length < 2) throw new CvAnalysisError("invalidDataShape");
    for (let index = 1; index < run.potentials.length; index += 1) {
      const delta = run.potentials[index]! - run.potentials[index - 1]!;
      if (run.branch === "forward" && delta < 0) throw new CvAnalysisError("invalidDataShape");
      if (run.branch === "reverse" && delta > 0) throw new CvAnalysisError("invalidDataShape");
    }
  }
}

function validateDiagnostics(diagnostics: DunnDiagnostics) {
  const finiteValues = [
    diagnostics.threshold,
    diagnostics.resolvedPotentialInterval,
    diagnostics.resolvedTurningPointTrim,
    diagnostics.commonMinimum,
    diagnostics.commonMaximum,
    diagnostics.forwardAboveThresholdPercent,
    diagnostics.reverseAboveThresholdPercent
  ];
  if (finiteValues.some((value) => !Number.isFinite(value))
    || (diagnostics.medianForwardRSquared !== null && !Number.isFinite(diagnostics.medianForwardRSquared))
    || (diagnostics.medianReverseRSquared !== null && !Number.isFinite(diagnostics.medianReverseRSquared))
    || (diagnostics.mode !== "threshold" && diagnostics.mode !== "weighted")) {
    throw new CvAnalysisError("invalidDataShape");
  }
}

function evaluateSharedFraction(potentials: number[], g: number[], potential: number): number {
  if (!Number.isFinite(potential)) throw new CvAnalysisError("invalidPotential");
  if (potentials.length === 1) return validateFraction(g[0]!);
  if (potential <= potentials[0]!) return validateFraction(g[0]!);
  if (potential >= potentials.at(-1)!) return validateFraction(g.at(-1)!);
  return validateFraction(pchipInterpolate(potentials, g, [potential])[0]!);
}

function makeDiagnostics(input: DunnContributionInput): DunnDiagnostics {
  const forwardRSquared = finiteRSquared(input.dunnRecords.forward);
  const reverseRSquared = finiteRSquared(input.dunnRecords.reverse);
  const lowFitQuality = isLowFitQuality(forwardRSquared, reverseRSquared, input.threshold);
  const scanRateWarning = new Set(input.alignedGrid.scanRates).size === 3;
  return {
    mode: input.mode,
    threshold: input.threshold,
    resolvedPotentialInterval: input.alignedGrid.resolvedPotentialInterval,
    resolvedTurningPointTrim: input.resolvedTurningPointTrim,
    commonMinimum: input.alignedGrid.commonMinimum,
    commonMaximum: input.alignedGrid.commonMaximum,
    medianForwardRSquared: medianOrNull(forwardRSquared),
    medianReverseRSquared: medianOrNull(reverseRSquared),
    forwardAboveThresholdPercent: 100 * branchAboveThresholdFraction(forwardRSquared, input.threshold),
    reverseAboveThresholdPercent: 100 * branchAboveThresholdFraction(reverseRSquared, input.threshold),
    lowFitQuality,
    scanRateWarning,
    qualityPassed: !lowFitQuality && !scanRateWarning
  };
}

function finiteRSquared(records: DunnBranchFitRecord[]): number[] {
  return records
    .map((record) => record.fit?.rSquared ?? Number.NaN)
    .filter((value) => Number.isFinite(value));
}

function branchAboveThresholdFraction(values: number[], threshold: number): number {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return 0;
  return finite.filter((value) => value >= threshold).length / finite.length;
}

function medianOrNull(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (finite.length === 0) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 === 1 ? finite[middle]! : (finite[middle - 1]! + finite[middle]!) / 2;
}

function validateOriginalAndFraction(current: number, fraction: number) {
  if (!Number.isFinite(current)) throw new CvAnalysisError("invalidCurrent");
  validateFraction(fraction);
}

function validateFraction(fraction: number): number {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  return fraction;
}

function validateThreshold(threshold: number) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new CvAnalysisError("invalidDataShape");
  }
}

function validateReconstructedPoint(original: number, capacitive: number, diffusion: number) {
  if (!Number.isFinite(original) || !Number.isFinite(capacitive) || !Number.isFinite(diffusion)) {
    throw new CvAnalysisError("invalidDataShape");
  }
  const tolerance = RECONSTRUCTION_TOLERANCE_SCALE * Math.max(1, Math.abs(original));
  if (Math.abs(capacitive + diffusion - original) > tolerance
    || Math.abs(capacitive) - Math.abs(original) > tolerance
    || Math.abs(diffusion) - Math.abs(original) > tolerance
    || violatesSign(original, capacitive, tolerance)
    || violatesSign(original, diffusion, tolerance)) {
    throw new CvAnalysisError("reconstructionFailed");
  }
}

function violatesSign(original: number, component: number, tolerance: number): boolean {
  if (Math.abs(original) <= tolerance) return Math.abs(component) > tolerance;
  return original > 0 ? component < -tolerance : component > tolerance;
}

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
