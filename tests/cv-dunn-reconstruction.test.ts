import { expect, it } from "vitest";
import { optimizeSharedFraction, secondDifferenceRoughness } from "../src/lib/cvDunnReconstruction";

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
