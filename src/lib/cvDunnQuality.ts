import { pchipInterpolate } from "./cvInterpolation";
import {
  CvAnalysisError,
  type CvBranchKind,
  type DunnBranchFitRecord,
  type DunnContribution,
  type DunnContributionInput,
  type DunnDiagnostics,
  type DunnOrderedRecord,
  type EnvelopeProjection,
  type EnvelopeViolationDiagnostics,
  type NormalizedCvCycle
} from "./cvTypes";

export type {
  DunnContribution,
  DunnContributionInput,
  DunnDiagnostics
} from "./cvTypes";

const RECONSTRUCTION_TOLERANCE_SCALE = 1e-10;

export interface BranchOvershootDiagnostics {
  maximumPositiveOvershoot: number;
  maximumNegativeOvershoot: number;
  maximumAbsoluteOvershoot: number;
  worstIndex: number | null;
}

export function projectCapacitiveToEnvelope(
  originalCurrent: number,
  oppositeCurrent: number,
  targetCurrent: number
): EnvelopeProjection {
  if (![originalCurrent, oppositeCurrent, targetCurrent].every(Number.isFinite)) {
    throw new CvAnalysisError("invalidDataShape");
  }
  const envelopeLower = Math.min(originalCurrent, oppositeCurrent);
  const envelopeUpper = Math.max(originalCurrent, oppositeCurrent);
  const signedLower = Math.min(0, originalCurrent);
  const signedUpper = Math.max(0, originalCurrent);
  const feasibleLower = Math.max(envelopeLower, signedLower);
  const feasibleUpper = Math.min(envelopeUpper, signedUpper);
  if (feasibleLower > feasibleUpper) throw new CvAnalysisError("reconstructionFailed");
  const constrainedCurrent = cleanZero(Math.min(feasibleUpper, Math.max(feasibleLower, targetCurrent)));
  return {
    envelopeLower,
    envelopeUpper,
    feasibleLower,
    feasibleUpper,
    targetCurrent,
    constrainedCurrent,
    correctionMagnitude: Math.abs(constrainedCurrent - targetCurrent),
    effectiveFraction: originalCurrent === 0 ? 0 : constrainedCurrent / originalCurrent
  };
}

export function measureEnvelopeViolation(
  records: Array<Pick<DunnOrderedRecord, "envelopeLower" | "envelopeUpper" | "capacitiveCurrent">>
): EnvelopeViolationDiagnostics {
  return records.reduce<EnvelopeViolationDiagnostics>((result, record, index) => {
    const upper = Math.max(0, record.capacitiveCurrent - record.envelopeUpper);
    const lower = Math.max(0, record.envelopeLower - record.capacitiveCurrent);
    const absolute = Math.max(upper, lower);
    return {
      maximumUpperViolation: Math.max(result.maximumUpperViolation, upper),
      maximumLowerViolation: Math.max(result.maximumLowerViolation, lower),
      maximumAbsoluteViolation: Math.max(result.maximumAbsoluteViolation, absolute),
      worstIndex: absolute > result.maximumAbsoluteViolation ? index : result.worstIndex
    };
  }, {
    maximumUpperViolation: 0,
    maximumLowerViolation: 0,
    maximumAbsoluteViolation: 0,
    worstIndex: null
  });
}

export function containCapacitiveCurrent(original: number, capacitive: number): number {
  if (!Number.isFinite(original) || !Number.isFinite(capacitive)) {
    throw new CvAnalysisError("invalidDataShape");
  }
  if (original >= 0) return cleanZero(Math.min(original, Math.max(0, capacitive)));
  return cleanZero(Math.max(original, Math.min(0, capacitive)));
}

export function measureBranchOvershoot(
  original: number[],
  capacitive: number[]
): BranchOvershootDiagnostics {
  if (original.length !== capacitive.length) throw new CvAnalysisError("invalidDataShape");
  let maximumPositiveOvershoot = 0;
  let maximumNegativeOvershoot = 0;
  let maximumAbsoluteOvershoot = 0;
  let worstIndex: number | null = null;

  for (let index = 0; index < original.length; index += 1) {
    const raw = original[index]!;
    const cap = capacitive[index]!;
    if (!Number.isFinite(raw) || !Number.isFinite(cap)) throw new CvAnalysisError("invalidDataShape");
    const positiveOvershoot = Math.max(0, cap - Math.max(0, raw));
    const negativeOvershoot = Math.max(0, Math.min(0, raw) - cap);
    const absoluteOvershoot = Math.max(positiveOvershoot, negativeOvershoot);
    maximumPositiveOvershoot = Math.max(maximumPositiveOvershoot, positiveOvershoot);
    maximumNegativeOvershoot = Math.max(maximumNegativeOvershoot, negativeOvershoot);
    if (absoluteOvershoot > maximumAbsoluteOvershoot) {
      maximumAbsoluteOvershoot = absoluteOvershoot;
      worstIndex = index;
    }
  }

  return { maximumPositiveOvershoot, maximumNegativeOvershoot, maximumAbsoluteOvershoot, worstIndex };
}

export function reconstructBranchCurrents(
  original: number[],
  g: number[]
): { capacitive: number[]; diffusion: number[] } {
  if (original.length !== g.length) throw new CvAnalysisError("invalidDataShape");

  const capacitive = original.map((current, index) => {
    const fraction = g[index]!;
    validateOriginalAndFraction(current, fraction);
    return containCapacitiveCurrent(current, fraction * current);
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

export function integrateOrderedMagnitude(
  records: DunnOrderedRecord[],
  field: "originalCurrent" | "capacitiveCurrent" | "diffusionCurrent"
): number {
  let area = 0;
  for (let index = 1; index < records.length; index += 1) {
    const left = records[index - 1]!;
    const right = records[index]!;
    if (left.branch !== right.branch) continue;
    const width = Math.abs(right.potential - left.potential);
    if (!Number.isFinite(width) || !Number.isFinite(left[field]) || !Number.isFinite(right[field])) {
      throw new CvAnalysisError("invalidDataShape");
    }
    area += width * (Math.abs(left[field]) + Math.abs(right[field])) / 2;
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

  const { alignedGrid, refined, seriesIndex } = input;
  const potentialGrid = [...alignedGrid.potentials];
  const g = [...refined.g];
  const originalForward = [...alignedGrid.forwardCurrents[seriesIndex]!];
  const originalReverse = [...alignedGrid.reverseCurrents[seriesIndex]!];
  const forward = reconstructBranchCurrents(originalForward, g);
  const reverse = reconstructBranchCurrents(originalReverse, g);
  const plotPath = reconstructOriginalOrderPath(input);
  const overshoot = mergeOvershootDiagnostics([
    measureBranchOvershoot(originalForward, forward.capacitive),
    measureBranchOvershoot(originalReverse, reverse.capacitive),
    measureBranchOvershoot(
      plotPath.map((point) => point.originalCurrent),
      plotPath.map((point) => point.capacitiveCurrent)
    )
  ]);
  const totalArea = integrateOrderedMagnitude(plotPath, "originalCurrent");
  const capacitiveArea = integrateOrderedMagnitude(plotPath, "capacitiveCurrent");
  const diffusionArea = integrateOrderedMagnitude(plotPath, "diffusionCurrent");

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
    plotPath,
    capacitivePercent: 100 * capacitiveArea / totalArea,
    diffusionPercent: 100 * diffusionArea / totalArea,
    diagnostics: makeDiagnostics(input, overshoot, plotPath)
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
  const maximumCurrentMagnitude = Math.max(
    1,
    ...originalForward.map(Math.abs),
    ...originalReverse.map(Math.abs),
    ...plotPath.flatMap((point) => [Math.abs(point.originalCurrent), Math.abs(point.oppositeCurrent)])
  );
  if (diagnostics.maximumAbsoluteOvershoot > RECONSTRUCTION_TOLERANCE_SCALE * maximumCurrentMagnitude) {
    throw new CvAnalysisError("reconstructionFailed");
  }
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
    || input.refined.baselineG.length !== pointCount
    || input.refined.g.length !== pointCount
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
  validateAlignedArrays(
    alignedGrid.potentials,
    optimized.g,
    input.refined.baselineG,
    input.refined.g,
    alignedGrid.forwardCurrents[seriesIndex]!,
    alignedGrid.reverseCurrents[seriesIndex]!
  );
  input.refined.g.forEach((fraction) => validateFraction(fraction));
  if (!input.refined.diagnostics.converged
    || !Number.isFinite(input.refined.diagnostics.optimalityResidual)) {
    throw new CvAnalysisError("reconstructionFailed");
  }
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
  const oppositeBySourceIndex = new Map<number, number>();
  for (const branch of ["forward", "reverse"] as const) {
    const owned = cycle.originalPoints.flatMap((point, sourceIndex) =>
      branchBySourceIndex.get(sourceIndex) === branch ? [{ point, sourceIndex }] : []);
    const opposite = evaluateOppositeCurrents(cycle, branch, owned.map(({ point }) => point.potential));
    owned.forEach(({ sourceIndex }, index) => oppositeBySourceIndex.set(sourceIndex, opposite[index]!));
  }

  const records = cycle.originalPoints.map((point, sourceIndex) => {
    const branch = branchBySourceIndex.get(sourceIndex);
    const oppositeCurrent = oppositeBySourceIndex.get(sourceIndex);
    if (branch === undefined || oppositeCurrent === undefined) throw new CvAnalysisError("invalidDataShape");
    const baselineFraction = evaluateSharedFraction(
      input.alignedGrid.potentials,
      input.refined.baselineG,
      point.potential
    );
    const fraction = evaluateSharedFraction(
      input.alignedGrid.potentials,
      input.refined.g,
      point.potential
    );
    return makeOrderedRecord(
      point,
      branch,
      sourceIndex,
      oppositeCurrent,
      baselineFraction,
      fraction
    );
  });
  return insertSharedZeroCrossings(records);
}

function insertSharedZeroCrossings(records: DunnContribution["plotPath"]): DunnContribution["plotPath"] {
  const result: DunnContribution["plotPath"] = [];
  records.forEach((record, index) => {
    const previous = result.at(-1);
    if (previous
      && previous.branch === record.branch
      && previous.originalCurrent * record.originalCurrent < 0) {
      const fraction = -previous.originalCurrent / (record.originalCurrent - previous.originalCurrent);
      const potential = previous.potential + fraction * (record.potential - previous.potential);
      const g = previous.g + fraction * (record.g - previous.g);
      const oppositeCurrent = interpolateNumber(previous.oppositeCurrent, record.oppositeCurrent, fraction);
      const envelopeLower = Math.min(0, oppositeCurrent);
      const envelopeUpper = Math.max(0, oppositeCurrent);
      result.push({
        potential,
        current: 0,
        originalCurrent: 0,
        oppositeCurrent,
        envelopeLower,
        envelopeUpper,
        targetCapacitiveCurrent: 0,
        capacitiveCurrent: 0,
        diffusionCurrent: 0,
        g,
        effectiveFraction: 0,
        correctionMagnitude: 0,
        branch: record.branch,
        sourceIndex: null,
        synthetic: true
      });
    }
    result.push(record);
  });
  return result;
}

function makeOrderedRecord(
  point: { potential: number; current: number },
  branch: CvBranchKind,
  sourceIndex: number,
  oppositeCurrent: number,
  baselineFraction: number,
  fraction: number
): DunnOrderedRecord {
  validateOriginalAndFraction(point.current, baselineFraction);
  validateOriginalAndFraction(point.current, fraction);
  const envelopeLower = Math.min(point.current, oppositeCurrent);
  const envelopeUpper = Math.max(point.current, oppositeCurrent);
  const targetCapacitiveCurrent = cleanZero(baselineFraction * point.current);
  const capacitiveCurrent = cleanZero(fraction * point.current);
  const diffusionCurrent = cleanZero(point.current - capacitiveCurrent);
  validateReconstructedPoint(point.current, capacitiveCurrent, diffusionCurrent);
  return {
    potential: point.potential,
    current: capacitiveCurrent,
    originalCurrent: point.current,
    oppositeCurrent,
    envelopeLower,
    envelopeUpper,
    targetCapacitiveCurrent,
    capacitiveCurrent,
    diffusionCurrent,
    g: fraction,
    effectiveFraction: fraction,
    correctionMagnitude: Math.abs(capacitiveCurrent - targetCapacitiveCurrent),
    branch,
    sourceIndex,
    synthetic: false
  };
}

function evaluateOppositeCurrents(
  cycle: NormalizedCvCycle,
  branch: CvBranchKind,
  potentials: number[]
): number[] {
  const opposite = ascendingBranch(cycle, branch === "forward" ? "reverse" : "forward");
  const minimum = opposite.potentials[0]!;
  const maximum = opposite.potentials.at(-1)!;
  const tolerance = cycle.nativePotentialInterval;
  const interpolationPotentials: number[] = [];
  const interpolationIndices: number[] = [];
  const currents = new Array<number>(potentials.length).fill(0);
  potentials.forEach((potential, index) => {
    if (potential < minimum - tolerance || potential > maximum + tolerance) {
      // No opposite-branch value exists here; zero retains signed raw-current containment without extrapolation.
      return;
    }
    interpolationIndices.push(index);
    interpolationPotentials.push(Math.min(maximum, Math.max(minimum, potential)));
  });
  const interpolated = pchipInterpolate(opposite.potentials, opposite.currents, interpolationPotentials);
  interpolationIndices.forEach((index, interpolationIndex) => {
    currents[index] = interpolated[interpolationIndex]!;
  });
  return currents;
}

function ascendingBranch(cycle: NormalizedCvCycle, branch: CvBranchKind) {
  const source = branch === "forward" ? cycle.forward.points : [...cycle.reverse.points].reverse();
  const points = source.reduce<typeof source>((collapsed, point) => {
    if (collapsed.at(-1)?.potential === point.potential) collapsed[collapsed.length - 1] = point;
    else collapsed.push(point);
    return collapsed;
  }, []);
  if (points.length < 2) throw new CvAnalysisError("invalidDataShape");
  return {
    potentials: points.map((point) => point.potential),
    currents: points.map((point) => point.current)
  };
}

function interpolateNumber(left: number, right: number, fraction: number): number {
  return left + fraction * (right - left);
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
  const current = points[sourceIndex];
  if (current === undefined) throw new CvAnalysisError("invalidDataShape");

  return branchFromDelta(edgeDelta(points, sourceIndex - 1))
    ?? branchFromDelta(edgeDelta(points, sourceIndex))
    ?? branchFromDelta(previousNonZeroDelta(points, sourceIndex))
    ?? branchFromDelta(nextNonZeroDelta(points, sourceIndex));
}

function nextNonZeroDelta(points: NormalizedCvCycle["originalPoints"], sourceIndex: number): number | null {
  for (let index = sourceIndex; index < points.length - 1; index += 1) {
    const delta = points[index + 1]!.potential - points[index]!.potential;
    if (!Number.isFinite(delta)) throw new CvAnalysisError("invalidPotential");
    if (delta !== 0) return delta;
  }
  return null;
}

function previousNonZeroDelta(points: NormalizedCvCycle["originalPoints"], sourceIndex: number): number | null {
  for (let index = sourceIndex - 1; index >= 0; index -= 1) {
    const delta = points[index + 1]!.potential - points[index]!.potential;
    if (!Number.isFinite(delta)) throw new CvAnalysisError("invalidPotential");
    if (delta !== 0) return delta;
  }
  return null;
}

function edgeDelta(points: NormalizedCvCycle["originalPoints"], edgeIndex: number): number | null {
  if (edgeIndex < 0 || edgeIndex >= points.length - 1) return null;
  const delta = points[edgeIndex + 1]!.potential - points[edgeIndex]!.potential;
  if (!Number.isFinite(delta)) throw new CvAnalysisError("invalidPotential");
  return delta === 0 ? null : delta;
}

function branchFromDelta(delta: number | null): CvBranchKind | null {
  if (delta === null) return null;
  if (delta > 0) return "forward";
  if (delta < 0) return "reverse";
  return null;
}

function validatePlotPath(plotPath: DunnContribution["plotPath"]) {
  if (plotPath.length < 3) throw new CvAnalysisError("invalidDataShape");

  const runs: Array<{ branch: CvBranchKind; potentials: number[] }> = [];
  for (const point of plotPath) {
    if (!Number.isFinite(point.potential)
      || !Number.isFinite(point.current)
      || !Number.isFinite(point.originalCurrent)
      || !Number.isFinite(point.oppositeCurrent)
      || !Number.isFinite(point.envelopeLower)
      || !Number.isFinite(point.envelopeUpper)
      || !Number.isFinite(point.targetCapacitiveCurrent)
      || !Number.isFinite(point.capacitiveCurrent)
      || !Number.isFinite(point.diffusionCurrent)
      || !Number.isFinite(point.g)
      || !Number.isFinite(point.effectiveFraction)
      || !Number.isFinite(point.correctionMagnitude)
      || (point.branch !== "forward" && point.branch !== "reverse")) {
      throw new CvAnalysisError("invalidDataShape");
    }
    validateOriginalAndFraction(point.originalCurrent, point.g);
    validateReconstructedPoint(point.originalCurrent, point.capacitiveCurrent, point.diffusionCurrent);
    if (point.envelopeLower > point.envelopeUpper
      || point.effectiveFraction < 0
      || point.effectiveFraction > 1
      || point.correctionMagnitude < 0) {
      throw new CvAnalysisError("invalidDataShape");
    }
    if (point.current !== point.capacitiveCurrent) throw new CvAnalysisError("invalidDataShape");
    const currentRun = runs.at(-1);
    if (currentRun?.branch === point.branch) {
      currentRun.potentials.push(point.potential);
    } else {
      runs.push({ branch: point.branch, potentials: [point.potential] });
    }
  }

  if (runs.length < 2 || runs.length > 3) throw new CvAnalysisError("invalidDataShape");
  for (const run of runs) {
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
    diagnostics.reverseAboveThresholdPercent,
    diagnostics.forwardAnchorCoverage,
    diagnostics.reverseAnchorCoverage,
    diagnostics.effectiveAnchorCoverage,
    diagnostics.lowerMedianRSquared,
    diagnostics.rawFractionNoise,
    diagnostics.confidenceBlend,
    diagnostics.smoothingMultiplier,
    diagnostics.baseLambda,
    diagnostics.effectiveLambda,
    diagnostics.maximumPositiveOvershoot,
    diagnostics.maximumNegativeOvershoot,
    diagnostics.maximumAbsoluteOvershoot,
    diagnostics.maximumEnvelopeCorrection,
    diagnostics.maximumUpperEnvelopeViolation,
    diagnostics.maximumLowerEnvelopeViolation,
    diagnostics.maximumAbsoluteEnvelopeViolation,
    diagnostics.correctedPointCount,
    diagnostics.correctedPointPercent,
    diagnostics.maximumEffectiveFractionDeparture,
    diagnostics.softEnvelopeTolerance,
    diagnostics.softEnvelopeIterations,
    diagnostics.softEnvelopeOptimalityResidual,
    diagnostics.maximumSharedFractionAdjustment,
    diagnostics.envelopeResidualPointCount,
    diagnostics.envelopeResidualPointPercent,
    diagnostics.maximumAdjacentGJump
  ];
  const unitIntervalValues = [
    diagnostics.forwardAnchorCoverage,
    diagnostics.reverseAnchorCoverage,
    diagnostics.effectiveAnchorCoverage,
    diagnostics.lowerMedianRSquared,
    diagnostics.rawFractionNoise,
    diagnostics.confidenceBlend
  ];
  if (finiteValues.some((value) => !Number.isFinite(value))
    || unitIntervalValues.some((value) => value < 0 || value > 1)
    || diagnostics.smoothingMultiplier < 1
    || diagnostics.smoothingMultiplier > 30
    || diagnostics.baseLambda <= 0
    || diagnostics.effectiveLambda <= 0
    || diagnostics.maximumPositiveOvershoot < 0
    || diagnostics.maximumNegativeOvershoot < 0
    || diagnostics.maximumAbsoluteOvershoot < 0
    || diagnostics.maximumEnvelopeCorrection < 0
    || diagnostics.maximumUpperEnvelopeViolation < 0
    || diagnostics.maximumLowerEnvelopeViolation < 0
    || diagnostics.maximumAbsoluteEnvelopeViolation < 0
    || diagnostics.correctedPointCount < 0
    || diagnostics.correctedPointPercent < 0
    || diagnostics.correctedPointPercent > 100
    || diagnostics.maximumEffectiveFractionDeparture < 0
    || diagnostics.maximumEffectiveFractionDeparture > 1
    || diagnostics.softEnvelopeTolerance < 0
    || diagnostics.softEnvelopeIterations < 0
    || !Number.isInteger(diagnostics.softEnvelopeIterations)
    || diagnostics.softEnvelopeOptimalityResidual < 0
    || diagnostics.maximumSharedFractionAdjustment < 0
    || diagnostics.maximumSharedFractionAdjustment > 1
    || diagnostics.envelopeResidualPointCount < 0
    || !Number.isInteger(diagnostics.envelopeResidualPointCount)
    || diagnostics.envelopeResidualPointPercent < 0
    || diagnostics.envelopeResidualPointPercent > 100
    || !diagnostics.softEnvelopeConverged
    || diagnostics.maximumAdjacentGJump < 0
    || diagnostics.maximumAdjacentGJump > 1
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

function makeDiagnostics(
  input: DunnContributionInput,
  overshoot: BranchOvershootDiagnostics,
  plotPath: DunnOrderedRecord[]
): DunnDiagnostics {
  const forwardRSquared = finiteRSquared(input.dunnRecords.forward);
  const reverseRSquared = finiteRSquared(input.dunnRecords.reverse);
  const lowFitQuality = isLowFitQuality(forwardRSquared, reverseRSquared, input.threshold);
  const scanRateWarning = new Set(input.alignedGrid.scanRates).size === 3;
  const envelope = measureEnvelopeViolation(plotPath);
  const maximumCurrentMagnitude = Math.max(1, ...plotPath.flatMap((record) => [
    Math.abs(record.originalCurrent),
    Math.abs(record.oppositeCurrent)
  ]));
  const correctionTolerance = RECONSTRUCTION_TOLERANCE_SCALE * maximumCurrentMagnitude;
  const correctedPointCount = plotPath.filter((record) => record.correctionMagnitude > correctionTolerance).length;
  const envelopeResidualPointCount = plotPath.filter((record) =>
    record.capacitiveCurrent > record.envelopeUpper + correctionTolerance
    || record.capacitiveCurrent < record.envelopeLower - correctionTolerance).length;
  const gDeltas = input.refined.g.slice(1).map((value, index) => Math.abs(value - input.refined.g[index]!));
  const maximumAdjacentGJump = Math.max(0, ...gDeltas);
  const medianGJump = medianOrNull(gDeltas) ?? 0;
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
    qualityPassed: !lowFitQuality && !scanRateWarning,
    ...input.stabilization,
    baseLambda: input.optimized.diagnostics.baseLambda,
    effectiveLambda: input.optimized.diagnostics.lambda,
    maximumPositiveOvershoot: overshoot.maximumPositiveOvershoot,
    maximumNegativeOvershoot: overshoot.maximumNegativeOvershoot,
    maximumAbsoluteOvershoot: overshoot.maximumAbsoluteOvershoot,
    maximumEnvelopeCorrection: Math.max(0, ...plotPath.map((record) => record.correctionMagnitude)),
    maximumUpperEnvelopeViolation: envelope.maximumUpperViolation,
    maximumLowerEnvelopeViolation: envelope.maximumLowerViolation,
    maximumAbsoluteEnvelopeViolation: envelope.maximumAbsoluteViolation,
    correctedPointCount,
    correctedPointPercent: plotPath.length === 0 ? 0 : 100 * correctedPointCount / plotPath.length,
    maximumEffectiveFractionDeparture: Math.max(0, ...plotPath.map((record) => Math.abs(record.effectiveFraction - record.g))),
    softEnvelopeTolerance: input.refined.diagnostics.envelopeTolerance,
    softEnvelopeIterations: input.refined.diagnostics.iterations,
    softEnvelopeConverged: input.refined.diagnostics.converged,
    softEnvelopeOptimalityResidual: input.refined.diagnostics.optimalityResidual,
    maximumSharedFractionAdjustment: input.refined.diagnostics.maximumSharedFractionAdjustment,
    envelopeResidualPointCount,
    envelopeResidualPointPercent: plotPath.length === 0
      ? 0
      : 100 * envelopeResidualPointCount / plotPath.length,
    maximumAdjacentGJump,
    gSmoothnessWarning: maximumAdjacentGJump > 0.2 && maximumAdjacentGJump > 8 * medianGJump
  };
}

function mergeOvershootDiagnostics(
  diagnostics: BranchOvershootDiagnostics[]
): BranchOvershootDiagnostics {
  return diagnostics.reduce<BranchOvershootDiagnostics>((merged, item) => {
    const maximumAbsoluteOvershoot = Math.max(merged.maximumAbsoluteOvershoot, item.maximumAbsoluteOvershoot);
    return {
      maximumPositiveOvershoot: Math.max(merged.maximumPositiveOvershoot, item.maximumPositiveOvershoot),
      maximumNegativeOvershoot: Math.max(merged.maximumNegativeOvershoot, item.maximumNegativeOvershoot),
      maximumAbsoluteOvershoot,
      worstIndex: item.maximumAbsoluteOvershoot > merged.maximumAbsoluteOvershoot
        ? item.worstIndex
        : merged.worstIndex
    };
  }, {
    maximumPositiveOvershoot: 0,
    maximumNegativeOvershoot: 0,
    maximumAbsoluteOvershoot: 0,
    worstIndex: null
  });
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
