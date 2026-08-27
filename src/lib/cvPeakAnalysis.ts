import { pchipInterpolate } from "./cvInterpolation";
import { linearRegression } from "./regression";
import {
  CvAnalysisError,
  type CvBranchKind,
  type CvPeakCandidate,
  type CvPeakAnalysisResult,
  type CvPeakFit,
  type CvPeakFitStatus,
  type CvPeakKind,
  type CvSeries,
  type CvSweepPoint,
  type NormalizedCvCycle
} from "./cvTypes";

export type CvPeakGroup = {
  peakId: string;
  labelIndex: number;
  branch: CvBranchKind;
  kind: CvPeakKind;
  candidates: Map<number, CvPeakCandidate>;
};

export function detectPeakCandidates(series: CvSeries[], cycles: NormalizedCvCycle[]): CvPeakCandidate[] {
  if (series.length !== cycles.length) throw new CvAnalysisError("invalidDataShape");
  return series.flatMap((item, seriesIndex) => [
    ...detectBranch(item, cycles[seriesIndex]!, seriesIndex, "forward", "oxidation"),
    ...detectBranch(item, cycles[seriesIndex]!, seriesIndex, "reverse", "reduction")
  ]);
}

export function analyzePeakBValues(
  series: CvSeries[],
  cycles: NormalizedCvCycle[],
  threshold: number
): CvPeakAnalysisResult {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new CvAnalysisError("invalidRSquaredThreshold");
  }
  const candidates = detectPeakCandidates(series, cycles);
  const strictGroups = matchPeakCandidates(candidates, series.map((item) => item.scanRate));
  const groups = recoverMissingPeakCandidates(strictGroups, series, cycles);
  return { candidates, fits: fitPeakGroups(groups, series, threshold, cycles), maximumPeakCount: 10 };
}

export function matchPeakCandidates(candidates: CvPeakCandidate[], scanRates: number[]): CvPeakGroup[] {
  if (scanRates.some((rate) => !Number.isFinite(rate) || rate <= 0)) throw new CvAnalysisError("invalidScanRate");
  const seriesOrder = scanRates.map((scanRate, seriesIndex) => ({ scanRate, seriesIndex }))
    .sort((left, right) => left.scanRate - right.scanRate || left.seriesIndex - right.seriesIndex);
  const groups: Array<Omit<CvPeakGroup, "peakId" | "labelIndex">> = [];
  for (const [branch, kind] of [["forward", "oxidation"], ["reverse", "reduction"]] as const) {
    const local = candidates.filter((candidate) => candidate.branch === branch && candidate.kind === kind);
    if (local.length === 0) continue;
    const span = Math.max(Number.EPSILON, ...local.map((candidate) => candidate.branchSpan));
    const reference = chooseReferenceSeries(local, seriesOrder);
    const referencePosition = seriesOrder.findIndex((item) => item.seriesIndex === reference.seriesIndex);
    const builders: Array<Omit<CvPeakGroup, "peakId" | "labelIndex">> = local
      .filter((candidate) => candidate.seriesIndex === reference.seriesIndex)
      .sort((left, right) => left.potential - right.potential)
      .map((candidate) => ({ branch, kind, candidates: new Map([[candidate.seriesIndex, candidate]]) }));

    extendGroups(builders, local, seriesOrder.slice(referencePosition + 1), span);
    extendGroups(builders, local, seriesOrder.slice(0, referencePosition).reverse(), span);
    groups.push(...builders.filter((group) => group.candidates.size >= 3));
  }

  const ranked = groups.length <= 10 ? groups : [...groups]
    .sort((left, right) => groupRank(right) - groupRank(left))
    .slice(0, 10);
  return ranked
    .sort((left, right) => branchOrder(left.branch) - branchOrder(right.branch)
      || median([...left.candidates.values()].map((candidate) => candidate.potential))
        - median([...right.candidates.values()].map((candidate) => candidate.potential)))
    .map((group, index) => ({ ...group, peakId: `peak-${index + 1}`, labelIndex: index + 1 }));
}

export function recoverMissingPeakCandidates(
  groups: CvPeakGroup[],
  series: CvSeries[],
  cycles: NormalizedCvCycle[]
): CvPeakGroup[] {
  if (series.length !== cycles.length) throw new CvAnalysisError("invalidDataShape");
  const recovered = groups.map((group) => ({ ...group, candidates: new Map(group.candidates) }));
  for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex += 1) {
    const item = series[seriesIndex]!;
    const cycle = cycles[seriesIndex]!;
    const pending = recovered
      .filter((group) => group.candidates.size >= 3 && !group.candidates.has(seriesIndex))
      .sort((left, right) => predictPotentialAtRate(left, item.scanRate) - predictPotentialAtRate(right, item.scanRate));
    for (const group of pending) {
      const branchPoints = group.branch === "forward" ? cycle.forward.points : cycle.reverse.points;
      const branchSpan = Math.max(
        Number.EPSILON,
        ...[...group.candidates.values()].map((candidate) => candidate.branchSpan)
      );
      const predicted = predictPotentialAtRate(group, item.scanRate);
      const halfWindow = Math.min(
        0.12 * branchSpan,
        Math.max(4 * cycle.nativePotentialInterval, 0.06 * branchSpan)
      );
      const candidate = recoverLocalExtremum(branchPoints, predicted, halfWindow, group.kind, branchSpan);
      if (candidate === null || !isSeparatedFromFamily(candidate.point, group, recovered, seriesIndex, branchSpan)) continue;
      group.candidates.set(seriesIndex, {
        seriesIndex,
        scanRate: item.scanRate,
        branch: group.branch,
        kind: group.kind,
        sourceIndex: candidate.point.sourceIndex,
        potential: item.points[candidate.point.sourceIndex]!.potential,
        current: item.points[candidate.point.sourceIndex]!.current,
        branchSpan,
        prominence: candidate.prominence,
        normalizedProminence: candidate.normalizedProminence,
        confidence: candidate.confidence
      });
    }
  }
  return recovered;
}

function chooseReferenceSeries(
  local: CvPeakCandidate[],
  seriesOrder: Array<{ scanRate: number; seriesIndex: number }>
) {
  return [...seriesOrder].sort((left, right) => {
    const leftCandidates = local.filter((item) => item.seriesIndex === left.seriesIndex);
    const rightCandidates = local.filter((item) => item.seriesIndex === right.seriesIndex);
    return rightCandidates.length - leftCandidates.length
      || sumConfidence(rightCandidates) - sumConfidence(leftCandidates)
      || left.scanRate - right.scanRate;
  })[0]!;
}

function sumConfidence(candidates: CvPeakCandidate[]): number {
  return candidates.reduce((sum, candidate) => sum + candidate.confidence, 0);
}

function predictPotentialAtRate(group: Pick<CvPeakGroup, "candidates">, scanRate: number): number {
  const candidates = [...group.candidates.values()]
    .filter((candidate) => candidate.scanRate > 0 && Number.isFinite(candidate.potential));
  if (candidates.length === 0) return Number.NaN;
  if (candidates.length === 1 || !Number.isFinite(scanRate) || scanRate <= 0) return candidates[0]!.potential;
  const regression = linearRegression(candidates.map((candidate) => ({
    x: Math.log(candidate.scanRate),
    y: candidate.potential
  })));
  return regression !== null && Number.isFinite(regression.slope) && Number.isFinite(regression.intercept)
    ? regression.intercept + regression.slope * Math.log(scanRate)
    : candidates[0]!.potential;
}

function recoverLocalExtremum(
  branchPoints: CvSweepPoint[],
  predicted: number,
  halfWindow: number,
  kind: CvPeakKind,
  branchSpan: number
): { point: CvSweepPoint; prominence: number; normalizedProminence: number; confidence: number } | null {
  if (!Number.isFinite(predicted) || !Number.isFinite(halfWindow) || halfWindow <= 0) return null;
  const points = ascendingUnique(branchPoints)
    .filter((point) => Math.abs(point.potential - predicted) <= halfWindow);
  if (points.length < 7) return null;
  const currents = points.map((point) => point.current);
  const smoothed = smoothLocalQuadratic(currents, Math.min(7, largestOdd(points.length)));
  const extrema = smoothed.flatMap((value, index) => {
    if (index === 0 || index === smoothed.length - 1) return [];
    const expectedDirection = kind === "oxidation"
      ? value > smoothed[index - 1]! && value >= smoothed[index + 1]!
      : value < smoothed[index - 1]! && value <= smoothed[index + 1]!;
    return expectedDirection ? [index] : [];
  });
  if (extrema.length === 0) return null;
  const index = extrema.reduce((best, candidate) =>
    Math.abs(points[candidate]!.potential - predicted) < Math.abs(points[best]!.potential - predicted)
      ? candidate
      : best
  );
  const point = points[index]!;
  const left = currents.slice(0, index);
  const right = currents.slice(index + 1);
  if (left.length === 0 || right.length === 0) return null;
  const isOriginalExtremum = kind === "oxidation"
    ? point.current > currents[index - 1]! && point.current >= currents[index + 1]!
    : point.current < currents[index - 1]! && point.current <= currents[index + 1]!;
  if (!isOriginalExtremum) return null;
  const prominence = kind === "oxidation"
    ? point.current - Math.max(Math.min(...left), Math.min(...right))
    : Math.min(Math.max(...left), Math.max(...right)) - point.current;
  const localSpan = Math.max(Number.EPSILON, Math.max(...currents) - Math.min(...currents));
  const residualMad = median(currents.map((value, itemIndex) => Math.abs(value - smoothed[itemIndex]!)));
  const prominenceFloor = Math.max(4 * residualMad, 0.005 * localSpan, Number.EPSILON);
  if (!Number.isFinite(prominence) || prominence < prominenceFloor) return null;
  return {
    point,
    prominence,
    normalizedProminence: prominence / Math.max(Number.EPSILON, branchSpan),
    confidence: Math.min(0.49, Math.max(0.05, 0.1 * prominence / prominenceFloor))
  };
}

function isSeparatedFromFamily(
  point: CvSweepPoint,
  group: CvPeakGroup,
  groups: CvPeakGroup[],
  seriesIndex: number,
  branchSpan: number
): boolean {
  const minimumSeparation = 0.03 * branchSpan;
  return groups
    .filter((other) => other.branch === group.branch && other.kind === group.kind && other !== group)
    .map((other) => other.candidates.get(seriesIndex))
    .filter((candidate): candidate is CvPeakCandidate => candidate !== undefined)
    .every((candidate) => Math.abs(candidate.potential - point.potential) >= minimumSeparation);
}

export function fitPeakGroups(
  groups: CvPeakGroup[],
  series: CvSeries[],
  threshold: number,
  cycles?: NormalizedCvCycle[]
): CvPeakFit[] {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new CvAnalysisError("invalidRSquaredThreshold");
  }
  return groups.map((group) => {
    const branchScale = Math.max(
      Number.MIN_VALUE,
      ...(cycles && cycles.length === series.length
        ? cycles.flatMap((cycle) => (group.branch === "forward" ? cycle.forward.points : cycle.reverse.points)
          .map((point) => Math.abs(point.current)))
        : series.flatMap((item) => item.points.map((point) => Math.abs(point.current))))
    );
    const currentFloor = branchScale * 1e-6;
    const points = series.map((item, seriesIndex) => {
      const candidate = group.candidates.get(seriesIndex) ?? null;
      return {
        seriesIndex,
        scanRate: item.scanRate,
        candidate,
        status: candidate === null
          ? "missing" as const
          : Math.abs(candidate.current) <= currentFloor
            ? "nearZeroCurrentUnstable" as const
            : "auto" as const
      };
    });
    const stable = points.filter((point) => point.candidate
      && point.status !== "nearZeroCurrentUnstable"
      && point.scanRate > 0
      && Math.abs(point.candidate.current) > 0);
    const positive = points.filter((point) => point.candidate && point.scanRate > 0 && Math.abs(point.candidate.current) > 0);
    const fitPoints = stable.length >= 3 ? stable : positive;
    const regression = fitPoints.length >= 3 ? linearRegression(fitPoints.map((point) => ({
      x: Math.log(point.scanRate),
      y: Math.log(Math.abs(point.candidate!.current))
    }))) : null;
    const unstable = stable.length < 3 && positive.some((point) => point.status === "nearZeroCurrentUnstable");
    const fitStatus: CvPeakFitStatus = unstable
      ? "nearZeroCurrentUnstable"
      : regression === null
        ? "insufficientData"
        : threshold === 0 || regression.rSquared >= threshold
          ? "valid"
          : "belowRSquaredThreshold";
    const coverageCount = points.filter((point) => point.candidate !== null).length;
    return {
      peakId: group.peakId,
      labelIndex: group.labelIndex,
      branch: group.branch,
      kind: group.kind,
      points,
      b: regression?.slope ?? null,
      intercept: regression?.intercept ?? null,
      rSquared: regression?.rSquared ?? null,
      pointCount: regression?.pointCount ?? 0,
      coverageCount,
      coverageStatus: coverageCount === series.length ? "complete" : "partial",
      fitStatus
    };
  });
}

function extendGroups(
  groups: Array<Omit<CvPeakGroup, "peakId" | "labelIndex">>,
  candidates: CvPeakCandidate[],
  order: Array<{ scanRate: number; seriesIndex: number }>,
  span: number
) {
  for (const { seriesIndex } of order) {
    const local = candidates.filter((candidate) => candidate.seriesIndex === seriesIndex)
      .sort((left, right) => left.potential - right.potential);
    if (local.length === 0 || groups.length === 0) continue;
    const sortedGroups = [...groups].sort((left, right) => predictPotential(left) - predictPotential(right));
    const assignments = monotoneAssignments(sortedGroups, local, span);
    assignments.forEach(([groupIndex, candidateIndex]) => {
      sortedGroups[groupIndex]!.candidates.set(seriesIndex, local[candidateIndex]!);
    });
  }
}

function monotoneAssignments(
  groups: Array<Omit<CvPeakGroup, "peakId" | "labelIndex">>,
  candidates: CvPeakCandidate[],
  span: number
): Array<[number, number]> {
  const rows = groups.length + 1;
  const columns = candidates.length + 1;
  const costs = Array.from({ length: rows }, () => Array.from({ length: columns }, () => Number.POSITIVE_INFINITY));
  type AssignmentStep = { i: number; j: number; matched: boolean } | null;
  const previous: AssignmentStep[][] = Array.from(
    { length: rows },
    () => Array<AssignmentStep>(columns).fill(null)
  );
  costs[0]![0] = 0;
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < columns; j += 1) {
      const current = costs[i]![j]!;
      if (!Number.isFinite(current)) continue;
      if (i < groups.length && current + 0.35 < costs[i + 1]![j]!) {
        costs[i + 1]![j] = current + 0.35;
        previous[i + 1]![j] = { i, j, matched: false };
      }
      if (j < candidates.length && current + 0.35 < costs[i]![j + 1]!) {
        costs[i]![j + 1] = current + 0.35;
        previous[i]![j + 1] = { i, j, matched: false };
      }
      if (i < groups.length && j < candidates.length) {
        const match = matchCost(groups[i]!, candidates[j]!, span);
        if (Number.isFinite(match) && current + match < costs[i + 1]![j + 1]!) {
          costs[i + 1]![j + 1] = current + match;
          previous[i + 1]![j + 1] = { i, j, matched: true };
        }
      }
    }
  }
  const result: Array<[number, number]> = [];
  let i = groups.length;
  let j = candidates.length;
  while (i > 0 || j > 0) {
    const step = previous[i]![j];
    if (!step) break;
    if (step.matched) result.push([step.i, step.j]);
    i = step.i;
    j = step.j;
  }
  return result.reverse();
}

function matchCost(group: Omit<CvPeakGroup, "peakId" | "labelIndex">, candidate: CvPeakCandidate, span: number): number {
  const values = [...group.candidates.values()].sort((left, right) => left.scanRate - right.scanRate);
  const last = values.at(-1)!;
  const predicted = predictPotential(group);
  const displacement = Math.abs(candidate.potential - predicted);
  if (displacement > 0.25 * span) return Number.POSITIVE_INFINITY;
  const potentialCost = displacement / span;
  const prominenceCost = Math.min(1, Math.abs(Math.log((candidate.normalizedProminence + 1e-12)
    / (last.normalizedProminence + 1e-12))) / 4);
  const trendCost = values.length < 2 ? 0 : Math.min(1, displacement / span);
  return 0.65 * potentialCost + 0.20 * prominenceCost + 0.15 * trendCost;
}

function predictPotential(group: Omit<CvPeakGroup, "peakId" | "labelIndex">): number {
  const values = [...group.candidates.values()].sort((left, right) => left.scanRate - right.scanRate);
  if (values.length < 2) return values.at(-1)!.potential;
  const first = values.at(-2)!;
  const second = values.at(-1)!;
  const logDelta = Math.log(second.scanRate) - Math.log(first.scanRate);
  if (logDelta === 0) return second.potential;
  return second.potential + (second.potential - first.potential);
}

function groupRank(group: Omit<CvPeakGroup, "peakId" | "labelIndex">): number {
  const values = [...group.candidates.values()];
  return 100 * values.length
    + 10 * median(values.map((candidate) => candidate.normalizedProminence))
    + median(values.map((candidate) => candidate.confidence));
}

function branchOrder(branch: CvBranchKind): number {
  return branch === "forward" ? 0 : 1;
}

function detectBranch(
  series: CvSeries,
  cycle: NormalizedCvCycle,
  seriesIndex: number,
  branch: CvBranchKind,
  kind: CvPeakKind
): CvPeakCandidate[] {
  const original = ascendingUnique(branch === "forward" ? cycle.forward.points : cycle.reverse.points);
  if (original.length < 7) return [];
  const minimum = original[0]!.potential;
  const maximum = original.at(-1)!.potential;
  const span = maximum - minimum;
  if (!(span > 0)) return [];
  const intervalCount = Math.max(2, Math.ceil(span / cycle.nativePotentialInterval));
  const potentials = Array.from({ length: intervalCount + 1 }, (_, index) =>
    index === intervalCount ? maximum : minimum + span * index / intervalCount);
  const currents = pchipInterpolate(
    original.map((point) => point.potential),
    original.map((point) => point.current),
    potentials
  );
  const gridInterval = span / intervalCount;
  const desiredCount = makeOdd(Math.max(7, Math.round(0.015 * span / gridInterval)));
  const maximumCount = Math.max(7, largestOdd(Math.max(7, Math.floor(0.05 * span / gridInterval))));
  const smoothed = smoothLocalQuadratic(currents, Math.min(desiredCount, maximumCount));
  const residualMad = median(smoothed.map((value, index) => Math.abs(currents[index]! - value)));
  const robustMinimum = quantile(smoothed, 0.05);
  const robustMaximum = quantile(smoothed, 0.95);
  const robustSpan = Math.max(Number.EPSILON, robustMaximum - robustMinimum);
  const threshold = Math.max(5 * residualMad, 0.02 * robustSpan);
  const prominenceRadius = Math.max(2, Math.round(0.1 * span / gridInterval));
  const extrema = smoothed.flatMap((value, index) => {
    if (index === 0 || index === smoothed.length - 1) return [];
    const left = smoothed[index - 1]!;
    const right = smoothed[index + 1]!;
    const isPeak = branch === "forward"
      ? value > left && value >= right
      : value < left && value <= right;
    if (!isPeak) return [];
    const leftWindow = smoothed.slice(Math.max(0, index - prominenceRadius), index);
    const rightWindow = smoothed.slice(index + 1, Math.min(smoothed.length, index + prominenceRadius + 1));
    if (leftWindow.length === 0 || rightWindow.length === 0) return [];
    const prominence = branch === "forward"
      ? value - Math.max(Math.min(...leftWindow), Math.min(...rightWindow))
      : Math.min(Math.max(...leftWindow), Math.max(...rightWindow)) - value;
    return prominence >= threshold ? [{ index, prominence }] : [];
  });
  const minimumSeparation = 0.03 * span;
  const retained = [...extrema]
    .sort((left, right) => right.prominence - left.prominence || left.index - right.index)
    .reduce<typeof extrema>((selected, candidate) => {
      if (selected.every((item) => Math.abs(potentials[item.index]! - potentials[candidate.index]!) >= minimumSeparation)) {
        selected.push(candidate);
      }
      return selected;
    }, [])
    .sort((left, right) => left.index - right.index);
  const sourcePoints = branch === "forward" ? cycle.forward.points : cycle.reverse.points;
  const mappingRadius = minimumSeparation / 2;
  return retained.flatMap(({ index, prominence }) => {
    const center = potentials[index]!;
    const nearby = sourcePoints.filter((point) => Math.abs(point.potential - center) <= mappingRadius);
    if (nearby.length === 0) return [];
    const selected = nearby.reduce((best, point) => branch === "forward"
      ? point.current > best.current ? point : best
      : point.current < best.current ? point : best);
    return [{
      seriesIndex,
      scanRate: series.scanRate,
      branch,
      kind,
      sourceIndex: selected.sourceIndex,
      potential: series.points[selected.sourceIndex]!.potential,
      current: series.points[selected.sourceIndex]!.current,
      branchSpan: span,
      prominence,
      normalizedProminence: prominence / robustSpan,
      confidence: Math.min(1, prominence / Math.max(threshold, Number.EPSILON))
    }];
  });
}

function ascendingUnique(points: CvSweepPoint[]): CvSweepPoint[] {
  return [...points]
    .sort((left, right) => left.potential - right.potential || left.sourceIndex - right.sourceIndex)
    .reduce<CvSweepPoint[]>((result, point) => {
      if (result.at(-1)?.potential === point.potential) result[result.length - 1] = point;
      else result.push(point);
      return result;
    }, []);
}

function smoothLocalQuadratic(values: number[], windowCount: number): number[] {
  const radius = Math.floor(windowCount / 2);
  return values.map((value, index) => {
    if (index < radius || index + radius >= values.length) return value;
    let sumY = 0;
    let sumX2 = 0;
    let sumX4 = 0;
    let sumX2Y = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const x2 = offset * offset;
      sumY += values[index + offset]!;
      sumX2 += x2;
      sumX4 += x2 * x2;
      sumX2Y += x2 * values[index + offset]!;
    }
    const count = 2 * radius + 1;
    const denominator = count * sumX4 - sumX2 * sumX2;
    return denominator === 0 ? value : (sumX4 * sumY - sumX2 * sumX2Y) / denominator;
  });
}

function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const blend = position - lower;
  return sorted[lower]! + blend * (sorted[upper]! - sorted[lower]!);
}

function median(values: number[]): number {
  return quantile(values, 0.5);
}

function makeOdd(value: number): number {
  const integer = Math.max(1, Math.round(value));
  return integer % 2 === 1 ? integer : integer + 1;
}

function largestOdd(value: number): number {
  const integer = Math.max(1, Math.floor(value));
  return integer % 2 === 1 ? integer : integer - 1;
}
