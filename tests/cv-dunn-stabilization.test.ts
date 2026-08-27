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

function independentlyDeriveDiagnostics(fits: DunnFitGrid, scanRate: number, threshold: number) {
  const forward = traceFromFits(fits.forward, scanRate);
  const reverse = traceFromFits(fits.reverse, scanRate);
  const rawTrend = bridgeGaps(forward.map((sample, index) => {
    const counterpart = reverse[index]!;
    const totalWeight = sample.weight + counterpart.weight;
    return totalWeight > 0
      ? (sample.value * sample.weight + counterpart.value * counterpart.weight) / totalWeight
      : null;
  }));
  const baseline = rawTrend.map((_value, index) => middleValue(
    rawTrend.slice(Math.max(0, index - 4), Math.min(rawTrend.length, index + 5))
  ));
  const residuals = rawTrend.map((value, index) => value - baseline[index]!);
  const residualCenter = middleValue(residuals);
  const mad = middleValue(residuals.map((value) => Math.abs(value - residualCenter)));
  const rawIqr = quantile(rawTrend, 0.75) - quantile(rawTrend, 0.25);
  const rawFractionNoise = Math.min(1, Math.max(0, 1.4826 * mad / Math.max(rawIqr, 0.10)));
  const forwardCoverage = anchorShare(fits.forward, threshold);
  const reverseCoverage = anchorShare(fits.reverse, threshold);
  const effectiveCoverage = Math.sqrt(forwardCoverage * reverseCoverage);
  const lowerMedianRSquared = Math.min(medianRSquared(fits.forward), medianRSquared(fits.reverse));
  const coverageDeficiency = Math.min(1, Math.max(0, (0.50 - effectiveCoverage) / 0.50));
  const rSquaredDeficiency = Math.min(1, Math.max(0, (0.95 - lowerMedianRSquared) / 0.45));
  const smoothingMultiplier = Math.min(30, Math.max(1,
    1 + 12 * coverageDeficiency ** 2 + 6 * rSquaredDeficiency ** 2 + 10 * rawFractionNoise ** 2
  ));
  return { rawFractionNoise, smoothingMultiplier };
}

function traceFromFits(records: DunnBranchFitRecord[], scanRate: number) {
  const firstPotential = records[0]!.potential;
  const potentialSpan = records.at(-1)!.potential - firstPotential;
  const source = records.map((record) => {
    const fit = record.fit;
    const usable = !record.trimmed && fit !== null && record.status !== "insufficientData"
      && record.status !== "zeroCurrentLogUnavailable" && record.status !== "regressionFailed";
    if (!usable || !Number.isFinite(fit.rSquared)) return null;
    const capacitive = Math.abs(fit.k1 * scanRate);
    const diffusion = Math.abs(fit.k2 * Math.sqrt(scanRate));
    const total = capacitive + diffusion;
    if (!Number.isFinite(total) || total === 0) return null;
    const rSquared = Math.min(1, Math.max(0, fit.rSquared));
    return {
      x: (record.potential - firstPotential) / potentialSpan,
      value: Math.min(1, Math.max(0, capacitive / total)),
      weight: 0.02 + 0.98 * rSquared * rSquared
    };
  });

  return Array.from({ length: 101 }, (_value, index) => {
    const x = index / 100;
    const upper = source.findIndex((sample) => sample !== null && sample.x >= x);
    const rightIndex = upper < 0 ? source.length - 1 : upper;
    const leftIndex = Math.max(0, rightIndex - 1);
    const left = source[leftIndex];
    const right = source[rightIndex];
    if (left === null || right === null) return { value: 0, weight: 0 };
    const distance = right.x - left.x;
    const portion = distance === 0 ? 0 : (x - left.x) / distance;
    return {
      value: left.value + portion * (right.value - left.value),
      weight: left.weight + portion * (right.weight - left.weight)
    };
  });
}

function bridgeGaps(values: Array<number | null>): number[] {
  const anchors = values.flatMap((value, index) => value === null ? [] : [index]);
  if (anchors.length === 0) throw new Error("reference fixture has no evidence");
  return values.map((value, index) => {
    if (value !== null) return value;
    const before = [...anchors].reverse().find((anchor) => anchor < index);
    const after = anchors.find((anchor) => anchor > index);
    if (before === undefined && after === undefined) {
      throw new Error("reference fixture has an unbridgeable gap");
    }
    if (before === undefined) {
      if (after === undefined) throw new Error("reference fixture has no right anchor");
      const rightValue = values[after];
      if (rightValue === null) throw new Error("reference fixture lost its right anchor");
      return rightValue;
    }
    if (after === undefined) {
      const leftValue = values[before];
      if (leftValue === null) throw new Error("reference fixture lost its left anchor");
      return leftValue;
    }
    const leftValue = values[before];
    const rightValue = values[after];
    if (leftValue === null || rightValue === null) throw new Error("reference fixture lost an anchor");
    return leftValue + (index - before) * (rightValue - leftValue) / (after - before);
  });
}

function middleValue(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1]! + ordered[middle]!) / 2
    : ordered[middle]!;
}

function quantile(values: number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const position = (ordered.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return ordered[lower]! + (position - lower) * (ordered[upper]! - ordered[lower]!);
}

function anchorShare(records: DunnBranchFitRecord[], threshold: number): number {
  const usable = records.filter((record) => record.fit !== null && !record.trimmed
    && record.status !== "insufficientData" && record.status !== "zeroCurrentLogUnavailable"
    && record.status !== "regressionFailed" && Number.isFinite(record.fit.rSquared));
  return usable.length === 0 ? 0 : usable.filter((record) => record.fit!.rSquared >= threshold).length / usable.length;
}

function medianRSquared(records: DunnBranchFitRecord[]): number {
  const values = records.flatMap((record) => record.fit !== null && !record.trimmed
    && record.status !== "insufficientData" && record.status !== "zeroCurrentLogUnavailable"
    && record.status !== "regressionFailed" && Number.isFinite(record.fit.rSquared)
    ? [Math.min(1, Math.max(0, record.fit.rSquared))]
    : []);
  return values.length === 0 ? 0 : middleValue(values);
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

  it("uses geometric coverage when branch evidence is asymmetric", () => {
    const result = stabilizeDunnFractions(
      makeFits({ forwardTrusted: 0.09, reverseTrusted: 0.05 }),
      10,
      "threshold",
      0.95
    );

    expect(result.diagnostics.forwardAnchorCoverage).toBeCloseTo(0.09, 12);
    expect(result.diagnostics.reverseAnchorCoverage).toBeCloseTo(0.05, 12);
    expect(result.diagnostics.effectiveAnchorCoverage).toBeCloseTo(Math.sqrt(0.09 * 0.05), 12);
    expect(result.diagnostics.effectiveAnchorCoverage).toBeLessThan((0.09 + 0.05) / 2);
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
    const fits = makeDiagnosticFits(fractions, 0.99);
    const expected = independentlyDeriveDiagnostics(fits, 1, 0.95);
    const result = stabilizeDunnFractions(fits, 1, "weighted", 0.95);

    expect(result.diagnostics.rawFractionNoise).toBeCloseTo(expected.rawFractionNoise, 12);
    expect(result.diagnostics.smoothingMultiplier).toBeCloseTo(expected.smoothingMultiplier, 12);
    expect(result.diagnostics.rawFractionNoise).toBeCloseTo(0.6786747611115942, 12);
    expect(result.diagnostics.smoothingMultiplier).toBeCloseTo(5.605994313698795, 12);
  });

  it("uses the 0.10 IQR floor and the lower smoothing bound for deterministic traces", () => {
    const smallRange = Array.from({ length: 101 }, (_value, index) =>
      Math.floor(index / 2) % 2 === 0 ? 0.48 : 0.52
    );
    const constant = Array.from({ length: 101 }, () => 0.5);
    const flooredFits = makeDiagnosticFits(smallRange, 0.99);
    const constantFits = makeDiagnosticFits(constant, 0.99);
    const flooredExpected = independentlyDeriveDiagnostics(flooredFits, 1, 0.95);
    const lowerBoundExpected = independentlyDeriveDiagnostics(constantFits, 1, 0.95);
    const flooredNoise = stabilizeDunnFractions(flooredFits, 1, "weighted", 0.95);
    const lowerBound = stabilizeDunnFractions(constantFits, 1, "weighted", 0.95);

    expect(flooredNoise.diagnostics.rawFractionNoise).toBeCloseTo(flooredExpected.rawFractionNoise, 12);
    expect(flooredNoise.diagnostics.smoothingMultiplier).toBeCloseTo(flooredExpected.smoothingMultiplier, 12);
    expect(flooredNoise.diagnostics.rawFractionNoise).toBeCloseTo(0.2714699044446374, 12);
    expect(lowerBound.diagnostics.rawFractionNoise).toBeCloseTo(lowerBoundExpected.rawFractionNoise, 12);
    expect(lowerBound.diagnostics.smoothingMultiplier).toBeCloseTo(lowerBoundExpected.smoothingMultiplier, 12);
    expect(lowerBound.diagnostics.rawFractionNoise).toBe(0);
    expect(lowerBound.diagnostics.smoothingMultiplier).toBe(1);
  });

  it("keeps the highest attainable bounded policy multiplier below the 30 cap", () => {
    const fractions = Array.from({ length: 101 }, (_value, index) => [1, 1, 1, 0, 0, 0][index % 6]!);
    const fits = makeDiagnosticFits(fractions, 0.5, false);
    const expected = independentlyDeriveDiagnostics(fits, 1, 0.95);
    const result = stabilizeDunnFractions(fits, 1, "weighted", 0.95);

    expect(result.diagnostics.rawFractionNoise).toBeCloseTo(expected.rawFractionNoise, 12);
    expect(result.diagnostics.smoothingMultiplier).toBeCloseTo(expected.smoothingMultiplier, 12);
    expect(result.diagnostics.smoothingMultiplier).toBe(29);
    expect(result.diagnostics.smoothingMultiplier).toBeLessThanOrEqual(30);
  });

  it("clips robust fraction noise at one", () => {
    const fractions = Array.from({ length: 101 }, (_value, index) => [1, 1, 1, 0, 0, 0][index % 6]!);
    const fits = makeDiagnosticFits(fractions, 0.99, false);
    const expected = independentlyDeriveDiagnostics(fits, 1, 0.95);
    const result = stabilizeDunnFractions(fits, 1, "weighted", 0.95);

    expect(result.diagnostics.rawFractionNoise).toBeCloseTo(expected.rawFractionNoise, 12);
    expect(result.diagnostics.smoothingMultiplier).toBeCloseTo(expected.smoothingMultiplier, 12);
    expect(result.diagnostics.rawFractionNoise).toBe(1);
  });
});
