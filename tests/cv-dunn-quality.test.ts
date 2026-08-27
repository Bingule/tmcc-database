import { describe, expect, it } from "vitest";
import {
  containCapacitiveCurrent,
  integrateMagnitude,
  isLowFitQuality,
  measureBranchOvershoot,
  measureEnvelopeViolation,
  projectCapacitiveToEnvelope,
  reconstructBranchCurrents,
  reconstructDunnContribution,
  validateDunnContribution
} from "../src/lib/cvDunnQuality";
import { normalizeCvCycle } from "../src/lib/cvCycle";
import type { CvAlignedBranchGrid, DunnContribution, DunnFitGrid, DunnFractionGrid } from "../src/lib/cvTypes";

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

it("applies a final signed physical containment safeguard", () => {
  expect(containCapacitiveCurrent(4, 4 + 1e-11)).toBe(4);
  expect(containCapacitiveCurrent(4, -1e-11)).toBe(0);
  expect(containCapacitiveCurrent(-4, -4 - 1e-11)).toBe(-4);
  expect(containCapacitiveCurrent(-4, 1e-11)).toBe(0);
  expect(containCapacitiveCurrent(0, 1e-11)).toBe(0);
});

it("measures signed and absolute branch overshoot", () => {
  expect(measureBranchOvershoot([4, -4, 0], [4.25, -4.5, 0.1])).toEqual({
    maximumPositiveOvershoot: 0.25,
    maximumNegativeOvershoot: 0.5,
    maximumAbsoluteOvershoot: 0.5,
    worstIndex: 1
  });
});

it("projects same-sign targets to the nearest feasible CV-envelope value", () => {
  expect(projectCapacitiveToEnvelope(4, 2, 1)).toEqual({
    envelopeLower: 2,
    envelopeUpper: 4,
    feasibleLower: 2,
    feasibleUpper: 4,
    targetCurrent: 1,
    constrainedCurrent: 2,
    correctionMagnitude: 1,
    effectiveFraction: 0.5
  });
  expect(projectCapacitiveToEnvelope(-4, -2, -1)).toEqual({
    envelopeLower: -4,
    envelopeUpper: -2,
    feasibleLower: -4,
    feasibleUpper: -2,
    targetCurrent: -1,
    constrainedCurrent: -2,
    correctionMagnitude: 1,
    effectiveFraction: 0.5
  });
});

it("leaves opposite-sign and already feasible shared-g targets unchanged", () => {
  expect(projectCapacitiveToEnvelope(4, -3, 1).constrainedCurrent).toBe(1);
  expect(projectCapacitiveToEnvelope(-4, 3, -1).constrainedCurrent).toBe(-1);
  expect(projectCapacitiveToEnvelope(4, 2, 3).correctionMagnitude).toBe(0);
});

it("measures signed and absolute residual envelope violation", () => {
  const diagnostics = measureEnvelopeViolation([
    { envelopeLower: -2, envelopeUpper: 3, capacitiveCurrent: 3.25 },
    { envelopeLower: -4, envelopeUpper: -1, capacitiveCurrent: -4.5 }
  ]);
  expect(diagnostics).toEqual({
    maximumUpperViolation: 0.25,
    maximumLowerViolation: 0.5,
    maximumAbsoluteViolation: 0.5,
    worstIndex: 1
  });
});

it("flags low fit quality below 50% coverage without deleting the result", () => {
  const forward = Array.from({ length: 100 }, (_, index) => index < 49 ? 0.96 : 0.5);
  const reverse = Array.from({ length: 100 }, () => 0.97);
  expect(isLowFitQuality(forward, reverse, 0.95)).toBe(true);
  expect(isLowFitQuality(reverse, reverse, 0.95)).toBe(false);
});

describe("reconstructDunnContribution", () => {
  it("inserts one shared zero record when a measured branch crosses zero", () => {
    const cycle = normalizeCvCycle([
      { potential: -1, current: -2 },
      { potential: 0, current: 2 },
      { potential: 1, current: 4 },
      { potential: 0, current: -2 },
      { potential: -1, current: -4 }
    ]);
    const alignedGrid = makeWideAlignedGrid(cycle);
    const contribution = reconstructDunnContribution({
      alignedGrid,
      dunnRecords: makeDunnRecords(alignedGrid.potentials),
      optimized: {
        g: [0.5, 0.5, 0.5],
        diagnostics: { baseLambda: 0.1, lambda: 0.1, smoothingMultiplier: 1, iterations: 12, converged: true, optimalityResidual: 0, fidelity: 0, roughness: 0 }
      },
      stabilization: makeStabilizationDiagnostics(),
      fractions: makeFractions(alignedGrid.potentials),
      scanRate: 1,
      seriesIndex: 0,
      mode: "threshold",
      threshold: 0.95,
      resolvedTurningPointTrim: 0.05
    });

    const zero = contribution.plotPath.find((record) => record.synthetic);
    expect(zero).toMatchObject({
      potential: -0.5,
      originalCurrent: 0,
      capacitiveCurrent: 0,
      diffusionCurrent: 0,
      branch: "forward",
      sourceIndex: null
    });
  });

  it("keeps every point from a multi-sample turning plateau in original plot order", () => {
    const cycle = normalizeCvCycle([
      { potential: 0, current: 1 },
      { potential: 1, current: 2 },
      { potential: 1, current: 3 },
      { potential: 1, current: 4 },
      { potential: 0, current: 5 },
      { potential: -1, current: 6 },
      { potential: 0, current: 7 }
    ]);
    const alignedGrid = makeWideAlignedGrid(cycle);

    const contribution = reconstructDunnContribution({
      alignedGrid,
      dunnRecords: makeDunnRecords(alignedGrid.potentials),
      optimized: {
        g: [0.25, 0.5, 0.75],
        diagnostics: { baseLambda: 0.1, lambda: 0.1, smoothingMultiplier: 1, iterations: 12, converged: true, optimalityResidual: 0, fidelity: 0, roughness: 0 }
      },
      stabilization: makeStabilizationDiagnostics(),
      fractions: makeFractions(alignedGrid.potentials),
      scanRate: 1,
      seriesIndex: 0,
      mode: "threshold",
      threshold: 0.95,
      resolvedTurningPointTrim: 0.05
    });

    expect(contribution.plotPath).toHaveLength(cycle.originalPoints.length);
    expect(contribution.plotPath.map((point) => point.potential)).toEqual([0, 1, 1, 1, 0, -1, 0]);
    expect(contribution.plotPath.map((point) => point.current)).toEqual([0.5, 1.5, 2.25, 3, 2.5, 1.5, 3.5]);
    expect(contribution.plotPath.map((point) => point.originalCurrent)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(contribution.plotPath.map((point) => point.diffusionCurrent)).toEqual([0.5, 0.5, 0.75, 1, 2.5, 4.5, 3.5]);
    expect(contribution.plotPath.every((point) => point.capacitiveCurrent === point.current)).toBe(true);
    expect(contribution.plotPath.map((point) => point.branch)).toEqual([
      "forward",
      "forward",
      "forward",
      "reverse",
      "reverse",
      "reverse",
      "forward"
    ]);
  });

  it("keeps a seam-started closing sample in original plot order", () => {
    const cycle = normalizeCvCycle([
      { potential: -0.5, current: 1 },
      { potential: 0, current: 2 },
      { potential: -0.5, current: 3 },
      { potential: -1, current: 4 },
      { potential: -0.75, current: 5 },
      { potential: -0.5, current: 6 }
    ]);
    const alignedGrid = makeAlignedGrid(cycle);

    const contribution = reconstructDunnContribution({
      alignedGrid,
      dunnRecords: makeDunnRecords(alignedGrid.potentials),
      optimized: {
        g: [0.25, 0.5, 0.75],
        diagnostics: { baseLambda: 0.1, lambda: 0.1, smoothingMultiplier: 1, iterations: 12, converged: true, optimalityResidual: 0, fidelity: 0, roughness: 0 }
      },
      stabilization: makeStabilizationDiagnostics(),
      fractions: makeFractions(alignedGrid.potentials),
      scanRate: 1,
      seriesIndex: 0,
      mode: "threshold",
      threshold: 0.95,
      resolvedTurningPointTrim: 0.05
    });

    expect(contribution.plotPath).toHaveLength(cycle.originalPoints.length);
    expect(contribution.plotPath.map((point) => point.potential)).toEqual([-0.5, 0, -0.5, -1, -0.75, -0.5]);
    expect(contribution.plotPath.map((point) => point.current)).toEqual([0.5, 1.5, 1.5, 1, 1.875, 3]);
    expect(contribution.plotPath.map((point) => point.branch)).toEqual([
      "forward",
      "forward",
      "reverse",
      "reverse",
      "forward",
      "forward"
    ]);
  });

  it("rejects plot paths that do not preserve original order", () => {
    const contribution = makeCompleteContribution();
    contribution.plotPath = [
      orderedRecord(0, 2, 1, "forward", 0),
      orderedRecord(-1, -2, -1, "reverse", 1)
    ];

    expect(() => validateDunnContribution(contribution)).toThrow("invalidDataShape");
  });

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
      optimized: { g: [0.25, 0.5, 0.75], diagnostics: { baseLambda: 0.1, lambda: 0.1, smoothingMultiplier: 1, iterations: 12, converged: true, optimalityResidual: 0, fidelity: 0, roughness: 0 } },
      stabilization: makeStabilizationDiagnostics(),
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
    expect(contribution.plotPath.map(({ potential, current, branch }) => ({ potential, current, branch }))).toEqual([
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
      qualityPassed: false,
      forwardAnchorCoverage: 0.8,
      reverseAnchorCoverage: 0.7,
      effectiveAnchorCoverage: Math.sqrt(0.8 * 0.7),
      lowerMedianRSquared: 0.96,
      rawFractionNoise: 0.2,
      confidenceBlend: 0.1,
      smoothingMultiplier: 1,
      baseLambda: 0.1,
      effectiveLambda: 0.1,
      maximumPositiveOvershoot: 0,
      maximumNegativeOvershoot: 0,
      maximumAbsoluteOvershoot: 0
    });
    expect(contribution.diagnostics!.forwardAboveThresholdPercent).toBeCloseTo(200 / 3, 12);
  });

  it.each([
    ["forwardAnchorCoverage", -0.01],
    ["reverseAnchorCoverage", 1.01],
    ["effectiveAnchorCoverage", Number.NaN],
    ["lowerMedianRSquared", 1.01],
    ["rawFractionNoise", -0.01],
    ["confidenceBlend", 1.01],
    ["smoothingMultiplier", 30.01],
    ["baseLambda", 0],
    ["effectiveLambda", Number.POSITIVE_INFINITY]
  ] as const)("rejects invalid %s diagnostics", (field, value) => {
    const contribution = makeCompleteContribution();
    contribution.diagnostics[field] = value;
    expect(() => validateDunnContribution(contribution)).toThrow("invalidDataShape");
  });

  it("fails validation when any residual containment overshoot exceeds tolerance", () => {
    const contribution = makeCompleteContribution();
    contribution.diagnostics.maximumPositiveOvershoot = 1e-4;
    contribution.diagnostics.maximumAbsoluteOvershoot = 1e-4;
    expect(() => validateDunnContribution(contribution)).toThrow("reconstructionFailed");
  });
});

function makeAlignedGrid(cycle: CvAlignedBranchGrid["cycles"][number]): CvAlignedBranchGrid {
  return {
    potentials: [-1, -0.5, 0],
    scanRates: [1, 2, 4],
    forwardCurrents: [[4, 1, 2], [8, 2, 4], [16, 4, 8]],
    reverseCurrents: [[4, 3, 2], [8, 6, 4], [16, 12, 8]],
    commonMinimum: -1,
    commonMaximum: 0,
    nativePotentialInterval: 0.25,
    resolvedPotentialInterval: 0.5,
    cycles: [cycle, cycle, cycle]
  };
}

function makeWideAlignedGrid(cycle: CvAlignedBranchGrid["cycles"][number]): CvAlignedBranchGrid {
  return {
    potentials: [-1, 0, 1],
    scanRates: [1, 2, 4],
    forwardCurrents: [[6, 1, 2], [12, 2, 4], [24, 4, 8]],
    reverseCurrents: [[6, 5, 2], [12, 10, 4], [24, 20, 8]],
    commonMinimum: -1,
    commonMaximum: 1,
    nativePotentialInterval: 1,
    resolvedPotentialInterval: 1,
    cycles: [cycle, cycle, cycle]
  };
}

function makeDunnRecords(potentials: number[]): DunnFitGrid {
  return {
    forward: potentials.map((potential) => ({
      branch: "forward",
      potential,
      fit: { potential, k1: 1, k2: 1, rSquared: 0.98, pointCount: 3 },
      status: "valid",
      trimmed: false
    })),
    reverse: potentials.map((potential) => ({
      branch: "reverse",
      potential,
      fit: { potential, k1: 1, k2: 1, rSquared: 0.98, pointCount: 3 },
      status: "valid",
      trimmed: false
    })),
    resolvedTurningPointTrim: 0.05
  };
}

function makeFractions(potentials: number[]): DunnFractionGrid {
  return {
    forward: potentials.map(() => ({ fraction: 0.5, confidence: 1, rSquared: 0.98, trustedAnchor: true })),
    reverse: potentials.map(() => ({ fraction: 0.5, confidence: 1, rSquared: 0.98, trustedAnchor: true }))
  };
}

function makeStabilizationDiagnostics() {
  return {
    forwardAnchorCoverage: 0.8,
    reverseAnchorCoverage: 0.7,
    effectiveAnchorCoverage: Math.sqrt(0.8 * 0.7),
    lowerMedianRSquared: 0.96,
    rawFractionNoise: 0.2,
    confidenceBlend: 0.1,
    smoothingMultiplier: 1
  };
}

function makeCompleteContribution(): DunnContribution {
  return {
    scanRate: 1,
    potentialGrid: [-1, 0],
    g: [0.5, 0.5],
    originalForward: [2, 2],
    originalReverse: [-2, -2],
    capacitiveForward: [1, 1],
    capacitiveReverse: [-1, -1],
    diffusionForward: [1, 1],
    diffusionReverse: [-1, -1],
    plotPath: [
      orderedRecord(-1, 2, 1, "forward", 0),
      orderedRecord(0, 2, 1, "forward", 1),
      orderedRecord(0, -2, -1, "reverse", 2),
      orderedRecord(-1, -2, -1, "reverse", 3)
    ],
    capacitivePercent: 50,
    diffusionPercent: 50,
    diagnostics: {
      mode: "threshold",
      threshold: 0.95,
      resolvedPotentialInterval: 1,
      resolvedTurningPointTrim: 0,
      commonMinimum: -1,
      commonMaximum: 0,
      medianForwardRSquared: 0.98,
      medianReverseRSquared: 0.98,
      forwardAboveThresholdPercent: 100,
      reverseAboveThresholdPercent: 100,
      lowFitQuality: false,
      scanRateWarning: true,
      qualityPassed: false,
      forwardAnchorCoverage: 0.8,
      reverseAnchorCoverage: 0.7,
      effectiveAnchorCoverage: Math.sqrt(0.8 * 0.7),
      lowerMedianRSquared: 0.96,
      rawFractionNoise: 0.2,
      confidenceBlend: 0.1,
      smoothingMultiplier: 1,
      baseLambda: 0.1,
      effectiveLambda: 0.1,
      maximumPositiveOvershoot: 0,
      maximumNegativeOvershoot: 0,
      maximumAbsoluteOvershoot: 0
    }
  };
}

function orderedRecord(
  potential: number,
  originalCurrent: number,
  capacitiveCurrent: number,
  branch: "forward" | "reverse",
  sourceIndex: number
): DunnContribution["plotPath"][number] {
  return {
    potential,
    current: capacitiveCurrent,
    originalCurrent,
    capacitiveCurrent,
    diffusionCurrent: originalCurrent - capacitiveCurrent,
    g: originalCurrent === 0 ? 0 : capacitiveCurrent / originalCurrent,
    branch,
    sourceIndex,
    synthetic: false
  };
}
