import { describe, expect, it } from "vitest";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";
import { detectPeakCandidates } from "../src/lib/cvPeakAnalysis";
import { makeThreePeakNcpLikeSeries } from "./fixtures/cvPeakData";

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
