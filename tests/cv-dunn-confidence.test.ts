import { describe, expect, it } from "vitest";
import {
  localCapacitiveFraction,
  makeDunnFractionGrid,
  rSquaredConfidence
} from "../src/lib/cvDunnConfidence";
import type { DunnFitGrid } from "../src/lib/cvTypes";

function makeFits(overrides: Partial<DunnFitGrid> = {}): DunnFitGrid {
  return {
    forward: [
      {
        branch: "forward",
        potential: 0,
        fit: { potential: 0, k1: 2, k2: 3, rSquared: 0.97, pointCount: 4 },
        status: "valid",
        trimmed: false
      },
      {
        branch: "forward",
        potential: 0.5,
        fit: { potential: 0.5, k1: 2, k2: -3, rSquared: 0.5, pointCount: 4 },
        status: "valid",
        trimmed: false
      },
      {
        branch: "forward",
        potential: 1,
        fit: null,
        status: "trimmed",
        trimmed: true
      }
    ],
    reverse: [
      {
        branch: "reverse",
        potential: 0,
        fit: null,
        status: "regressionFailed",
        trimmed: false
      }
    ],
    resolvedTurningPointTrim: 0,
    ...overrides
  };
}

describe("localCapacitiveFraction", () => {
  it("calculates and bounds the local Dunn fraction", () => {
    expect(localCapacitiveFraction(2, 3, 4)).toBeCloseTo(8 / 14, 12);
    expect(localCapacitiveFraction(2, -3, 4)).toBeCloseTo(8 / 14, 12);
    expect(localCapacitiveFraction(0, 0, 4)).toBeNull();
  });
});

describe("rSquaredConfidence", () => {
  it("makes threshold anchors strong without deleting low R² fits", () => {
    expect(rSquaredConfidence(0.97, "threshold", 0.95)).toBeGreaterThanOrEqual(1);
    expect(rSquaredConfidence(0.5, "threshold", 0.95)).toBeGreaterThan(0);
    expect(rSquaredConfidence(0.5, "threshold", 0.95)).toBeLessThan(0.1);
  });

  it("uses continuous positive confidence in weighted mode", () => {
    const low = rSquaredConfidence(0.1, "weighted", 0.95);
    const mid = rSquaredConfidence(0.5, "weighted", 0.95);
    const high = rSquaredConfidence(0.9, "weighted", 0.95);
    expect(0).toBeLessThan(low);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});

describe("makeDunnFractionGrid", () => {
  it("keeps low R² threshold fits with tiny positive confidence", () => {
    const result = makeDunnFractionGrid(makeFits(), 4, "threshold", 0.95);

    expect(result.forward[0]).toMatchObject({
      fraction: expect.closeTo(8 / 14, 12),
      confidence: expect.any(Number),
      rSquared: 0.97,
      trustedAnchor: true
    });
    expect(result.forward[1]).toMatchObject({
      fraction: expect.closeTo(8 / 14, 12),
      rSquared: 0.5,
      trustedAnchor: false
    });
    expect(result.forward[1].confidence).toBeGreaterThan(0);
    expect(result.forward[1].confidence).toBeLessThan(0.1);
  });

  it("marks trimmed and failed fits as zero confidence without a fraction", () => {
    const result = makeDunnFractionGrid(makeFits(), 4, "weighted", 0.95);

    expect(result.forward[2]).toEqual({
      fraction: null,
      confidence: 0,
      rSquared: null,
      trustedAnchor: false
    });
    expect(result.reverse[0]).toEqual({
      fraction: null,
      confidence: 0,
      rSquared: null,
      trustedAnchor: false
    });
  });

  it("gives failed records zero confidence even if coefficients are present", () => {
    const result = makeDunnFractionGrid(makeFits({
      reverse: [{
        branch: "reverse",
        potential: 0,
        fit: { potential: 0, k1: 2, k2: 3, rSquared: 0.99, pointCount: 4 },
        status: "regressionFailed",
        trimmed: false
      }]
    }), 4, "threshold", 0.95);

    expect(result.reverse[0]).toEqual({
      fraction: null,
      confidence: 0,
      rSquared: null,
      trustedAnchor: false
    });
  });
});
