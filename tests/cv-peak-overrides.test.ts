import { describe, expect, it } from "vitest";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";
import { analyzePeakBValues } from "../src/lib/cvPeakAnalysis";
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
});
