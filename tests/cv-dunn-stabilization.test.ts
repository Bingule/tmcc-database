import { describe, expect, it } from "vitest";
import { makeDunnFractionGrid } from "../src/lib/cvDunnConfidence";
import { stabilizeDunnFractions } from "../src/lib/cvDunnStabilization";
import { CvAnalysisError, type DunnBranchFitRecord, type DunnFitGrid } from "../src/lib/cvTypes";

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

function makeDiagnosticFits(fractions: number[], rSquared: number, nonuniformPotentials = true): DunnFitGrid {
  const potentialAt = (index: number) => {
    const normalized = index / (fractions.length - 1);
    return nonuniformPotentials ? normalized ** 2 : normalized;
  };
  const makeRecords = (branch: "forward" | "reverse"): DunnBranchFitRecord[] => fractions.map((fraction, index) => ({
    branch,
    potential: potentialAt(index),
    fit: {
      potential: potentialAt(index),
      k1: fraction,
      k2: 1 - fraction,
      rSquared,
      pointCount: 4
    },
    status: "valid",
    trimmed: false
  }));
  return {
    forward: makeRecords("forward"),
    reverse: makeRecords("reverse"),
    resolvedTurningPointTrim: 0
  };
}

describe("stabilizeDunnFractions", () => {
  it.each([
    { coverage: 0.1, expectedBlend: 0.85 },
    { coverage: 0.3, expectedBlend: 0.425 },
    { coverage: 0.5, expectedBlend: 0 }
  ])("blends threshold confidence at $coverage coverage", ({ coverage, expectedBlend }) => {
    const result = stabilizeDunnFractions(
      makeFits({ forwardTrusted: coverage, reverseTrusted: coverage }),
      10,
      "threshold",
      0.95
    );

    expect(result.diagnostics.effectiveAnchorCoverage).toBeCloseTo(coverage, 12);
    expect(result.diagnostics.confidenceBlend).toBeCloseTo(expectedBlend, 12);
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

  it("throws reconstructionFailed when neither branch has finite fraction evidence", () => {
    const fits = makeFits({ forwardTrusted: 0, reverseTrusted: 0 });
    for (const record of [...fits.forward, ...fits.reverse]) {
      record.fit = null;
      record.status = "regressionFailed";
    }

    try {
      stabilizeDunnFractions(fits, 10, "threshold", 0.95);
      throw new Error("expected stabilizeDunnFractions to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CvAnalysisError);
      expect((error as CvAnalysisError).code).toBe("reconstructionFailed");
    }
  });

  it("locks the 101-node robust noise and smoothing diagnostics", () => {
    const fractions = Array.from({ length: 101 }, (_value, index) => Math.floor(index / 2) % 2);
    const result = stabilizeDunnFractions(makeDiagnosticFits(fractions, 0.99), 1, "weighted", 0.95);

    expect(result.diagnostics.rawFractionNoise).toBeCloseTo(0.6786747611115942, 12);
    expect(result.diagnostics.smoothingMultiplier).toBeCloseTo(5.605994313698795, 12);
  });

  it("uses the 0.10 IQR floor and the lower smoothing bound for deterministic traces", () => {
    const smallRange = Array.from({ length: 101 }, (_value, index) =>
      Math.floor(index / 2) % 2 === 0 ? 0.48 : 0.52
    );
    const constant = Array.from({ length: 101 }, () => 0.5);
    const flooredNoise = stabilizeDunnFractions(makeDiagnosticFits(smallRange, 0.99), 1, "weighted", 0.95);
    const lowerBound = stabilizeDunnFractions(makeDiagnosticFits(constant, 0.99), 1, "weighted", 0.95);

    expect(flooredNoise.diagnostics.rawFractionNoise).toBeCloseTo(0.2714699044446374, 12);
    expect(lowerBound.diagnostics.rawFractionNoise).toBe(0);
    expect(lowerBound.diagnostics.smoothingMultiplier).toBe(1);
  });

  it("keeps the highest attainable bounded policy multiplier below the 30 cap", () => {
    const fractions = Array.from({ length: 101 }, (_value, index) => [1, 1, 1, 0, 0, 0][index % 6]!);
    const result = stabilizeDunnFractions(makeDiagnosticFits(fractions, 0.5, false), 1, "weighted", 0.95);

    expect(result.diagnostics.smoothingMultiplier).toBe(29);
    expect(result.diagnostics.smoothingMultiplier).toBeLessThanOrEqual(30);
  });

  it("clips robust fraction noise at one", () => {
    const fractions = Array.from({ length: 101 }, (_value, index) => [1, 1, 1, 0, 0, 0][index % 6]!);
    const result = stabilizeDunnFractions(makeDiagnosticFits(fractions, 0.99, false), 1, "weighted", 0.95);

    expect(result.diagnostics.rawFractionNoise).toBe(1);
  });
});
