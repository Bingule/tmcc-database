import { describe, expect, it } from "vitest";
import { makeDunnFractionGrid } from "../src/lib/cvDunnConfidence";
import { stabilizeDunnFractions } from "../src/lib/cvDunnStabilization";
import type { DunnBranchFitRecord, DunnFitGrid } from "../src/lib/cvTypes";

interface FitControls {
  forwardTrusted: number;
  reverseTrusted: number;
  forwardRSquared?: number;
  reverseRSquared?: number;
  noisy?: boolean;
}

function makeFits({
  forwardTrusted,
  reverseTrusted,
  forwardRSquared = 0.5,
  reverseRSquared = 0.5,
  noisy = false
}: FitControls): DunnFitGrid {
  return {
    forward: makeBranch("forward", forwardTrusted, forwardRSquared, noisy),
    reverse: makeBranch("reverse", reverseTrusted, reverseRSquared, noisy),
    resolvedTurningPointTrim: 0
  };
}

function makeBranch(
  branch: "forward" | "reverse",
  trustedFraction: number,
  rSquared: number,
  noisy: boolean
): DunnBranchFitRecord[] {
  return Array.from({ length: 100 }, (_value, index) => {
    const trusted = index < trustedFraction * 100;
    const alternatingFraction = noisy && index % 2 === 0 ? 0.1 : noisy ? 0.9 : 0.5;
    return {
      branch,
      potential: index / 99,
      fit: {
        potential: index / 99,
        k1: alternatingFraction,
        k2: 1 - alternatingFraction,
        rSquared: trusted ? 0.99 : rSquared,
        pointCount: 4
      },
      status: "valid",
      trimmed: false
    };
  });
}

describe("stabilizeDunnFractions", () => {
  it("blends sparse threshold evidence according to geometric anchor coverage", () => {
    const sparse = stabilizeDunnFractions(
      makeFits({ forwardTrusted: 0.09, reverseTrusted: 0.05 }),
      10,
      "threshold",
      0.95
    );
    expect(sparse.diagnostics.confidenceBlend).toBeCloseTo(0.85, 12);

    const adequate = stabilizeDunnFractions(
      makeFits({ forwardTrusted: 0.5, reverseTrusted: 0.5 }),
      10,
      "threshold",
      0.95
    );
    expect(adequate.diagnostics.confidenceBlend).toBe(0);

    expect(sparse.diagnostics.forwardAnchorCoverage).toBeCloseTo(0.09, 12);
    expect(sparse.diagnostics.reverseAnchorCoverage).toBeCloseTo(0.05, 12);
    expect(sparse.diagnostics.effectiveAnchorCoverage).toBeCloseTo(Math.sqrt(0.09 * 0.05), 12);
    expect(sparse.diagnostics.effectiveAnchorCoverage).toBeLessThan((0.09 + 0.05) / 2);
  });

  it("keeps weighted evidence unchanged", () => {
    const fits = makeFits({ forwardTrusted: 0.09, reverseTrusted: 0.05 });
    const result = stabilizeDunnFractions(fits, 10, "weighted", 0.95);
    expect(result.diagnostics.confidenceBlend).toBe(0);
    expect(result.fractions).toEqual(makeDunnFractionGrid(fits, 10, "weighted", 0.95));
  });

  it("only blends threshold confidences, preserving the threshold fractions", () => {
    const fits = makeFits({ forwardTrusted: 0.09, reverseTrusted: 0.05 });
    const result = stabilizeDunnFractions(fits, 10, "threshold", 0.95);
    const threshold = makeDunnFractionGrid(fits, 10, "threshold", 0.95);

    expect(result.fractions.forward.map((point) => point.fraction))
      .toEqual(threshold.forward.map((point) => point.fraction));
    expect(result.fractions.reverse.map((point) => point.fraction))
      .toEqual(threshold.reverse.map((point) => point.fraction));
  });

  it("measures raw fraction noise from continuous weighted evidence in every mode", () => {
    const fits = makeFits({ forwardTrusted: 0.09, reverseTrusted: 0.05, noisy: true });
    for (const record of fits.reverse) {
      record.fit!.k1 = 0.5;
      record.fit!.k2 = 0.5;
    }

    const threshold = stabilizeDunnFractions(fits, 10, "threshold", 0.95);
    const weighted = stabilizeDunnFractions(fits, 10, "weighted", 0.95);
    expect(threshold.diagnostics.rawFractionNoise).toBeCloseTo(weighted.diagnostics.rawFractionNoise, 12);
    expect(threshold.diagnostics.rawFractionNoise).toBeGreaterThanOrEqual(0);
    expect(threshold.diagnostics.rawFractionNoise).toBeLessThanOrEqual(1);
  });

  it("increases smoothing for noisy, low-R², and sparse evidence", () => {
    const clean = stabilizeDunnFractions(
      makeFits({ forwardTrusted: 0.5, reverseTrusted: 0.5 }),
      10,
      "threshold",
      0.95
    );
    const noisy = stabilizeDunnFractions(
      makeFits({ forwardTrusted: 0.5, reverseTrusted: 0.5, noisy: true }),
      10,
      "threshold",
      0.95
    );
    const highR2 = stabilizeDunnFractions(
      makeFits({ forwardTrusted: 0.5, reverseTrusted: 0.5 }),
      10,
      "threshold",
      0.95
    );
    const lowR2 = stabilizeDunnFractions(
      makeFits({ forwardTrusted: 0, reverseTrusted: 0, forwardRSquared: 0.5, reverseRSquared: 0.5 }),
      10,
      "threshold",
      0.95
    );
    const sparse = stabilizeDunnFractions(
      makeFits({ forwardTrusted: 0.09, reverseTrusted: 0.05 }),
      10,
      "threshold",
      0.95
    );
    const adequate = stabilizeDunnFractions(
      makeFits({ forwardTrusted: 0.5, reverseTrusted: 0.5 }),
      10,
      "threshold",
      0.95
    );

    expect(noisy.diagnostics.smoothingMultiplier).toBeGreaterThan(clean.diagnostics.smoothingMultiplier);
    expect(lowR2.diagnostics.smoothingMultiplier).toBeGreaterThan(highR2.diagnostics.smoothingMultiplier);
    expect(sparse.diagnostics.smoothingMultiplier).toBeGreaterThan(adequate.diagnostics.smoothingMultiplier);
    expect(sparse.diagnostics.smoothingMultiplier).toBeLessThanOrEqual(30);
  });

  it("excludes trimmed and failed records from coverage while retaining finite non-negative confidences", () => {
    const fits = makeFits({ forwardTrusted: 1, reverseTrusted: 1 });
    fits.forward.push({
      branch: "forward",
      potential: 2,
      fit: null,
      status: "trimmed",
      trimmed: true
    });
    fits.reverse.push({
      branch: "reverse",
      potential: 2,
      fit: null,
      status: "regressionFailed",
      trimmed: false
    });

    const result = stabilizeDunnFractions(fits, 10, "threshold", 0.95);
    expect(result.diagnostics.forwardAnchorCoverage).toBe(1);
    expect(result.diagnostics.reverseAnchorCoverage).toBe(1);
    expect(result.fractions.forward.every((point) => Number.isFinite(point.confidence) && point.confidence >= 0)).toBe(true);
    expect(result.fractions.reverse.every((point) => Number.isFinite(point.confidence) && point.confidence >= 0)).toBe(true);
  });
});
