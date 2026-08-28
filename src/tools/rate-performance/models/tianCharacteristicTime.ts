import type { CharacteristicTimeRateParameters } from "./types";

export type TianRateParameters = CharacteristicTimeRateParameters;

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

function highRateCapacityFraction(inversePower: number): number {
  if (inversePower === 0) {
    return 0;
  }

  // 1 - (1 - exp(-x)) / x loses all significant digits as x approaches zero.
  if (inversePower < 1e-3) {
    const x = inversePower;
    return x * (
      1 / 2
      + x * (-1 / 6 + x * (1 / 24 + x * (-1 / 120 + x / 720)))
    );
  }

  return 1 + Math.expm1(-inversePower) / inversePower;
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
  const capacityFraction = inversePower === Number.POSITIVE_INFINITY
    ? 1
    : highRateCapacityFraction(inversePower);

  // Roundoff near either limit must not create a negative capacity or exceed Q_M.
  return parameters.qM * Math.min(1, Math.max(0, capacityFraction));
}

/** R_T = (1/2)^(1/n) / tau, using the publication's transition definition. */
export function transitionRate(
  { tau, n }: Pick<TianRateParameters, "tau" | "n">,
): number {
  assertPositiveFinite("tau", tau);
  assertPositiveFinite("n", n);

  const result = Math.exp(-Math.LN2 / n - Math.log(tau));
  if (!Number.isFinite(result)) {
    throw new RangeError("transition rate is outside the finite numeric range.");
  }
  return result;
}
