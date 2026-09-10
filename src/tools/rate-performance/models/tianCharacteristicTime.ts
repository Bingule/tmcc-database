import type { CharacteristicTimeRateParameters } from "./types";

export type TianRateParameters = CharacteristicTimeRateParameters;

// The first omitted relative term of the series is x^5 / 2520. Below this
// bound, the five-term series is accurate to machine precision and avoids the
// cancellation in 1 - (1 - exp(-x)) / x.
const HIGH_RATE_SERIES_LIMIT = Math.pow(2520 * Number.EPSILON, 1 / 5);

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function validateRateModelInput(
  rate: number,
  { qM, tau, n }: TianRateParameters,
): void {
  assertPositiveFinite("rate", rate);
  assertPositiveFinite("qM", qM);
  assertPositiveFinite("tau", tau);
  assertPositiveFinite("n", n);
}

function highRateSeriesFactor(inversePower: number): number {
  const x = inversePower;
  return 1 / 2
    + x * (-1 / 6 + x * (1 / 24 + x * (-1 / 120 + x / 720)));
}

/**
 * Tian et al. (2019):
 * Q(R) = Q_M [1 - (R tau)^n (1 - exp(-(R tau)^(-n)))].
 */
export function evaluateTianRate(
  rate: number,
  parameters: TianRateParameters,
): number {
  validateRateModelInput(rate, parameters);

  const logRateTau = Math.log(rate) + Math.log(parameters.tau);
  const logInversePower = -parameters.n * logRateTau;

  if (logInversePower === Number.POSITIVE_INFINITY) {
    return parameters.qM;
  }
  if (logInversePower === Number.NEGATIVE_INFINITY) {
    return 0;
  }

  const inversePower = Math.exp(logInversePower);
  if (inversePower < HIGH_RATE_SERIES_LIMIT) {
    const logCapacity = Math.log(parameters.qM)
      + logInversePower
      + Math.log(highRateSeriesFactor(inversePower));
    return Math.min(parameters.qM, Math.exp(logCapacity));
  }

  const capacityFraction = inversePower === Number.POSITIVE_INFINITY
    ? 1
    : 1 + Math.expm1(-inversePower) / inversePower;

  // Roundoff near either limit must not create a negative capacity or exceed Q_M.
  return parameters.qM * Math.min(1, Math.max(0, capacityFraction));
}

/** R_T = (1/2)^(1/n) / tau, using the publication's transition definition. */
export function transitionRate(
  { tau, n }: Pick<TianRateParameters, "tau" | "n">,
): number {
  assertPositiveFinite("tau", tau);
  assertPositiveFinite("n", n);

  const logResult = -Math.LN2 / n - Math.log(tau);
  const result = Math.exp(logResult);
  if (!Number.isFinite(logResult) || !Number.isFinite(result) || result <= 0) {
    throw new RangeError("transition rate is outside the finite numeric range.");
  }
  return result;
}
