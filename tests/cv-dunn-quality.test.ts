import { describe, expect, it } from "vitest";
import {
  integrateMagnitude,
  isLowFitQuality,
  reconstructBranchCurrents,
  reconstructDunnContribution
} from "../src/lib/cvDunnQuality";
import type { CvAlignedBranchGrid, DunnFitGrid, DunnFractionGrid } from "../src/lib/cvTypes";

it("reconstructs signed bounded currents from the same g", () => {
  const g = [0.25, 0.5, 0.75];
  const forward = [-4, 2, 8];
  const reverse = [-8, -2, 4];
  expect(reconstructBranchCurrents(forward, g).capacitive).toEqual([-1, 1, 6]);
  expect(reconstructBranchCurrents(reverse, g).capacitive).toEqual([-2, -1, 3]);
});

it("uses magnitude trapezoidal integration on both branches", () => {
  const potentials = [0, 1];
  const totalArea = integrateMagnitude(potentials, [2, 2]) + integrateMagnitude(potentials, [-2, -2]);
  const capacitiveArea = integrateMagnitude(potentials, [0.5, 0.5]) + integrateMagnitude(potentials, [-0.5, -0.5]);
  expect(totalArea).toBe(4);
  expect(capacitiveArea).toBe(1);
  expect(100 * capacitiveArea / totalArea).toBe(25);
});

it("rejects magnitude or sign violations", () => {
  expect(() => reconstructBranchCurrents([1], [-0.5])).toThrow("reconstructionFailed");
});

it("flags low fit quality below 50% coverage without deleting the result", () => {
  const forward = Array.from({ length: 100 }, (_, index) => index < 49 ? 0.96 : 0.5);
  const reverse = Array.from({ length: 100 }, () => 0.97);
  expect(isLowFitQuality(forward, reverse, 0.95)).toBe(true);
  expect(isLowFitQuality(reverse, reverse, 0.95)).toBe(false);
});

describe("reconstructDunnContribution", () => {
  it("reconnects capacitive current in original CV order while keeping branch currents separate", () => {
    const cycle = {
      originalPoints: [
        { potential: -0.25, current: 4 },
        { potential: 1.1, current: 10 },
        { potential: 0.25, current: -8 },
        { potential: -1.1, current: -10 }
      ],
      selectedStartIndex: 0,
      selectedEndIndex: 3,
      ignoredPointCount: 0,
      nativePotentialInterval: 0.5,
      forward: {
        kind: "forward" as const,
        direction: 1 as const,
        points: [
          { potential: -0.25, current: 4, sourceIndex: 0 },
          { potential: 1.1, current: 10, sourceIndex: 1 }
        ]
      },
      reverse: {
        kind: "reverse" as const,
        direction: -1 as const,
        points: [
          { potential: 0.25, current: -8, sourceIndex: 2 },
          { potential: -1.1, current: -10, sourceIndex: 3 }
        ]
      },
      turningPotentials: [1, -1]
    };
    const alignedGrid: CvAlignedBranchGrid = {
      potentials: [-1, 0, 1],
      scanRates: [1, 2, 4],
      forwardCurrents: [[-4, 2, 8], [-8, 4, 16], [-16, 8, 32]],
      reverseCurrents: [[-8, -2, 4], [-16, -4, 8], [-32, -8, 16]],
      commonMinimum: -1,
      commonMaximum: 1,
      nativePotentialInterval: 0.5,
      resolvedPotentialInterval: 1,
      cycles: [cycle, cycle, cycle]
    };
    const dunnRecords: DunnFitGrid = {
      forward: [
        { branch: "forward", potential: -1, fit: { potential: -1, k1: 1, k2: 1, rSquared: 0.96, pointCount: 3 }, status: "valid", trimmed: false },
        { branch: "forward", potential: 0, fit: { potential: 0, k1: 1, k2: 1, rSquared: 0.94, pointCount: 3 }, status: "valid", trimmed: false },
        { branch: "forward", potential: 1, fit: { potential: 1, k1: 1, k2: 1, rSquared: 0.98, pointCount: 3 }, status: "valid", trimmed: false }
      ],
      reverse: [
        { branch: "reverse", potential: -1, fit: { potential: -1, k1: 1, k2: 1, rSquared: 0.97, pointCount: 3 }, status: "valid", trimmed: false },
        { branch: "reverse", potential: 0, fit: { potential: 0, k1: 1, k2: 1, rSquared: 0.99, pointCount: 3 }, status: "valid", trimmed: false },
        { branch: "reverse", potential: 1, fit: { potential: 1, k1: 1, k2: 1, rSquared: 0.95, pointCount: 3 }, status: "valid", trimmed: false }
      ],
      resolvedTurningPointTrim: 0.05
    };
    const fractions: DunnFractionGrid = {
      forward: [
        { fraction: 0.25, confidence: 1, rSquared: 0.96, trustedAnchor: true },
        { fraction: 0.5, confidence: 0.01, rSquared: 0.94, trustedAnchor: false },
        { fraction: 0.75, confidence: 1, rSquared: 0.98, trustedAnchor: true }
      ],
      reverse: [
        { fraction: 0.25, confidence: 1, rSquared: 0.97, trustedAnchor: true },
        { fraction: 0.5, confidence: 1, rSquared: 0.99, trustedAnchor: true },
        { fraction: 0.75, confidence: 1, rSquared: 0.95, trustedAnchor: true }
      ]
    };

    const contribution = reconstructDunnContribution({
      alignedGrid,
      dunnRecords,
      optimized: { g: [0.25, 0.5, 0.75], diagnostics: { lambda: 0.1, iterations: 12, converged: true, fidelity: 0, roughness: 0 } },
      fractions,
      scanRate: 1,
      seriesIndex: 0,
      mode: "threshold",
      threshold: 0.95,
      resolvedTurningPointTrim: 0.05
    });

    expect(contribution.originalForward).toEqual([-4, 2, 8]);
    expect(contribution.originalReverse).toEqual([-8, -2, 4]);
    expect(contribution.capacitiveForward).toEqual([-1, 1, 6]);
    expect(contribution.capacitiveReverse).toEqual([-2, -1, 3]);
    expect(contribution.diffusionForward).toEqual([-3, 1, 2]);
    expect(contribution.diffusionReverse).toEqual([-6, -1, 1]);
    expect(contribution.capacitivePercent).toBeCloseTo(50, 12);
    expect(contribution.diffusionPercent).toBeCloseTo(50, 12);
    expect(contribution.plotPath).toEqual([
      { potential: -0.25, current: 1.75, branch: "forward" },
      { potential: 1.1, current: 7.5, branch: "forward" },
      { potential: 0.25, current: -4.5, branch: "reverse" },
      { potential: -1.1, current: -2.5, branch: "reverse" }
    ]);
    expect(contribution.diagnostics).toBeDefined();
    expect(contribution.diagnostics).toMatchObject({
      mode: "threshold",
      threshold: 0.95,
      resolvedPotentialInterval: 1,
      resolvedTurningPointTrim: 0.05,
      commonMinimum: -1,
      commonMaximum: 1,
      medianForwardRSquared: 0.96,
      medianReverseRSquared: 0.97,
      reverseAboveThresholdPercent: 100,
      lowFitQuality: false,
      scanRateWarning: true,
      qualityPassed: false
    });
    expect(contribution.diagnostics!.forwardAboveThresholdPercent).toBeCloseTo(200 / 3, 12);
  });
});
