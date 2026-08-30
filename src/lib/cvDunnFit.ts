import { linearRegression } from "./regression";
import {
  CvAnalysisError,
  type CvAlignedBranchGrid,
  type CvBranchKind,
  type DunnBranchFitRecord,
  type DunnFitGrid,
  type DunnPoint,
  type TurningPointTrimSetting
} from "./cvTypes";

export type {
  DunnBranchFitRecord,
  DunnFitGrid,
  DunnFitStatus,
  TurningPointTrimSetting
} from "./cvTypes";

export function resolveTurningPointTrim(
  grid: CvAlignedBranchGrid,
  setting: TurningPointTrimSetting
): number {
  validateTrimInputs(grid, setting);
  if (setting.mode === "manual") return setting.millivolts / 1000;

  const span = grid.commonMaximum - grid.commonMinimum;
  const trim = 0.005 * span;
  if (!Number.isFinite(trim) || !(trim < span / 2)) {
    throw new CvAnalysisError("invalidDataShape");
  }
  const deepestInteriorDistance = maximumInteriorTurningDistance(
    grid.potentials,
    grid.commonMinimum,
    grid.commonMaximum
  );
  const tolerance = potentialTolerance(grid);
  if (deepestInteriorDistance === null || trim + tolerance < deepestInteriorDistance) {
    return trim;
  }
  return Math.max(0, deepestInteriorDistance - 2 * tolerance);
}

export function fitDunnBranches(
  grid: CvAlignedBranchGrid,
  setting: TurningPointTrimSetting
): DunnFitGrid {
  validateGrid(grid);
  const resolvedTurningPointTrim = resolveTurningPointTrim(grid, setting);
  return {
    forward: fitBranch(grid, "forward", grid.forwardCurrents, resolvedTurningPointTrim),
    reverse: fitBranch(grid, "reverse", grid.reverseCurrents, resolvedTurningPointTrim),
    resolvedTurningPointTrim
  };
}

function fitBranch(
  grid: CvAlignedBranchGrid,
  branch: CvBranchKind,
  currents: number[][],
  trim: number
): DunnBranchFitRecord[] {
  const tolerance = potentialTolerance(grid);

  return grid.potentials.map((potential, potentialIndex) => {
    const distanceFromTurningPoint = Math.min(
      Math.abs(potential - grid.commonMinimum),
      Math.abs(grid.commonMaximum - potential)
    );
    if (trim > 0 && distanceFromTurningPoint <= trim + tolerance) {
      return { branch, potential, fit: null, status: "trimmed", trimmed: true };
    }

    const fitPoints: Array<{ x: number; y: number }> = [];
    const distinctScanRates = new Set<number>();
    for (let seriesIndex = 0; seriesIndex < grid.scanRates.length; seriesIndex += 1) {
      const scanRate = grid.scanRates[seriesIndex];
      const current = currents[seriesIndex][potentialIndex];
      if (!Number.isFinite(scanRate) || scanRate <= 0 || !Number.isFinite(current)) continue;
      const squareRootRate = Math.sqrt(scanRate);
      const normalizedCurrent = current / squareRootRate;
      if (!Number.isFinite(squareRootRate) || !Number.isFinite(normalizedCurrent)) continue;
      distinctScanRates.add(scanRate);
      fitPoints.push({ x: squareRootRate, y: normalizedCurrent });
    }

    if (distinctScanRates.size < 3) {
      return { branch, potential, fit: null, status: "insufficientData", trimmed: false };
    }
    const regression = linearRegression(fitPoints);
    if (!regression) {
      return { branch, potential, fit: null, status: "regressionFailed", trimmed: false };
    }
    const fit: DunnPoint = {
      potential,
      k1: regression.slope,
      k2: regression.intercept,
      rSquared: regression.rSquared,
      pointCount: regression.pointCount
    };
    return { branch, potential, fit, status: "valid", trimmed: false };
  });
}

function validateTrimInputs(grid: CvAlignedBranchGrid, setting: TurningPointTrimSetting) {
  const span = grid.commonMaximum - grid.commonMinimum;
  if (!Number.isFinite(grid.commonMinimum)
    || !Number.isFinite(grid.commonMaximum)
    || !Number.isFinite(span)
    || span <= 0
    || !Number.isFinite(grid.nativePotentialInterval)
    || grid.nativePotentialInterval <= 0) {
    throw new CvAnalysisError("invalidDataShape");
  }
  if (setting.mode === "manual"
    && (!Number.isFinite(setting.millivolts) || setting.millivolts < 0)) {
    throw new CvAnalysisError("invalidTurningPointTrim");
  }
  if (setting.mode === "manual") {
    const trim = setting.millivolts / 1000;
    if (!(2 * trim < span)) {
      throw new CvAnalysisError("invalidTurningPointTrim");
    }
  }
}

function maximumInteriorTurningDistance(
  potentials: number[],
  commonMinimum: number,
  commonMaximum: number
): number | null {
  const distances = potentials
    .filter((potential) => potential > commonMinimum && potential < commonMaximum)
    .map((potential) => Math.min(
      Math.abs(potential - commonMinimum),
      Math.abs(commonMaximum - potential)
    ));
  return distances.length === 0 ? null : Math.max(...distances);
}

function potentialTolerance(grid: CvAlignedBranchGrid): number {
  const span = grid.commonMaximum - grid.commonMinimum;
  const scale = Math.max(
    Math.abs(grid.commonMinimum),
    Math.abs(grid.commonMaximum),
    span
  );
  const scaledTolerance = Number.EPSILON * scale * 16;
  return scaledTolerance > 0 ? scaledTolerance : Number.MIN_VALUE;
}

function validateGrid(grid: CvAlignedBranchGrid) {
  validateTrimInputs(grid, { mode: "auto" });
  const pointCount = grid.potentials.length;
  if (grid.forwardCurrents.length !== grid.scanRates.length
    || grid.reverseCurrents.length !== grid.scanRates.length
    || grid.forwardCurrents.some((row) => row.length !== pointCount)
    || grid.reverseCurrents.some((row) => row.length !== pointCount)
    || grid.potentials.some((potential) => !Number.isFinite(potential))) {
    throw new CvAnalysisError("invalidDataShape");
  }
}
