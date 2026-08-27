import { expect, it } from "vitest";
import {
  envelopePenalty,
  optimizeSharedFraction,
  refineSharedFractionWithSoftEnvelope,
  secondDifferenceRoughness
} from "../src/lib/cvDunnReconstruction";

const point = (fraction: number, confidence = 1) => ({
  fraction,
  confidence,
  rSquared: 1,
  trustedAnchor: true
});

it("uses one bounded shared fraction influenced by both branches", () => {
  const result = optimizeSharedFraction({
    forward: [point(0.2), point(0.4), point(0.6)],
    reverse: [point(0.4), point(0.6), point(0.8)]
  }, [0, 0.01, 0.02]);
  expect(result.g).toHaveLength(3);
  expect(result.g.every((value) => value >= 0 && value <= 1)).toBe(true);
  expect(result.diagnostics.optimalityResidual).toBeLessThanOrEqual(1e-6);
  expect(result.g[1]).toBeCloseTo(0.5, 1);
});

it("explicit second-difference regularization suppresses an isolated spike", () => {
  const raw = [0.3, 0.3, 0.95, 0.3, 0.3];
  const result = optimizeSharedFraction({
    forward: raw.map((value) => point(value, 0.2)),
    reverse: raw.map((value) => point(value, 0.2))
  }, [0, 0.002, 0.004, 0.006, 0.008]);
  expect(result.g[2]).toBeLessThan(0.95);
  expect(secondDifferenceRoughness(result.g)).toBeLessThan(secondDifferenceRoughness(raw));
  expect(result.diagnostics.lambda).toBeGreaterThan(0);
});

it("softly corrects same-sign envelope violations without forcing a hard boundary", () => {
  const baselineG = [0.7, 0.7, 0.7, 0.7, 0.7];
  const forwardCurrents = [-45, -44, -43, -42, -41];
  const reverseCurrents = [-84, -80, -76, -72, -68];
  const result = refineSharedFractionWithSoftEnvelope({
    baselineG,
    potentials: [0, 0.25, 0.5, 0.75, 1],
    forwardCurrents,
    reverseCurrents,
    baselineLambda: 1e-4
  });

  expect(result.g.every((value) => value > 0.7 && value < 1)).toBe(true);
  expect(result.g.some((value, index) =>
    Math.abs(value * forwardCurrents[index] - forwardCurrents[index]) > 1e-6
  )).toBe(true);
  expect(result.diagnostics.maximumSharedFractionAdjustment).toBeGreaterThan(0);
});

it("uses a tolerance dead zone and a quadratic envelope penalty", () => {
  const tolerance = 1e-10;
  expect(envelopePenalty(2 + tolerance / 2, 1, 2, tolerance)).toBe(0);
  const small = envelopePenalty(2.1, 1, 2, tolerance);
  const large = envelopePenalty(2.2, 1, 2, tolerance);
  expect(large).toBeCloseTo(4 * small, 8);
});

it("reuses the baseline exactly when it already satisfies the soft envelope", () => {
  const baselineG = [0.4, 0.55, 0.5, 0.6, 0.45];
  const result = refineSharedFractionWithSoftEnvelope({
    baselineG,
    potentials: [0, 0.25, 0.5, 0.75, 1],
    forwardCurrents: [2, 3, 4, 3, 2],
    reverseCurrents: [-2, -3, -4, -3, -2],
    baselineLambda: 1e-4
  });

  expect(result.g).toEqual(baselineG);
  expect(result.diagnostics.iterations).toBe(0);
  expect(result.diagnostics.maximumSharedFractionAdjustment).toBe(0);
});

it("keeps soft-envelope smoothing stable across potential-grid density", () => {
  const solve = (count: number) => {
    const potentials = Array.from({ length: count }, (_value, index) => index / (count - 1));
    const baselineG = potentials.map((x) => 0.55 + 0.08 * Math.sin(2 * Math.PI * x));
    return refineSharedFractionWithSoftEnvelope({
      baselineG,
      potentials,
      forwardCurrents: potentials.map((x) => -2 - x),
      reverseCurrents: potentials.map((x) => -4 - x),
      baselineLambda: 1e-4
    }).g;
  };
  const coarse = solve(51);
  const dense = solve(501);

  for (const position of [0, 0.25, 0.5, 0.75, 1]) {
    expect(Math.abs(
      sampleNormalized(coarse, position) - sampleNormalized(dense, position)
    )).toBeLessThan(0.02);
  }
});

it("calculates roughness in normalized-potential units", () => {
  expect(secondDifferenceRoughness([0, 0.25, 1], [0, 0.25, 1])).toBeCloseTo(0, 12);
  expect(secondDifferenceRoughness([0, 0.25, 1])).toBeGreaterThan(0);
});

it("integrates curvature independently of potential-grid density", () => {
  const coarseX = [0, 0.01, 0.5, 0.99, 1];
  const denseX = Array.from({ length: 101 }, (_value, index) => index / 100);

  expect(secondDifferenceRoughness(
    coarseX.map((x) => x * x), coarseX
  )).toBeCloseTo(secondDifferenceRoughness(
    denseX.map((x) => x * x), denseX
  ), 3);
});

it("applies the stabilization smoothing multiplier to the selected base lambda", () => {
  const potentials = Array.from({ length: 51 }, (_value, index) => index / 50);
  const raw = potentials.map((x) => Math.min(1, Math.max(0,
    0.5 + 0.2 * Math.sin(2 * Math.PI * x) + 0.12 * Math.sin(22 * Math.PI * x)
  )));
  const fractions = {
    forward: raw.map((value) => point(value, 0.6)),
    reverse: raw.map((value) => point(value, 0.6))
  };

  const base = optimizeSharedFraction(fractions, potentials, 1);
  const strong = optimizeSharedFraction(fractions, potentials, 20);

  expect(strong.diagnostics.lambda).toBeCloseTo(strong.diagnostics.baseLambda * 20, 12);
  expect(strong.diagnostics.roughness).toBeLessThan(base.diagnostics.roughness);
});

it("is stable when the same noisy function is sampled on coarse and dense grids", () => {
  const solve = (pointCount: number) => {
    const potentials = Array.from({ length: pointCount }, (_value, index) => index / (pointCount - 1));
    const raw = potentials.map((x) => Math.min(1, Math.max(0,
      0.45 + 0.22 * Math.sin(2 * Math.PI * x) + 0.08 * Math.sin(34 * Math.PI * x)
    )));
    return optimizeSharedFraction({
      forward: raw.map((value) => point(value, 0.7)),
      reverse: raw.map((value) => point(value, 0.7))
    }, potentials, 1).g;
  };
  const coarse = solve(51);
  const dense = solve(501);

  for (const position of [0, 0.25, 0.5, 0.75, 1]) {
    expect(Math.abs(
      sampleNormalized(coarse, position) - sampleNormalized(dense, position)
    )).toBeLessThan(0.02);
  }
});

it("solves a production-sized shared fraction grid within the regression budget", () => {
  const pointCount = 871;
  const potentials = Array.from({ length: pointCount }, (_value, index) => index / (pointCount - 1));
  const fractions = {
    forward: potentials.map((x) => point(Math.min(1, Math.max(0,
      0.46
      + 0.18 * Math.sin(2 * Math.PI * x)
      + 0.05 * Math.cos(6 * Math.PI * x)
      + 0.03 * Math.sin(70 * Math.PI * x)
    )), 0.75)),
    reverse: potentials.map((x) => point(Math.min(1, Math.max(0,
      0.44
      + 0.18 * Math.sin(2 * Math.PI * x)
      + 0.05 * Math.cos(6 * Math.PI * x)
      - 0.03 * Math.sin(70 * Math.PI * x)
    )), 0.7))
  };
  const startedAt = performance.now();

  const result = optimizeSharedFraction(fractions, potentials, 12);
  const elapsedMilliseconds = performance.now() - startedAt;

  expect(result.g).toHaveLength(pointCount);
  expect(result.g.every((value) => value >= 0 && value <= 1)).toBe(true);
  expect(result.diagnostics.baseLambda).toBe(1e-4);
  expect(result.diagnostics.optimalityResidual).toBeLessThanOrEqual(1e-6);
  expect(result.diagnostics.roughness).toBeLessThan(secondDifferenceRoughness(
    fractions.forward.map(({ fraction }) => fraction!)
  ));
  expect(elapsedMilliseconds).toBeLessThan(6_000);
}, 30_000);

it("completes the full L-curve for a 5001-point constant target with sparse zero weights", () => {
  const pointCount = 5_001;
  const potentials = Array.from({ length: pointCount }, (_value, index) => index / (pointCount - 1));
  const missing = { fraction: null, confidence: 0, rSquared: null, trustedAnchor: false };
  const fractions = {
    forward: potentials.map((_potential, index) =>
      index < 26 || index >= pointCount - 26 ? missing : point(1, 5)),
    reverse: potentials.map((_potential, index) =>
      index < 26 || index >= pointCount - 26 ? missing : point(1, 5))
  };

  const result = optimizeSharedFraction(fractions, potentials);

  expect(result.g).toHaveLength(pointCount);
  expect(result.g.every((value) => value >= 0 && value <= 1)).toBe(true);
  expect(result.diagnostics.converged).toBe(true);
  expect(result.diagnostics.optimalityResidual).toBeLessThanOrEqual(1e-6);
}, 30_000);

it("preserves a linear normalized-potential ramp on a nonuniform grid", () => {
  const potentials = [0, 0.25, 1];
  const result = optimizeSharedFraction({
    forward: potentials.map((value) => point(value, 0.4)),
    reverse: potentials.map((value) => point(value, 0.4))
  }, potentials);
  expect(result.g[1]).toBeCloseTo(0.25, 8);
  expect(result.diagnostics.roughness).toBeCloseTo(0, 10);
});

it("bridges zero-confidence regions without holes", () => {
  const missing = { fraction: null, confidence: 0, rSquared: null, trustedAnchor: false };
  const result = optimizeSharedFraction({
    forward: [point(0.2), missing, missing, point(0.8)],
    reverse: [point(0.2), missing, missing, point(0.8)]
  }, [0, 0.01, 0.02, 0.03]);
  expect(result.g.every(Number.isFinite)).toBe(true);
  expect(result.g[1]).toBeGreaterThan(0.2);
  expect(result.g[2]).toBeLessThan(0.8);
});

it("is deterministic", () => {
  const input = { forward: [point(0.1), point(0.9)], reverse: [point(0.2), point(0.8)] };
  expect(optimizeSharedFraction(input, [0, 0.01])).toEqual(optimizeSharedFraction(input, [0, 0.01]));
});

it("rejects invalid reconstruction inputs", () => {
  expect(() => optimizeSharedFraction({
    forward: [point(Number.NaN)],
    reverse: [point(0.2)]
  }, [0])).toThrow("invalidDataShape");
  expect(() => optimizeSharedFraction({
    forward: [point(0.2, Number.NaN)],
    reverse: [point(0.2)]
  }, [0])).toThrow("invalidDataShape");
  expect(() => optimizeSharedFraction({
    forward: [point(0.2), point(0.3)],
    reverse: [point(0.2), point(0.3)]
  }, [0, Number.NaN])).toThrow("invalidDataShape");
});

it("rejects reconstruction without positive confidence", () => {
  const missing = { fraction: null, confidence: 0, rSquared: null, trustedAnchor: false };
  expect(() => optimizeSharedFraction({
    forward: [missing, missing, missing],
    reverse: [missing, missing, missing]
  }, [0, 0.5, 1])).toThrow("reconstructionFailed");
});

it("rejects smoothing multipliers outside the stabilization range", () => {
  const fractions = {
    forward: [point(0.2), point(0.8)],
    reverse: [point(0.2), point(0.8)]
  };
  expect(() => optimizeSharedFraction(fractions, [0, 1], 0.99)).toThrow("invalidDataShape");
  expect(() => optimizeSharedFraction(fractions, [0, 1], 30.01)).toThrow("invalidDataShape");
  expect(() => optimizeSharedFraction(fractions, [0, 1], Number.NaN)).toThrow("invalidDataShape");
});

it("rejects an incomplete L-curve when any candidate fails", () => {
  const potentials = [0, 1e-4, 2e-4, 0.25, 0.5, 0.75, 1];
  const raw = [0.2, 0.8, 0.1, 0.9, 0.15, 0.85, 0.3];

  expect(() => optimizeSharedFraction({
    forward: raw.map((value) => point(value, 0.8)),
    reverse: raw.map((value) => point(value, 0.7))
  }, potentials, 1)).toThrow("reconstructionFailed");
});

function sampleNormalized(values: number[], position: number): number {
  const scaledIndex = position * (values.length - 1);
  const leftIndex = Math.floor(scaledIndex);
  const rightIndex = Math.ceil(scaledIndex);
  if (leftIndex === rightIndex) return values[leftIndex];
  const fraction = scaledIndex - leftIndex;
  return values[leftIndex] + fraction * (values[rightIndex] - values[leftIndex]);
}
