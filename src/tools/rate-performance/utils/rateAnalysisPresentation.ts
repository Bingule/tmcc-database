import type { ChartPoint } from "../../../components/ScientificLineChart";
import type {
  CharacteristicTimeRateParameters,
  NormalizedRatePoint,
  RateModelFitFunction,
} from "../models/types";

export function createSmoothRateFitPoints(
  normalized: ReadonlyArray<Readonly<NormalizedRatePoint>>,
  parameters: Readonly<CharacteristicTimeRateParameters>,
  evaluate: RateModelFitFunction,
  pointCount = 161,
): ChartPoint[] {
  if (!Number.isInteger(pointCount) || pointCount < 2) {
    throw new RangeError("pointCount must be an integer greater than one");
  }
  const rates = normalized.map(({ analysisRate }) => analysisRate);
  const minimum = Math.min(...rates);
  const maximum = Math.max(...rates);
  if (minimum === maximum) return [{ x: minimum, y: evaluate(minimum, parameters) }];

  const minimumLog = Math.log(minimum);
  const span = Math.log(maximum) - minimumLog;
  return Array.from({ length: pointCount }, (_, index) => {
    const rate = Math.exp(minimumLog + span * index / (pointCount - 1));
    return { x: rate, y: evaluate(rate, parameters) };
  });
}

export function formatRateValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  const magnitude = Math.abs(value);
  return magnitude !== 0 && (magnitude >= 1e5 || magnitude < 1e-4)
    ? value.toExponential(4)
    : Number(value.toPrecision(6)).toString();
}

export function formatOptionalRateValue(value: number | null, unavailable: string): string {
  return value === null || !Number.isFinite(value) ? unavailable : formatRateValue(value);
}
