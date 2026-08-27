import { describe, expect, it } from "vitest";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";
import { analyzePeakBValues, detectPeakCandidates, fitPeakGroups, matchPeakCandidates } from "../src/lib/cvPeakAnalysis";
import type { CvBranchKind, CvPeakCandidate, CvSeries } from "../src/lib/cvTypes";
import {
  makeGuidedRecoveryEdgeSpikeSeries,
  makeHighRateShoulderNcpSeries,
  makeManyPeakSeries,
  makeOrderSensitiveRecoverablePeakSeries,
  makePartialPeakSeries,
  makeRecoverablePeakSeries,
  makeThreePeakNcpLikeSeries
} from "./fixtures/cvPeakData";

describe("detectPeakCandidates", () => {
  it("finds two oxidation and one reduction candidates in NCP-like loops", () => {
    const series = makeThreePeakNcpLikeSeries();
    const candidates = detectPeakCandidates(series, normalizeAlignedCvCycles(series));
    for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex += 1) {
      const local = candidates.filter((candidate) => candidate.seriesIndex === seriesIndex);
      expect(local.filter((candidate) => candidate.kind === "oxidation")).toHaveLength(2);
      expect(local.filter((candidate) => candidate.kind === "reduction")).toHaveLength(1);
      expect(local.every((candidate) => series[seriesIndex]!.points[candidate.sourceIndex]!.potential === candidate.potential)).toBe(true);
      expect(local.every((candidate) => series[seriesIndex]!.points[candidate.sourceIndex]!.current === candidate.current)).toBe(true);
    }
  });

  it("maps a detected peak on a rising local background to an original local extremum", () => {
    const series = makeRisingBackgroundPeakSeries();
    const cycles = normalizeAlignedCvCycles(series);
    const candidates = detectPeakCandidates(series, cycles)
      .filter((candidate) => candidate.branch === "forward");

    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      const branch = cycles[candidate.seriesIndex]!.forward.points;
      const branchIndex = branch.findIndex((point) => point.sourceIndex === candidate.sourceIndex);
      expect(branchIndex).toBeGreaterThan(0);
      expect(branchIndex).toBeLessThan(branch.length - 1);
      expect(candidate.current).toBeGreaterThan(branch[branchIndex - 1]!.current);
      expect(candidate.current).toBeGreaterThanOrEqual(branch[branchIndex + 1]!.current);
    }
  });

  it("does not let an isolated raw noise spike replace the nearby defensible peak", () => {
    const clean = makeIsolatedSpikePeakSeries(false);
    const spiked = makeIsolatedSpikePeakSeries(true);
    const cleanCandidate = detectPeakCandidates(clean, normalizeAlignedCvCycles(clean))
      .find((candidate) => candidate.branch === "forward");
    const spikedCandidate = detectPeakCandidates(spiked, normalizeAlignedCvCycles(spiked))
      .find((candidate) => candidate.branch === "forward");

    expect(cleanCandidate).toBeDefined();
    expect(spikedCandidate).toBeDefined();
    expect(spikedCandidate!.potential).toBeCloseTo(cleanCandidate!.potential, 12);
    expect(spikedCandidate!.sourceIndex).not.toBe(205);
  });
});

it("matches strict peak families at the target log scan rate on both sides of a middle reference", () => {
  const baseline = makeTargetRateMatchingFixture([0.01, 9, 10, 11, 1_000]);
  const permuted = makeTargetRateMatchingFixture([1_000, 10, 0.01, 11, 9]);

  const baselineGroups = matchPeakCandidates(baseline.candidates, baseline.series.map((item) => item.scanRate));
  const permutedGroups = matchPeakCandidates(permuted.candidates, permuted.series.map((item) => item.scanRate));

  expect(baselineGroups).toHaveLength(1);
  expect(permutedGroups).toHaveLength(1);
  expect(ratePotentialMap(baselineGroups[0]!)).toEqual([
    [0.01, targetPotential(0.01)],
    [9, targetPotential(9)],
    [10, targetPotential(10)],
    [11, targetPotential(11)],
    [1_000, targetPotential(1_000)]
  ]);
  expect(ratePotentialMap(permutedGroups[0]!)).toEqual(ratePotentialMap(baselineGroups[0]!));

  const [baselineFit] = fitPeakGroups(baselineGroups, baseline.series, 0);
  const [permutedFit] = fitPeakGroups(permutedGroups, permuted.series, 0);
  expect(baselineFit.b).toBeCloseTo(0.7, 12);
  expect(permutedFit.b).toBeCloseTo(baselineFit.b!, 12);
});

it("matches shifted NCP-like peaks without combining branches", () => {
  const series = makeThreePeakNcpLikeSeries();
  const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0.95);
  expect(result.fits).toHaveLength(3);
  expect(result.fits.map((fit) => fit.kind)).toEqual(["oxidation", "oxidation", "reduction"]);
  expect(result.fits.every((fit) => fit.points.every((point) => point.candidate === null || point.candidate.branch === fit.branch))).toBe(true);
  expect(result.fits.every((fit) => fit.b !== null && fit.rSquared !== null)).toBe(true);
});

it("fits a peak present at only three rates and discloses partial coverage", () => {
  const series = makePartialPeakSeries();
  const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0);
  const partial = result.fits.find((fit) => fit.kind === "reduction")!;
  expect(partial.coverageCount).toBe(3);
  expect(partial.coverageStatus).toBe("partial");
  expect(partial.pointCount).toBe(3);
  expect(partial.fitStatus).toBe("valid");
});

it("recovers coherent weak peak-family members from original branch points", () => {
  const series = makeRecoverablePeakSeries();
  const cycles = normalizeAlignedCvCycles(series);
  const strict = matchPeakCandidates(detectPeakCandidates(series, cycles), series.map((item) => item.scanRate));
  expect(strict.map((group) => group.candidates.size)).toEqual([5, 4, 3]);

  const result = analyzePeakBValues(series, cycles, 0);
  expect(result.fits.map((fit) => fit.coverageCount)).toEqual([5, 5, 5]);
  for (const fit of result.fits) {
    for (const point of fit.points) {
      expect(point.candidate).not.toBeNull();
      const candidate = point.candidate!;
      const original = series[point.seriesIndex]!.points[candidate.sourceIndex]!;
      expect(candidate.potential).toBe(original.potential);
      expect(candidate.current).toBe(original.current);
      expect(candidate.branch).toBe(fit.branch);
      expect(cycles[point.seriesIndex]!.forward.points.some((item) => item.sourceIndex === candidate.sourceIndex)).toBe(true);
      expect(cycles[point.seriesIndex]!.reverse.points.some((item) => item.sourceIndex === candidate.sourceIndex)).toBe(false);
    }
  }
});

it("recovers the NCP-like 50 mV/s shoulder at its adjacent original local extremum", () => {
  const series = makeHighRateShoulderNcpSeries();
  const cycles = normalizeAlignedCvCycles(series);
  const strict = matchPeakCandidates(detectPeakCandidates(series, cycles), series.map((item) => item.scanRate));
  expect(strict.map((group) => group.candidates.size)).toEqual([5, 4, 5]);

  const result = analyzePeakBValues(series, cycles, 0);
  expect(result.fits.map((fit) => fit.coverageCount)).toEqual([5, 5, 5]);
  const highRatePoint = result.fits[1]!.points.find((point) => point.scanRate === 50)!;
  expect(highRatePoint.candidate).not.toBeNull();
  const candidate = highRatePoint.candidate!;
  const original = series[highRatePoint.seriesIndex]!.points[candidate.sourceIndex]!;
  expect(candidate.potential).toBe(original.potential);
  expect(candidate.current).toBe(original.current);
  const branch = cycles[highRatePoint.seriesIndex]!.forward.points;
  const branchIndex = branch.findIndex((point) => point.sourceIndex === candidate.sourceIndex);
  expect(branchIndex).toBeGreaterThan(0);
  expect(branchIndex).toBeLessThan(branch.length - 1);
  expect(candidate.current).toBeGreaterThan(branch[branchIndex - 1]!.current);
  expect(candidate.current).toBeGreaterThanOrEqual(branch[branchIndex + 1]!.current);
});

it("does not recover a lone spike at the edge of the guided smoothing window", () => {
  const series = makeGuidedRecoveryEdgeSpikeSeries();
  const cycles = normalizeAlignedCvCycles(series);
  const strict = matchPeakCandidates(detectPeakCandidates(series, cycles), series.map((item) => item.scanRate));
  expect(strict).toHaveLength(1);
  expect(strict[0]!.candidates.size).toBe(4);

  const result = analyzePeakBValues(series, cycles, 0);
  expect(result.fits).toHaveLength(1);
  expect(result.fits[0]!.coverageCount).toBe(4);
  expect(result.fits[0]!.points.find((point) => point.scanRate === 20)!.candidate).toBeNull();
});

it("keeps recovered peak families invariant when scan-rate series are reordered", () => {
  const series = makeOrderSensitiveRecoverablePeakSeries();
  const reordered = [series[4]!, series[2]!, series[0]!, series[3]!, series[1]!];
  const baseline = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0);
  const permuted = analyzePeakBValues(reordered, normalizeAlignedCvCycles(reordered), 0);

  expect(permuted.fits.map((fit) => fit.coverageCount)).toEqual(baseline.fits.map((fit) => fit.coverageCount));
  for (const [index, fit] of baseline.fits.entries()) {
    const reorderedFit = permuted.fits[index]!;
    expect(reorderedFit.b).toBeCloseTo(fit.b!, 12);
    for (const point of fit.points) {
      const reorderedPoint = reorderedFit.points.find((item) => item.scanRate === point.scanRate)!;
      expect(reorderedPoint.candidate?.potential).toBe(point.candidate?.potential);
      expect(reorderedPoint.candidate?.sourceIndex).toBe(point.candidate?.sourceIndex);
    }
  }
});

it("keeps recovered normalized prominence invariant under current-unit scaling", () => {
  const series = makeRecoverablePeakSeries();
  const scaled = scaleCurrents(series, 1_000);
  const baseline = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0);
  const scaledResult = analyzePeakBValues(scaled, normalizeAlignedCvCycles(scaled), 0);

  for (const [index, fit] of baseline.fits.entries()) {
    const scaledFit = scaledResult.fits[index]!;
    for (const point of fit.points.filter((item) => item.candidate !== null && item.candidate.confidence < 1)) {
      const scaledPoint = scaledFit.points.find((item) => item.scanRate === point.scanRate)!;
      expect(scaledPoint.candidate?.normalizedProminence).toBeCloseTo(point.candidate!.normalizedProminence, 12);
    }
  }
});

it("caps automatically matched peak groups at ten", () => {
  const series = makeManyPeakSeries(12);
  const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0);
  expect(result.fits).toHaveLength(10);
  expect(result.fits.map((fit) => fit.labelIndex)).toEqual([1,2,3,4,5,6,7,8,9,10]);
});

it("marks negligible peak currents ineligible instead of fitting their apparent power law", () => {
  const scanRates = [1, 2, 5, 10, 20];
  const group = makePeakGroup("forward", scanRates.map((scanRate, seriesIndex) => ({
    seriesIndex,
    scanRate,
    potential: -0.4,
    current: 1e-12 * Math.pow(scanRate, 0.75),
    sourceIndex: 1
  })));
  const series = makeSeriesWithBranchScale(scanRates, 1);
  const [fit] = fitPeakGroups([group], series, 0.95);
  expect(fit.rSquared).toBeNull();
  expect(fit.b).toBeNull();
  expect(fit.pointCount).toBe(0);
  expect(fit.points.every((point) => point.regressionEligible === false)).toBe(true);
  expect(fit.fitStatus).toBe("nearZeroCurrentUnstable");
});

it("uses the selected sweep branch rather than the opposite branch for the near-zero scale", () => {
  const scanRates = [1, 2, 5, 10, 20];
  const group = makePeakGroup("forward", scanRates.map((scanRate, seriesIndex) => ({
    seriesIndex,
    scanRate,
    potential: 0,
    current: 1e-3 * Math.pow(scanRate, 0.75),
    sourceIndex: 1
  })));
  const series = scanRates.map((scanRate) => ({
    label: `${scanRate} mV/s`,
    scanRate,
    points: [
      { potential: -1, current: 1 },
      { potential: 0, current: 1 },
      { potential: 1, current: 1 },
      { potential: 0, current: -1e9 },
      { potential: -1, current: -1e9 }
    ]
  }));
  const cycles = normalizeAlignedCvCycles(series);
  const [fit] = fitPeakGroups([group], series, 0.95, cycles);

  expect(fit.fitStatus).toBe("valid");
  expect(fit.b).toBeCloseTo(0.75, 10);
});

function makePeakGroup(
  branch: CvBranchKind,
  points: Array<Pick<CvPeakCandidate, "seriesIndex" | "scanRate" | "potential" | "current" | "sourceIndex">>
) {
  return {
    peakId: "peak-1",
    labelIndex: 1,
    branch,
    kind: branch === "forward" ? "oxidation" as const : "reduction" as const,
    candidates: new Map(points.map((point) => [point.seriesIndex, {
      ...point,
      branch,
      kind: branch === "forward" ? "oxidation" as const : "reduction" as const,
      branchSpan: 2,
      prominence: Math.abs(point.current),
      normalizedProminence: 1,
      confidence: 1
    }]))
  };
}

function makeSeriesWithBranchScale(scanRates: number[], scale: number): CvSeries[] {
  return scanRates.map((scanRate) => ({
    label: `${scanRate} mV/s`,
    scanRate,
    points: [
      { potential: -1, current: scale },
      { potential: 0, current: scale },
      { potential: 1, current: scale },
      { potential: 0, current: -scale },
      { potential: -1, current: -scale }
    ]
  }));
}

function scaleCurrents(series: CvSeries[], factor: number): CvSeries[] {
  return series.map((item) => ({
    ...item,
    points: item.points.map((point) => ({ ...point, current: point.current * factor }))
  }));
}

function makeTargetRateMatchingFixture(rateOrder: number[]) {
  const series = rateOrder.map((scanRate) => ({
    label: `${scanRate} mV/s`,
    scanRate,
    points: [{ potential: 0, current: Math.pow(scanRate, 0.7) }]
  }));
  const candidates = series.flatMap((item, seriesIndex) => {
    const potentials = item.scanRate === 10 ? [-0.009, 0, 0.009] : [targetPotential(item.scanRate)];
    return potentials.map((potential, sourceIndex) => ({
      seriesIndex,
      scanRate: item.scanRate,
      branch: "forward" as const,
      kind: "oxidation" as const,
      sourceIndex,
      potential,
      current: Math.pow(item.scanRate, 0.7),
      branchSpan: 1,
      prominence: 1,
      normalizedProminence: 1,
      confidence: 1
    }));
  });
  return { series, candidates };
}

function targetPotential(scanRate: number) {
  return 0.015 * Math.log(scanRate / 10);
}

function ratePotentialMap(group: ReturnType<typeof matchPeakCandidates>[number]) {
  return [...group.candidates.values()]
    .sort((left, right) => left.scanRate - right.scanRate)
    .map((candidate) => [candidate.scanRate, candidate.potential]);
}

function makeRisingBackgroundPeakSeries(): CvSeries[] {
  const grid = Array.from({ length: 401 }, (_, index) => -1 + 2 * index / 400);
  return [1, 4, 9].map((scanRate) => ({
    label: `${scanRate} mV/s`,
    scanRate,
    points: [...grid, ...grid.slice(0, -1).reverse()].map((potential, sourceIndex) => {
      const forward = sourceIndex <= 400;
      const peak = Math.exp(-Math.pow(potential / 0.012, 2));
      const risingShelf = potential <= 0.01
        ? 0
        : potential <= 0.1
          ? 7 * (potential - 0.01) / 0.09
          : potential <= 0.2
            ? 7 * (0.2 - potential) / 0.1
            : 0;
      return {
        potential,
        current: forward
          ? Math.pow(scanRate, 0.7) * (peak + risingShelf)
          : -0.1 * Math.sqrt(scanRate)
      };
    })
  }));
}

function makeIsolatedSpikePeakSeries(withSpike: boolean): CvSeries[] {
  const grid = Array.from({ length: 401 }, (_, index) => -1 + 2 * index / 400);
  return [1, 4, 9].map((scanRate) => ({
    label: `${scanRate} mV/s`,
    scanRate,
    points: [...grid, ...grid.slice(0, -1).reverse()].map((potential, sourceIndex) => {
      const forward = sourceIndex <= 400;
      const peak = Math.exp(-Math.pow(potential / 0.055, 2));
      const spike = withSpike && sourceIndex === 205 ? 1.25 : 0;
      return {
        potential,
        current: forward
          ? Math.pow(scanRate, 0.7) * (peak + spike)
          : -0.1 * Math.sqrt(scanRate)
      };
    })
  }));
}
