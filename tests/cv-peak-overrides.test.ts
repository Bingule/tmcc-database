import { describe, expect, it } from "vitest";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";
import { analyzePeakBValues, fitPeakGroups } from "../src/lib/cvPeakAnalysis";
import {
  CvPeakOverrideError,
  addManualPeakOverride,
  applyPeakOverrides,
  createPeakOverrideState,
  removePeakOverride,
  restorePeakPointOverride,
  setPeakPointOverride,
  snapPeakPoint
} from "../src/lib/cvPeakOverrides";
import type { CvSeries } from "../src/lib/cvTypes";
import { makeManyPeakSeries, makeThreePeakNcpLikeSeries } from "./fixtures/cvPeakData";

describe("peak overrides", () => {
  it("snaps only to an original point on the selected branch", () => {
    const series = makeThreePeakNcpLikeSeries();
    const cycle = normalizeAlignedCvCycles(series)[0]!;
    const snapped = snapPeakPoint(series[0]!, cycle, "reverse", -0.7);
    expect(snapped.branch).toBe("reverse");
    expect(series[0]!.points[snapped.sourceIndex]).toEqual({ potential: snapped.potential, current: snapped.current });
  });

  it("adjusts one peak/rate without mutating automatic results", () => {
    const series = makeThreePeakNcpLikeSeries();
    const cycles = normalizeAlignedCvCycles(series);
    const automatic = analyzePeakBValues(series, cycles, 0);
    const peak = automatic.fits[0]!;
    const snapped = snapPeakPoint(series[0]!, cycles[0]!, peak.branch, peak.points[0]!.candidate!.potential + 0.02);
    const initial = createPeakOverrideState();
    const overrides = setPeakPointOverride(initial, { peakId: peak.peakId, seriesIndex: 0, action: "adjust", sourceIndex: snapped.sourceIndex });
    const adjusted = applyPeakOverrides(automatic, series, cycles, 0, overrides);
    expect(adjusted.fits[0]!.points[0]!.candidate!.sourceIndex).toBe(snapped.sourceIndex);
    expect(automatic.fits[0]!.points[0]!.candidate!.sourceIndex).not.toBe(snapped.sourceIndex);
    expect(initial).toEqual(createPeakOverrideState());
  });

  it("supports confirm, exclude, restore, remove, and the ten-peak limit", () => {
    const series = makeThreePeakNcpLikeSeries();
    const cycles = normalizeAlignedCvCycles(series);
    const automatic = analyzePeakBValues(series, cycles, 0);
    const peak = automatic.fits[0]!;
    const sourceIndex = peak.points[0]!.candidate!.sourceIndex;
    const confirmed = setPeakPointOverride(createPeakOverrideState(), {
      peakId: peak.peakId, seriesIndex: 0, action: "confirm", sourceIndex
    });
    const excluded = setPeakPointOverride(confirmed, {
      peakId: peak.peakId, seriesIndex: 1, action: "exclude"
    });
    const applied = applyPeakOverrides(automatic, series, cycles, 0, excluded);
    expect(applied.fits[0]!.points[0]!.status).toBe("confirmed");
    expect(applied.fits[0]!.points[1]!.status).toBe("excluded");

    const restored = restorePeakPointOverride(excluded, peak.peakId, 1);
    expect(applyPeakOverrides(automatic, series, cycles, 0, restored).fits[0]!.points[1]!.status).toBe("auto");
    const removed = removePeakOverride(restored, peak.peakId);
    expect(applyPeakOverrides(automatic, series, cycles, 0, removed).fits.some((fit) => fit.peakId === peak.peakId)).toBe(false);

    const tenSeries = makeManyPeakSeries(10);
    const tenCycles = normalizeAlignedCvCycles(tenSeries);
    const ten = analyzePeakBValues(tenSeries, tenCycles, 0);
    expect(ten.fits).toHaveLength(10);
    expect(() => addManualPeakOverride(
      createPeakOverrideState(), ten, tenSeries, tenCycles, {
        anchorSeriesIndex: 0,
        branch: "forward",
        sourceIndex: tenCycles[0]!.forward.points[10]!.sourceIndex
      }
    )).toThrowError(new CvPeakOverrideError("peakLimit"));
  });

  it("adds a distinct target-rate-aware family without reusing occupied source points", () => {
    const series = makeManualFamilySeries();
    const cycles = normalizeAlignedCvCycles(series);
    const automatic = analyzePeakBValues(series, cycles, 0);
    const anchorSeriesIndex = series.findIndex((item) => item.scanRate === 10);
    const anchorSourceIndex = nearestSourceIndex(series[anchorSeriesIndex]!, 0.3, true);
    const occupied = occupiedSourceKeys(automatic);

    const state = addManualPeakOverride(
      createPeakOverrideState(), automatic, series, cycles,
      { anchorSeriesIndex, branch: "forward", sourceIndex: anchorSourceIndex }
    );
    const applied = applyPeakOverrides(automatic, series, cycles, 0, state);
    const manual = applied.fits.find((fit) => fit.peakId === "manual-1")!;

    expect(manual).toBeDefined();
    expect(manual.labelIndex).toBeGreaterThan(Math.max(...automatic.fits.map((fit) => fit.labelIndex)));
    expect(manual.points.every((point) => point.candidate === null
      || !occupied.has(`${point.seriesIndex}:${point.candidate.sourceIndex}`))).toBe(true);
    for (const point of manual.points) {
      expect(point.candidate).not.toBeNull();
      const expected = 0.3 + 0.015 * Math.log(point.scanRate / 10);
      expect(point.candidate!.potential).toBeCloseTo(expected, 2);
      const branch = cycles[point.seriesIndex]!.forward.points;
      const index = branch.findIndex((candidate) => candidate.sourceIndex === point.candidate!.sourceIndex);
      expect(point.candidate!.current).toBeGreaterThan(branch[index - 1]!.current);
      expect(point.candidate!.current).toBeGreaterThanOrEqual(branch[index + 1]!.current);
    }
  });

  it("keeps manual ids and labels unique across add, remove, and add", () => {
    const series = makeManualFamilySeries();
    const cycles = normalizeAlignedCvCycles(series);
    const automatic = analyzePeakBValues(series, cycles, 0);
    const anchorSeriesIndex = series.findIndex((item) => item.scanRate === 10);
    const sourceIndex = nearestSourceIndex(series[anchorSeriesIndex]!, 0.3, true);

    const first = addManualPeakOverride(createPeakOverrideState(), automatic, series, cycles, {
      anchorSeriesIndex, branch: "forward", sourceIndex
    });
    const firstResult = applyPeakOverrides(automatic, series, cycles, 0, first);
    const firstManual = firstResult.fits.find((fit) => fit.peakId === "manual-1")!;
    const removed = removePeakOverride(first, firstManual.peakId);
    const afterRemoval = applyPeakOverrides(automatic, series, cycles, 0, removed);
    const second = addManualPeakOverride(removed, afterRemoval, series, cycles, {
      anchorSeriesIndex, branch: "forward", sourceIndex
    });
    const secondResult = applyPeakOverrides(automatic, series, cycles, 0, second);
    const secondManual = secondResult.fits.find((fit) => fit.peakId === "manual-2")!;

    expect(secondManual).toBeDefined();
    expect(secondManual.labelIndex).toBeGreaterThan(firstManual.labelIndex);
    expect(new Set(secondResult.fits.map((fit) => fit.labelIndex)).size).toBe(secondResult.fits.length);
  });

  it("keeps near-zero regression eligibility separate from confirmation status", () => {
    const scanRates = [1, 4, 9];
    const series = scanRates.map((scanRate) => ({
      label: `${scanRate} mV/s`,
      scanRate,
      points: [
        { potential: -1, current: 1 },
        { potential: 0, current: 1e-12 * Math.pow(scanRate, 0.7) },
        { potential: 1, current: 1 },
        { potential: 0, current: -1 },
        { potential: -1, current: -1 }
      ]
    }));
    const cycles = normalizeAlignedCvCycles(series);
    const candidates = new Map(scanRates.map((scanRate, seriesIndex) => [seriesIndex, {
      seriesIndex,
      scanRate,
      branch: "forward" as const,
      kind: "oxidation" as const,
      sourceIndex: 1,
      potential: 0,
      current: series[seriesIndex]!.points[1]!.current,
      branchSpan: 2,
      prominence: 1,
      normalizedProminence: 1,
      confidence: 1
    }]));
    const group = { peakId: "peak-1", labelIndex: 1, branch: "forward" as const, kind: "oxidation" as const, candidates };
    const automatic = {
      candidates: [...candidates.values()],
      fits: fitPeakGroups([group], series, 0, cycles),
      maximumPeakCount: 10 as const
    };
    const confirmed = setPeakPointOverride(createPeakOverrideState(), {
      peakId: "peak-1", seriesIndex: 0, action: "confirm", sourceIndex: 1
    });
    const point = applyPeakOverrides(automatic, series, cycles, 0, confirmed).fits[0]!.points[0]!;

    expect(point.status).toBe("confirmed");
    expect(point.regressionEligible).toBe(false);
  });
});

function makeManualFamilySeries(): CvSeries[] {
  const rates = [0.01, 9, 10, 11, 1_000];
  const grid = Array.from({ length: 1_001 }, (_, index) => -1 + 2 * index / 1_000);
  return rates.map((scanRate) => ({
    label: `${scanRate} mV/s`,
    scanRate,
    points: [...grid, ...grid.slice(0, -1).reverse()].map((potential, sourceIndex) => {
      const forward = sourceIndex <= 1_000;
      if (!forward) {
        const reduction = Math.exp(-Math.pow((potential - 0.2) / 0.08, 2)) * Math.pow(scanRate, 0.65);
        return { potential, current: -0.04 * Math.sqrt(scanRate) - reduction };
      }
      const strong = Math.exp(-Math.pow((potential + 0.35) / 0.07, 2)) * Math.pow(scanRate, 0.75);
      const familyCenter = 0.3 + 0.015 * Math.log(scanRate / 10);
      const weakFamily = 0.01 * Math.exp(-Math.pow((potential - familyCenter) / 0.004, 2)) * Math.pow(scanRate, 0.7);
      const distractor = 0.009 * Math.exp(-Math.pow((potential - 0.32) / 0.004, 2)) * Math.pow(scanRate, 0.7);
      return { potential, current: 0.04 * Math.sqrt(scanRate) + strong + weakFamily + distractor };
    })
  }));
}

function nearestSourceIndex(series: CvSeries, potential: number, forward: boolean) {
  const limit = forward ? Math.floor(series.points.length / 2) + 1 : series.points.length;
  let best = forward ? 0 : Math.floor(series.points.length / 2);
  for (let index = best + 1; index < limit; index += 1) {
    if (Math.abs(series.points[index]!.potential - potential) < Math.abs(series.points[best]!.potential - potential)) best = index;
  }
  return best;
}

function occupiedSourceKeys(result: ReturnType<typeof analyzePeakBValues>) {
  return new Set(result.fits.flatMap((fit) => fit.points.flatMap((point) => point.candidate
    ? [`${point.seriesIndex}:${point.candidate.sourceIndex}`]
    : [])));
}
