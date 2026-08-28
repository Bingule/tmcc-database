import { describe, expect, it } from "vitest";
import { makeDunnFractionGrid } from "../src/lib/cvDunnConfidence";
import { secondDifferenceRoughness } from "../src/lib/cvDunnReconstruction";
import { pchipInterpolate } from "../src/lib/cvInterpolation";
import { analyzeCvWorkflow } from "../src/lib/cvWorkflow";
import { CvAnalysisError, type CvAnalysisSettings, type CvSeries, type CvWorkflowResult, type DunnFractionGrid } from "../src/lib/cvTypes";
import {
  makeBp150RegressionSeries,
  makeNcpRegressionSeries,
  makeResolutionStabilitySeries,
  makeSyntheticConstrainedDunnSeries,
  makeTurningPointRecoverySeries
} from "./fixtures/cvRegressionData";
import { makeThreePeakNcpLikeSeries } from "./fixtures/cvPeakData";

function expectCvError(action: () => unknown, code: CvAnalysisError["code"]) {
  try {
    action();
    throw new Error("expectedCvAnalysisError");
  } catch (error) {
    expect(error).toBeInstanceOf(CvAnalysisError);
    expect((error as CvAnalysisError).code).toBe(code);
  }
}

function makeLowQualitySeries(): CvSeries[] {
  const scanRates = [1, 4, 9, 16];
  const amplitudes = [1, 10, 2, 20];
  const potentials = makeWorkflowLoopPotentials();
  return scanRates.map((scanRate, seriesIndex) => ({
    label: String(scanRate),
    scanRate,
    points: potentials.map((potential, pointIndex) => ({
      potential,
      current: amplitudes[seriesIndex] * (1.5 + potential) + 0.1 * pointIndex
    }))
  }));
}

function makePowerLawLoop(options: {
  scanRates?: number[];
  distortForwardMiddle?: boolean;
  distortReverseMiddle?: boolean;
} = {}): CvSeries[] {
  const scanRates = options.scanRates ?? [1, 4, 9, 16];
  const potentials = makeWorkflowLoopPotentials();
  return scanRates.map((scanRate, seriesIndex) => ({
    label: String(scanRate),
    scanRate,
    points: potentials.map((potential, pointIndex) => {
      if (options.distortForwardMiddle && pointIndex === 10) {
        return { potential, current: [1, 100, 2, 50][seriesIndex]! };
      }
      if (options.distortReverseMiddle && pointIndex === 30) {
        return { potential, current: [1, 100, 2, 50][seriesIndex]! };
      }
      return {
        potential,
        current: (1 + pointIndex) * scanRate + (2 + pointIndex) * Math.sqrt(scanRate)
      };
    })
  }));
}

function makeWorkflowLoopPotentials(): number[] {
  const forward = Array.from({ length: 21 }, (_, index) => -1 + index / 20);
  return [...forward, ...forward.slice(0, -1).reverse()];
}

function makeMismatchedEndpointTailSeries(): CvSeries[] {
  const forward = Array.from({ length: 998 }, (_, index) => -0.997 + index * 0.001);
  const reverse = Array.from({ length: 1001 }, (_, index) => -index * 0.001);
  const potentials = [...forward, ...reverse.slice(1)];
  return [2, 5, 10].map((scanRate) => ({
    label: String(scanRate),
    scanRate,
    points: potentials.map((potential, pointIndex) => {
      const direction = pointIndex < forward.length ? 1 : -1;
      return {
        potential,
        current: direction * (
          (1.25 + potential) * scanRate
          + (0.5 + 0.2 * potential) * Math.sqrt(scanRate)
        )
      };
    })
  }));
}

const settings: CvAnalysisSettings = {
  potentialInterval: { mode: "auto" },
  rSquaredThreshold: 0.95,
  dunnConfidenceMode: "threshold",
  turningPointTrim: { mode: "auto" }
};

describe("analyzeCvWorkflow quality records", () => {
  it("adds peak-resolved b-value fits without changing the existing potential-resolved outputs", () => {
    const series = makeThreePeakNcpLikeSeries();
    const result = analyzeCvWorkflow(series, settings);

    expect(result.peakAnalysis.fits).toHaveLength(3);
    expect(result.peakAnalysis.fits.every((fit) => fit.points.length === series.length)).toBe(true);
    expect(result.bRecords.length).toBe(result.analysisGrid.potentials.length);
    expect(result.dunnRecords.forward).toHaveLength(result.alignedGrid.potentials.length);
    expect(result.dunnRecords.reverse).toHaveLength(result.alignedGrid.potentials.length);
  });

  it("keeps b-value threshold filtering while retaining low-R2 Dunn fits", () => {
    const result = analyzeCvWorkflow(makeLowQualitySeries(), settings);
    expect(result.bRecords.some((record) => record.status === "belowRSquaredThreshold")).toBe(true);
    expect(result.dunnRecords.forward.some((record) => (record.fit?.rSquared ?? 1) < 0.95)).toBe(true);
    expect(result.contributions.every((item) => item.g.every(Number.isFinite))).toBe(true);
  });

  it("weighted Dunn mode does not change b-value filtering", () => {
    const threshold = analyzeCvWorkflow(makeLowQualitySeries(), settings);
    const weighted = analyzeCvWorkflow(makeLowQualitySeries(), { ...settings, dunnConfidenceMode: "weighted" });
    expect(weighted.bRecords.map(({ status }) => status)).toEqual(threshold.bRecords.map(({ status }) => status));
    expect(weighted.contributions).toHaveLength(threshold.contributions.length);
  });

  it("keeps b-value threshold statuses and disables b-value exclusion at threshold zero", () => {
    const unfiltered = analyzeCvWorkflow(makePowerLawLoop({ distortForwardMiddle: true }), {
      ...settings,
      rSquaredThreshold: 0
    });
    const strict = analyzeCvWorkflow(makePowerLawLoop({ distortForwardMiddle: true }), settings);

    expect(unfiltered.bRecords.every((record) =>
      record.fit === null || record.status === "valid"
    )).toBe(true);
    expect(strict.bRecords.filter((record) => record.potential === -0.5)
      .map(({ sequenceIndex, branchIndex, status }) => ({ sequenceIndex, branchIndex, status }))).toEqual([
      { sequenceIndex: 10, branchIndex: 0, status: "belowRSquaredThreshold" },
      { sequenceIndex: 30, branchIndex: 1, status: "valid" }
    ]);
    expect(strict.bRecords.find((record) => record.status === "belowRSquaredThreshold")?.fit).not.toBeNull();
    expect(strict.summary.excludedBCount).toBeGreaterThan(0);
  });

  it("reports zero-current logarithms and fewer than three distinct rates without dropping b-value rows", () => {
    const zeroCurrent = analyzeCvWorkflow(
      makePowerLawLoop().map((series) => ({
        ...series,
        points: series.points.map((point, pointIndex) => ({
          ...point,
          current: pointIndex === 1 ? 0 : point.current
        }))
      })),
      settings
    );
    const twoRates = analyzeCvWorkflow(makePowerLawLoop({ scanRates: [1, 4] }), settings);

    expect(zeroCurrent.bRecords.some((record) => record.status === "zeroCurrentLogUnavailable")).toBe(true);
    expect(twoRates.bRecords.every((record) => record.status === "insufficientData")).toBe(true);
    expect(twoRates.summary.unavailableBCount).toBe(twoRates.bRecords.length);
  });

  it.each([-0.01, 1.01, Number.NaN])("rejects invalid R-squared threshold %s", (rSquaredThreshold) => {
    expectCvError(
      () => analyzeCvWorkflow(makePowerLawLoop(), { ...settings, rSquaredThreshold }),
      "invalidRSquaredThreshold"
    );
  });

  it("maps invalid potential interval settings to a stable workflow error", () => {
    expectCvError(
      () => analyzeCvWorkflow(makePowerLawLoop(), {
        ...settings,
        potentialInterval: { mode: "manual", millivolts: 0 }
      }),
      "invalidPotentialInterval"
    );
  });

  it("maps invalid turning-point trim settings to a stable workflow error", () => {
    expectCvError(
      () => analyzeCvWorkflow(makePowerLawLoop(), {
        ...settings,
        turningPointTrim: { mode: "manual", millivolts: 500 }
      }),
      "invalidTurningPointTrim"
    );
  });
});

describe("constrained Dunn regression datasets", () => {
  it.each([
    ["NCP", makeNcpRegressionSeries],
    ["BP150", makeBp150RegressionSeries],
    ["synthetic", makeSyntheticConstrainedDunnSeries]
  ] as const)("keeps %s contributions finite and bounded in both confidence modes", (_name, makeSeries) => {
    const series = makeSeries();
    for (const dunnConfidenceMode of ["threshold", "weighted"] as const) {
      const result = analyzeCvWorkflow(series, { ...settings, dunnConfidenceMode });
      expect(result.contributions).toHaveLength(series.length);
      for (const contribution of result.contributions) {
        expect(contribution.g.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
        contribution.capacitiveForward.forEach((value, index) => {
          const original = contribution.originalForward[index]!;
          expect(Math.abs(value)).toBeLessThanOrEqual(Math.abs(original) + 1e-10);
          expect(value * original).toBeGreaterThanOrEqual(-1e-10);
        });
        contribution.capacitiveReverse.forEach((value, index) => {
          const original = contribution.originalReverse[index]!;
          expect(Math.abs(value)).toBeLessThanOrEqual(Math.abs(original) + 1e-10);
          expect(value * original).toBeGreaterThanOrEqual(-1e-10);
        });
        expect(contribution.capacitiveForward.every(Number.isFinite)).toBe(true);
        expect(contribution.capacitiveReverse.every(Number.isFinite)).toBe(true);
        expect(contribution.diffusionForward.every(Number.isFinite)).toBe(true);
        expect(contribution.diffusionReverse.every(Number.isFinite)).toBe(true);
        expect(contribution.capacitivePercent).toBeGreaterThanOrEqual(0);
        expect(contribution.capacitivePercent).toBeLessThanOrEqual(100);
        expect(contribution.capacitivePercent + contribution.diffusionPercent).toBeCloseTo(100, 10);
        expect(contribution.diagnostics.maximumPositiveOvershoot).toBe(0);
        expect(contribution.diagnostics.maximumNegativeOvershoot).toBe(0);
        expect(contribution.diagnostics.maximumAbsoluteOvershoot).toBe(0);
        for (const record of contribution.plotPath) {
          if (record.originalCurrent >= 0) {
            expect(record.capacitiveCurrent).toBeGreaterThanOrEqual(0);
            expect(record.capacitiveCurrent).toBeLessThanOrEqual(record.originalCurrent);
          } else {
            expect(record.capacitiveCurrent).toBeGreaterThanOrEqual(record.originalCurrent);
            expect(record.capacitiveCurrent).toBeLessThanOrEqual(0);
          }
          expect(record.diffusionCurrent + record.capacitiveCurrent).toBeCloseTo(record.originalCurrent, 12);
        }
      }
    }
  });

  it.each([
    ["NCP", makeNcpRegressionSeries],
    ["BP150", makeBp150RegressionSeries]
  ] as const)("stabilizes sparse threshold evidence for %s before shared-g optimization", (_name, makeSeries) => {
    const result = analyzeCvWorkflow(makeSeries(), settings);

    for (const contribution of result.contributions) {
      const rawTarget = fillLinearGaps(combineContinuousWeightedTarget(makeDunnFractionGrid(
        result.dunnRecords,
        contribution.scanRate,
        "weighted",
        settings.rSquaredThreshold
      )));
      expect(contribution.diagnostics.confidenceBlend).toBeGreaterThan(0);
      expect(contribution.diagnostics.effectiveLambda).toBeCloseTo(
        contribution.diagnostics.baseLambda * contribution.diagnostics.smoothingMultiplier,
        12
      );
      const minimum = contribution.potentialGrid[0]!;
      const maximum = contribution.potentialGrid.at(-1)!;
      const centralIndices = contribution.potentialGrid.flatMap((potential, index) => {
        const normalized = (potential - minimum) / (maximum - minimum);
        return normalized > 0.05 && normalized < 0.95 ? [index] : [];
      });
      const centralPotentials = centralIndices.map((index) => contribution.potentialGrid[index]!);
      expect(secondDifferenceRoughness(
        centralIndices.map((index) => contribution.g[index]!),
        centralPotentials
      )).toBeLessThan(
        secondDifferenceRoughness(
          centralIndices.map((index) => rawTarget[index]!),
          centralPotentials
        )
      );
    }
  });

  it("preserves the BP150 low-fit-quality warning without hard-coded percentages", () => {
    const result = analyzeCvWorkflow(makeBp150RegressionSeries(), settings);
    expect(result.contributions.every((item) => item.diagnostics.lowFitQuality)).toBe(true);
  });

  it("keeps one continuous model stable when only grid density changes tenfold", () => {
    const baseline = analyzeCvWorkflow(makeResolutionStabilitySeries(51), settings);
    const dense = analyzeCvWorkflow(makeResolutionStabilitySeries(501), settings);
    for (const contribution of [...baseline.contributions, ...dense.contributions]) {
      expect(contribution.diagnostics.effectiveAnchorCoverage).toBeLessThan(0.01);
      expect(contribution.diagnostics.confidenceBlend).toBeGreaterThan(0);
      expect(contribution.diagnostics.smoothingMultiplier).toBeGreaterThan(1);
      expect(Math.abs(
        contribution.diagnostics.forwardAnchorCoverage
        - contribution.diagnostics.reverseAnchorCoverage
      )).toBeLessThan(0.02);
    }
    const maximumPercentageDifference = Math.max(...dense.contributions.map((item, index) =>
      Math.abs(item.capacitivePercent - baseline.contributions[index]!.capacitivePercent)));
    const maximumFixedPotentialDifference = Math.max(...dense.contributions.flatMap((item, seriesIndex) => {
      const coarse = baseline.contributions[seriesIndex]!;
      return [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const potential = item.potentialGrid[0]!
          + fraction * (item.potentialGrid.at(-1)! - item.potentialGrid[0]!);
        return Math.abs(
          evaluateG(item.potentialGrid, item.g, potential)
          - evaluateG(coarse.potentialGrid, coarse.g, potential)
        );
      });
    }));
    expect(maximumFixedPotentialDifference).toBeLessThan(0.02);
    expect(maximumPercentageDifference).toBeLessThan(0.75);
  });

  it("restores every singly and doubly recorded turning-point sample in the final path", () => {
    for (const recording of ["single", "double"] as const) {
      const result = analyzeCvWorkflow(makeTurningPointRecoverySeries(recording), settings);

      result.alignedGrid.cycles.forEach((cycle, seriesIndex) => {
        const contribution = result.contributions[seriesIndex]!;
        const turningRecords = cycle.originalPoints.flatMap((original, sourceIndex) =>
          cycle.turningPotentials.includes(original.potential) ? [{ original, sourceIndex }] : []);
        const expectedBranches = recording === "single"
          ? ["forward", "forward", "reverse"] as const
          : ["forward", "forward", "reverse", "reverse"] as const;
        expect(turningRecords).toHaveLength(expectedBranches.length);
        turningRecords.forEach(({ original, sourceIndex }, turningIndex) => {
          const reconstructed = contribution.plotPath[sourceIndex]!;
          expect(reconstructed.potential).toBe(original.potential);
          expect(reconstructed.branch).toBe(expectedBranches[turningIndex]);
          expect(reconstructed.capacitiveCurrent).toBeCloseTo(
            original.current * evaluateG(contribution.potentialGrid, contribution.g, original.potential),
            12
          );
          expect(reconstructed.current).toBe(reconstructed.capacitiveCurrent);
          expect(reconstructed.correctionMagnitude).toBeCloseTo(
            Math.abs(reconstructed.capacitiveCurrent - reconstructed.targetCapacitiveCurrent),
            12
          );
        });
      });
    }
  });

  it("preserves a branch-only endpoint tail without extrapolating the opposite branch", () => {
    const result = analyzeCvWorkflow(makeMismatchedEndpointTailSeries(), settings);

    for (const contribution of result.contributions) {
      expect(Math.min(...contribution.plotPath.map((point) => point.potential))).toBeCloseTo(-1, 12);
      const endpoint = contribution.plotPath.find((point) => point.potential === -1);
      expect(endpoint).toBeDefined();
      expect(endpoint!.oppositeCurrent).toBe(0);
      const endpointG = evaluateG(contribution.potentialGrid, contribution.g, endpoint!.potential);
      expect(endpoint!.capacitiveCurrent).toBeCloseTo(endpointG * endpoint!.originalCurrent, 12);
      expect(endpoint!.correctionMagnitude).toBeCloseTo(
        Math.abs(endpoint!.capacitiveCurrent - endpoint!.targetCapacitiveCurrent),
        12
      );
      expect(Math.abs(endpoint!.capacitiveCurrent)).toBeLessThanOrEqual(Math.abs(endpoint!.originalCurrent));
      expect(endpoint!.capacitiveCurrent * endpoint!.originalCurrent).toBeGreaterThanOrEqual(0);
      expect(endpoint!.capacitiveCurrent).toBeGreaterThanOrEqual(Math.min(0, endpoint!.originalCurrent));
      expect(endpoint!.capacitiveCurrent).toBeLessThanOrEqual(Math.max(0, endpoint!.originalCurrent));
    }
  });

  it.each([
    ["NCP", makeNcpRegressionSeries],
    ["BP150", makeBp150RegressionSeries]
  ] as const)("keeps every %s scan rate on one bounded shared fraction and reports envelope residuals", (_name, makeSeries) => {
    for (const dunnConfidenceMode of ["threshold", "weighted"] as const) {
      const result = analyzeCvWorkflow(makeSeries(), { ...settings, dunnConfidenceMode });
      expectSharedSoftEnvelopeReconstruction(result);
      const highest = result.contributions.reduce((best, item) => item.scanRate > best.scanRate ? item : best);
      expect(highest.diagnostics.maximumAbsoluteEnvelopeViolation).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(highest.diagnostics.maximumAbsoluteEnvelopeViolation)).toBe(true);
    }
  });

  it("keeps both NCP capacitive branches inside the endpoint neighborhoods", () => {
    for (const dunnConfidenceMode of ["threshold", "weighted"] as const) {
      const result = analyzeCvWorkflow(makeNcpRegressionSeries(), { ...settings, dunnConfidenceMode });
      for (const contribution of result.contributions) {
        const minimum = contribution.potentialGrid[0]!;
        const maximum = contribution.potentialGrid.at(-1)!;
        const span = maximum - minimum;
        contribution.potentialGrid.forEach((potential, index) => {
          const normalized = (potential - minimum) / span;
          if (normalized > 0.05 + 1e-12 && normalized < 0.95 - 1e-12) return;
          const forward = contribution.originalForward[index]!;
          const reverse = contribution.originalReverse[index]!;
          const lower = Math.min(forward, reverse);
          const upper = Math.max(forward, reverse);
          const tolerance = 1e-10 * Math.max(1, Math.abs(forward), Math.abs(reverse));
          for (const capacitive of [
            contribution.capacitiveForward[index]!,
            contribution.capacitiveReverse[index]!
          ]) {
            expect(capacitive).toBeGreaterThanOrEqual(lower - tolerance);
            expect(capacitive).toBeLessThanOrEqual(upper + tolerance);
          }
        });
      }
    }
  });
});

function expectSharedSoftEnvelopeReconstruction(result: CvWorkflowResult) {
  for (const contribution of result.contributions) {
    expect(contribution.g.every((value) => value >= 0 && value <= 1)).toBe(true);
    contribution.g.forEach((fraction, index) => {
      expect(contribution.capacitiveForward[index]).toBeCloseTo(
        fraction * contribution.originalForward[index], 10
      );
      expect(contribution.capacitiveReverse[index]).toBeCloseTo(
        fraction * contribution.originalReverse[index], 10
      );
    });
    for (const record of contribution.plotPath) {
      const tolerance = 1e-10 * Math.max(1, Math.abs(record.originalCurrent), Math.abs(record.oppositeCurrent));
      expect(record.capacitiveCurrent).toBeCloseTo(record.g * record.originalCurrent, 10);
      expect(record.effectiveFraction).toBeCloseTo(record.g, 10);
      expect(Math.abs(record.capacitiveCurrent)).toBeLessThanOrEqual(Math.abs(record.originalCurrent) + tolerance);
      expect(record.capacitiveCurrent * record.originalCurrent).toBeGreaterThanOrEqual(-tolerance);
      expect(record.capacitiveCurrent + record.diffusionCurrent).toBeCloseTo(record.originalCurrent, 10);
    }
    expect(contribution.diagnostics.maximumAbsoluteEnvelopeViolation).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(contribution.diagnostics.maximumAbsoluteEnvelopeViolation)).toBe(true);
    expect(contribution.diagnostics.softEnvelopeConverged).toBe(true);
    expect(contribution.diagnostics.softEnvelopeIterations).toBeGreaterThanOrEqual(0);
    expect(contribution.diagnostics.softEnvelopeOptimalityResidual).toBeGreaterThanOrEqual(0);
    expect(contribution.diagnostics.maximumSharedFractionAdjustment).toBeGreaterThanOrEqual(0);
    expect(contribution.diagnostics.envelopeResidualPointCount).toBeGreaterThanOrEqual(0);
    expect(contribution.diagnostics.envelopeResidualPointPercent).toBeGreaterThanOrEqual(0);
    expect(contribution.diagnostics.envelopeResidualPointPercent).toBeLessThanOrEqual(100);
  }
}

function combineContinuousWeightedTarget(fractions: DunnFractionGrid): Array<number | null> {
  return fractions.forward.map((forward, index) => {
    const reverse = fractions.reverse[index]!;
    const evidence = [forward, reverse].filter((point) => point.fraction !== null && point.confidence > 0);
    const totalConfidence = evidence.reduce((sum, point) => sum + point.confidence, 0);
    if (totalConfidence === 0) return null;
    return evidence.reduce((sum, point) => sum + point.fraction! * point.confidence, 0) / totalConfidence;
  });
}

function fillLinearGaps(values: Array<number | null>): number[] {
  const anchors = values.flatMap((value, index) => value === null ? [] : [index]);
  if (anchors.length === 0) throw new Error("expected raw Dunn evidence");
  return values.map((value, index) => {
    if (value !== null) return value;
    const left = anchors.filter((anchor) => anchor < index).at(-1);
    const right = anchors.find((anchor) => anchor > index);
    if (left === undefined) return values[right!]!;
    if (right === undefined) return values[left]!;
    const blend = (index - left) / (right - left);
    return values[left]! + blend * (values[right]! - values[left]!);
  });
}

function evaluateG(potentials: number[], g: number[], potential: number): number {
  if (potential <= potentials[0]!) return g[0]!;
  if (potential >= potentials.at(-1)!) return g.at(-1)!;
  return pchipInterpolate(potentials, g, [potential])[0]!;
}
