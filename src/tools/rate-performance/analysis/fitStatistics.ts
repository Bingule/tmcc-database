export interface FitStatistics {
  readonly sse: number | null;
  readonly rmse: number | null;
  readonly rSquared: number | null;
  readonly adjustedRSquared: number | null;
  readonly aic: number | null;
  readonly aicc: number | null;
  readonly bic: number | null;
}

const unavailableStatistics = (): FitStatistics => ({
  sse: null,
  rmse: null,
  rSquared: null,
  adjustedRSquared: null,
  aic: null,
  aicc: null,
  bic: null,
});

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/** Calculate unweighted least-squares statistics without replacing undefined values. */
export function calculateFitStatistics(
  observed: ReadonlyArray<number>,
  predicted: ReadonlyArray<number>,
  parameterCount: number,
): FitStatistics {
  if (observed.length !== predicted.length) {
    throw new RangeError("Observed and predicted arrays must have the same length.");
  }
  if (!Number.isInteger(parameterCount) || parameterCount < 0) {
    throw new RangeError("Parameter count must be a non-negative integer.");
  }

  const observationCount = observed.length;
  if (
    observationCount === 0
    || observed.some((value) => !Number.isFinite(value))
    || predicted.some((value) => !Number.isFinite(value))
  ) {
    return unavailableStatistics();
  }

  const residuals = observed.map((value, index) => value - predicted[index]);
  const sse = residuals.reduce((sum, residual) => sum + residual * residual, 0);
  if (!Number.isFinite(sse)) {
    return unavailableStatistics();
  }

  const rmse = finiteOrNull(Math.sqrt(sse / observationCount));
  const mean = observed.reduce((sum, value) => sum + value, 0) / observationCount;
  const totalSumOfSquares = observed.reduce((sum, value) => {
    const centered = value - mean;
    return sum + centered * centered;
  }, 0);
  const rSquared = totalSumOfSquares > 0 && Number.isFinite(totalSumOfSquares)
    ? finiteOrNull(1 - sse / totalSumOfSquares)
    : null;

  const residualDegreesOfFreedom = observationCount - parameterCount;
  const adjustedRSquared = rSquared !== null && residualDegreesOfFreedom > 0
    ? finiteOrNull(1 - (1 - rSquared) * (observationCount - 1) / residualDegreesOfFreedom)
    : null;

  const likelihoodTerm = sse > 0
    ? finiteOrNull(observationCount * Math.log(sse / observationCount))
    : null;
  const aic = likelihoodTerm === null
    ? null
    : finiteOrNull(likelihoodTerm + 2 * parameterCount);
  const aiccDenominator = observationCount - parameterCount - 1;
  const aicc = aic !== null && aiccDenominator > 0
    ? finiteOrNull(aic + 2 * parameterCount * (parameterCount + 1) / aiccDenominator)
    : null;
  const bic = likelihoodTerm === null
    ? null
    : finiteOrNull(likelihoodTerm + parameterCount * Math.log(observationCount));

  return { sse, rmse, rSquared, adjustedRSquared, aic, aicc, bic };
}
