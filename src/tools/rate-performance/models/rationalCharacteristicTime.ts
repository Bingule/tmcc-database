import type { CharacteristicTimeRateParameters } from "./types";

export type RationalRateParameters = CharacteristicTimeRateParameters;

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

/** Tian et al. (2020): Q(R) = Q_M / [1 + 2 (R tau)^n]. */
export function evaluateRationalRate(
  rate: number,
  parameters: RationalRateParameters,
): number {
  assertPositiveFinite("rate", rate);
  assertPositiveFinite("qM", parameters.qM);
  assertPositiveFinite("tau", parameters.tau);
  assertPositiveFinite("n", parameters.n);

  const logPower = parameters.n * (Math.log(rate) + Math.log(parameters.tau));

  if (logPower >= 0) {
    const inversePower = Math.exp(-logPower);
    return parameters.qM * inversePower / (inversePower + 2);
  }

  const power = Math.exp(logPower);
  return parameters.qM / (1 + 2 * power);
}
