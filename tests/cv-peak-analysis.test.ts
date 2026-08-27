import { describe, expect, it } from "vitest";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";
import { analyzePeakBValues, detectPeakCandidates, fitPeakGroups } from "../src/lib/cvPeakAnalysis";
import type { CvBranchKind, CvPeakCandidate, CvSeries } from "../src/lib/cvTypes";
import { makeManyPeakSeries, makePartialPeakSeries, makeThreePeakNcpLikeSeries } from "./fixtures/cvPeakData";

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

it("caps automatically matched peak groups at ten", () => {
  const series = makeManyPeakSeries(12);
  const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0);
  expect(result.fits).toHaveLength(10);
  expect(result.fits.map((fit) => fit.labelIndex)).toEqual([1,2,3,4,5,6,7,8,9,10]);
});

it("marks a high-R² peak fit unstable when every peak current is negligible", () => {
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
  expect(fit.rSquared).toBeGreaterThan(0.999);
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
