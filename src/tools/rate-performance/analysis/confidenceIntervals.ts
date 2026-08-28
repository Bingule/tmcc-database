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

function logParameterJacobian(
  data: ReadonlyArray<ConfidenceIntervalPoint>,
  parameters: CharacteristicTimeRateParameters,
  evaluate: RateModelFitFunction,
  bounds: CharacteristicTimeParameterBounds,
): number[][] | null {
  const rows: number[][] = [];

  for (const { rate } of data) {
    const row: number[] = [];
    for (const parameter of parameterIds) {
      const encodedValue = Math.log(parameters[parameter]);
      const encodedMinimum = Math.log(bounds[parameter].minimum);
      const encodedMaximum = Math.log(bounds[parameter].maximum);
      const step = 1e-5;
      const encodedLower = Math.max(encodedMinimum, encodedValue - step);
      const encodedUpper = Math.min(encodedMaximum, encodedValue + step);
      if (!(encodedUpper > encodedLower)) return null;

      const lower = Math.exp(encodedLower);
      const upper = Math.exp(encodedUpper);

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
      const derivative = (upperPrediction - lowerPrediction) / (encodedUpper - encodedLower);
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

function inverseScaledCrossProduct(
  matrix: ReadonlyArray<ReadonlyArray<number>>,
): number[][] | null {
  const columnScales = parameterIds.map((_, column) => Math.sqrt(
    matrix.reduce((sum, row) => sum + row[column] * row[column], 0),
  ));
  if (columnScales.some((scale) => !Number.isFinite(scale) || scale === 0)) return null;

  const scaled = matrix.map((row) => row.map((value, column) => value / columnScales[column]));
  const normalizedCrossProduct = crossProduct(scaled);
  const normalizedInverse = invertMatrix(normalizedCrossProduct);
  if (!normalizedInverse) return null;

  const identityError = normalizedCrossProduct.reduce((largest, row, rowIndex) => (
    Math.max(largest, ...normalizedInverse[rowIndex].map((_, columnIndex) => {
      const product = row.reduce((sum, value, inner) => (
        sum + value * normalizedInverse[inner][columnIndex]
      ), 0);
      return Math.abs(product - Number(rowIndex === columnIndex));
    }))
  ), 0);
  if (!Number.isFinite(identityError) || identityError > 1e-7) return null;

  return normalizedInverse.map((row, rowIndex) => row.map((value, columnIndex) => (
    value / (columnScales[rowIndex] * columnScales[columnIndex])
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

const studentTCritical95Table = [
  Number.NaN,
  12.706205, 4.302653, 3.182446, 2.776445, 2.570582, 2.446912, 2.364624,
  2.306004, 2.262157, 2.228139, 2.200985, 2.178813, 2.160369, 2.144787,
  2.13145, 2.119905, 2.109816, 2.100922, 2.093024, 2.085963, 2.079614,
  2.073873, 2.068658, 2.063899, 2.059539, 2.055529, 2.051831, 2.048407,
  2.04523, 2.042272, 2.039513, 2.036933, 2.034515, 2.032245, 2.030108,
  2.028094, 2.026192, 2.024394, 2.022691, 2.021075,
] as const;

export function studentTCritical95(degreesOfFreedom: number): number {
  if (!Number.isInteger(degreesOfFreedom) || degreesOfFreedom <= 0) {
    throw new RangeError("Degrees of freedom must be a positive integer.");
  }
  if (degreesOfFreedom <= 40) return studentTCritical95Table[degreesOfFreedom];

  // Use the exact lower-df endpoint of each interval. Since t critical values
  // decrease monotonically with df, this stepwise table is conservative: it
  // never produces an interval narrower than the exact 95% interval.
  if (degreesOfFreedom <= 60) return 2.021075;
  if (degreesOfFreedom <= 120) return 2.000298;
  return 1.97993;
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

  const jacobian = logParameterJacobian(data, parameters, evaluate, bounds);
  if (!jacobian) {
    warnings.push({ code: "non-finite-jacobian" });
    return { covariance: null, parameters: unavailable, warnings };
  }

  const inverse = inverseScaledCrossProduct(jacobian);
  if (!inverse) {
    warnings.push({ code: "singular-covariance" });
    return { covariance: null, parameters: unavailable, warnings };
  }

  const residualVariance = sse / degreesOfFreedom;
  const logCovariance = inverse.map((row) => row.map((value) => value * residualVariance));
  const covariance = logCovariance.map((row, rowIndex) => row.map((value, columnIndex) => (
    value * parameters[parameterIds[rowIndex]] * parameters[parameterIds[columnIndex]]
  )));
  if (!covariance.flat().every(Number.isFinite)) {
    warnings.push({ code: "singular-covariance" });
    return { covariance: null, parameters: unavailable, warnings };
  }

  const tCritical = studentTCritical95(degreesOfFreedom);
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
