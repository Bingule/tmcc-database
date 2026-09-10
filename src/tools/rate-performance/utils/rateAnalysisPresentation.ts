import type { ChartPoint } from "../../../components/ScientificLineChart";
import type {
  CharacteristicTimeRateParameters,
  NormalizedRatePoint,
  RateModelFitFunction,
} from "../models/types";

export type SmoothRateFitPoint = ChartPoint & Readonly<{ x: number; y: number }>;

export function createSmoothRateFitPoints(
  normalized: ReadonlyArray<Readonly<NormalizedRatePoint>>,
  parameters: Readonly<CharacteristicTimeRateParameters>,
  evaluate: RateModelFitFunction,
  pointCount = 161,
): SmoothRateFitPoint[] {
  if (!Number.isInteger(pointCount) || pointCount < 2) {
    throw new RangeError("pointCount must be an integer greater than one");
  }
  const { minimum, maximum } = normalizedRateExtent(normalized);
  if (minimum === maximum) return [{ x: minimum, y: evaluate(minimum, parameters) }];

  const minimumLog = Math.log(minimum);
  const span = Math.log(maximum) - minimumLog;
  return Array.from({ length: pointCount }, (_, index) => {
    const rate = Math.exp(minimumLog + span * index / (pointCount - 1));
    return { x: rate, y: evaluate(rate, parameters) };
  });
}

export function normalizedRateExtent(
  normalized: ReadonlyArray<Readonly<NormalizedRatePoint>>,
): Readonly<{ minimum: number; maximum: number }> {
  if (normalized.length === 0) throw new RangeError("At least one normalized rate point is required.");
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const { analysisRate } of normalized) {
    if (analysisRate < minimum) minimum = analysisRate;
    if (analysisRate > maximum) maximum = analysisRate;
  }
  return { minimum, maximum };
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
