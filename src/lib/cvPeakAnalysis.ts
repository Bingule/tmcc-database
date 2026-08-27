import { pchipInterpolate } from "./cvInterpolation";
import {
  CvAnalysisError,
  type CvBranchKind,
  type CvPeakCandidate,
  type CvPeakKind,
  type CvSeries,
  type CvSweepPoint,
  type NormalizedCvCycle
} from "./cvTypes";

export function detectPeakCandidates(series: CvSeries[], cycles: NormalizedCvCycle[]): CvPeakCandidate[] {
  if (series.length !== cycles.length) throw new CvAnalysisError("invalidDataShape");
  return series.flatMap((item, seriesIndex) => [
    ...detectBranch(item, cycles[seriesIndex]!, seriesIndex, "forward", "oxidation"),
    ...detectBranch(item, cycles[seriesIndex]!, seriesIndex, "reverse", "reduction")
  ]);
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
