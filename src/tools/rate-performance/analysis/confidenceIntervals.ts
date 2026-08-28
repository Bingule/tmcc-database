import type { CharacteristicTimeRateParameters, RateModelFitFunction } from "../models/types";

export type CharacteristicTimeParameterId = keyof CharacteristicTimeRateParameters;

export interface NumericParameterBounds {
  readonly minimum: number;
  readonly maximum: number;
}

export type CharacteristicTimeParameterBounds = Readonly<
  Record<CharacteristicTimeParameterId, Readonly<NumericParameterBounds>>
>;

export interface ConfidenceIntervalPoint {
  readonly rate: number;
  readonly capacity: number;
}

export interface ParameterUncertainty {
  readonly standardError: number | null;
  readonly confidenceInterval95: Readonly<{
    lower: number;
    upper: number;
  }> | null;
}

export type ConfidenceWarning =
  | Readonly<{ code: "insufficient-degrees-of-freedom" }>
  | Readonly<{ code: "singular-covariance" }>
  | Readonly<{ code: "non-finite-jacobian" }>
  | Readonly<{ code: "boundary-locked"; parameter: CharacteristicTimeParameterId }>;

export interface ConfidenceIntervalResult {
  readonly covariance: ReadonlyArray<ReadonlyArray<number>> | null;
  readonly parameters: Readonly<Record<CharacteristicTimeParameterId, ParameterUncertainty>>;
  readonly warnings: ReadonlyArray<ConfidenceWarning>;
}

const parameterIds: ReadonlyArray<CharacteristicTimeParameterId> = ["qM", "tau", "n"];

function unavailableParameters(): Record<CharacteristicTimeParameterId, ParameterUncertainty> {
  return {
    qM: { standardError: null, confidenceInterval95: null },
    tau: { standardError: null, confidenceInterval95: null },
    n: { standardError: null, confidenceInterval95: null },
  };
}

function isBoundaryLocked(value: number, bounds: NumericParameterBounds): boolean {
  const lowerTolerance = Math.max(
    Math.abs(value) * 1e-7,
    Math.abs(bounds.minimum) * 1e-7,
    Number.EPSILON * 32,
  );
  const upperTolerance = Math.max(
    Math.abs(value) * 1e-7,
    Math.abs(bounds.maximum) * 1e-7,
    Number.EPSILON * 32,
  );
  return value - bounds.minimum <= lowerTolerance
    || bounds.maximum - value <= upperTolerance;
}

function numericalJacobian(
  data: ReadonlyArray<ConfidenceIntervalPoint>,
  parameters: CharacteristicTimeRateParameters,
  evaluate: RateModelFitFunction,
  bounds: CharacteristicTimeParameterBounds,
): number[][] | null {
  const rows: number[][] = [];

  for (const { rate } of data) {
    const row: number[] = [];
    for (const parameter of parameterIds) {
      const value = parameters[parameter];
      const step = Math.max(Math.abs(value) * 1e-5, 1e-8);
      const lower = Math.max(bounds[parameter].minimum, value - step);
      const upper = Math.min(bounds[parameter].maximum, value + step);
      if (!(upper > lower)) return null;

      const lowerParameters = { ...parameters, [parameter]: lower };
      const upperParameters = { ...parameters, [parameter]: upper };
      let lowerPrediction: number;
      let upperPrediction: number;
      try {
        lowerPrediction = evaluate(rate, lowerParameters);
        upperPrediction = evaluate(rate, upperParameters);
      } catch {
        return null;
      }
      const derivative = (upperPrediction - lowerPrediction) / (upper - lower);
      if (!Number.isFinite(derivative)) return null;
      row.push(derivative);
    }
    rows.push(row);
  }

  return rows;
}

function crossProduct(matrix: ReadonlyArray<ReadonlyArray<number>>): number[][] {
  return parameterIds.map((_, column) => parameterIds.map((__, otherColumn) => (
    matrix.reduce((sum, row) => sum + row[column] * row[otherColumn], 0)
  )));
}

function invertMatrix(matrix: ReadonlyArray<ReadonlyArray<number>>): number[][] | null {
  const size = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [
    ...row,
    ...Array.from({ length: size }, (_, columnIndex) => Number(rowIndex === columnIndex)),
  ]);
  const scale = Math.max(...matrix.flat().map(Math.abs));
  if (!Number.isFinite(scale) || scale === 0) return null;

  for (let column = 0; column < size; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }
    if (Math.abs(augmented[pivotRow][column]) <= scale * 1e-12) return null;
    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];

    const pivot = augmented[column][column];
    for (let item = 0; item < size * 2; item++) augmented[column][item] /= pivot;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const multiplier = augmented[row][column];
      for (let item = 0; item < size * 2; item++) {
        augmented[row][item] -= multiplier * augmented[column][item];
      }
    }
  }

  const inverse = augmented.map((row) => row.slice(size));
  return inverse.flat().every(Number.isFinite) ? inverse : null;
}

const studentTCritical95 = [
  Number.NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262,
  2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
] as const;

function criticalValue95(degreesOfFreedom: number): number {
  if (degreesOfFreedom <= 30) return studentTCritical95[degreesOfFreedom];
  if (degreesOfFreedom <= 40) return 2.021;
  if (degreesOfFreedom <= 60) return 2;
  if (degreesOfFreedom <= 120) return 1.98;
  return 1.96;
}

/** Estimate ordinary least-squares covariance and two-sided 95% t intervals. */
export function estimateConfidenceIntervals(
  data: ReadonlyArray<ConfidenceIntervalPoint>,
  parameters: CharacteristicTimeRateParameters,
  evaluate: RateModelFitFunction,
  bounds: CharacteristicTimeParameterBounds,
  sse: number,
): ConfidenceIntervalResult {
  const warnings: ConfidenceWarning[] = [];
  const unavailable = unavailableParameters();
  const degreesOfFreedom = data.length - parameterIds.length;

  if (degreesOfFreedom <= 0 || !Number.isFinite(sse) || sse < 0) {
    warnings.push({ code: "insufficient-degrees-of-freedom" });
    return { covariance: null, parameters: unavailable, warnings };
  }

  const locked = new Set<CharacteristicTimeParameterId>();
  for (const parameter of parameterIds) {
    if (isBoundaryLocked(parameters[parameter], bounds[parameter])) {
      locked.add(parameter);
      warnings.push({ code: "boundary-locked", parameter });
    }
  }

  const jacobian = numericalJacobian(data, parameters, evaluate, bounds);
  if (!jacobian) {
    warnings.push({ code: "non-finite-jacobian" });
    return { covariance: null, parameters: unavailable, warnings };
  }

  const inverse = invertMatrix(crossProduct(jacobian));
  if (!inverse) {
    warnings.push({ code: "singular-covariance" });
    return { covariance: null, parameters: unavailable, warnings };
  }

  const residualVariance = sse / degreesOfFreedom;
  const covariance = inverse.map((row) => row.map((value) => value * residualVariance));
  if (!covariance.flat().every(Number.isFinite)) {
    warnings.push({ code: "singular-covariance" });
    return { covariance: null, parameters: unavailable, warnings };
  }

  const tCritical = criticalValue95(degreesOfFreedom);
  const uncertainty = unavailableParameters();
  for (const [index, parameter] of parameterIds.entries()) {
    const variance = covariance[index][index];
    if (locked.has(parameter)) continue;
    if (!Number.isFinite(variance) || variance < 0) {
      warnings.push({ code: "singular-covariance" });
      return { covariance: null, parameters: unavailable, warnings };
    }
    const standardError = Math.sqrt(variance);
    const margin = tCritical * standardError;
    uncertainty[parameter] = {
      standardError,
      confidenceInterval95: {
        lower: parameters[parameter] - margin,
        upper: parameters[parameter] + margin,
      },
    };
  }

  return { covariance, parameters: uncertainty, warnings };
}
