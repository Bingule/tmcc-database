import type {
  CapacityUnit,
  NormalizedRatePoint,
  RateNormalizationContext,
  RateNormalizationMetadata,
  RatePoint,
} from "../models/types";
import { validateRatePoints } from "./rateValidation";

export type RateNormalizationErrorCode =
  | "invalidRatePoints"
  | "measuredRateConfirmationRequired"
  | "theoreticalCapacityRequired"
  | "invalidTheoreticalCapacity"
  | "positiveMeasuredCapacityRequired"
  | "nonFiniteNormalizedValue";

export class RateNormalizationError extends Error {
  readonly code: RateNormalizationErrorCode;
  readonly detail: Readonly<Record<string, unknown>>;

  constructor(code: RateNormalizationErrorCode, detail: Readonly<Record<string, unknown>> = {}) {
    super(code);
    this.name = "RateNormalizationError";
    this.code = code;
    this.detail = detail;
  }
}

function normalizedCapacity(value: number, _unit: CapacityUnit): number {
  return value;
}

function requirePositiveMeasuredCapacity(point: RatePoint, capacity: number): void {
  if (capacity <= 0) {
    throw new RateNormalizationError("positiveMeasuredCapacityRequired", { pointId: point.id });
  }
}

function normalizeAnalysisRate(
  point: RatePoint,
  capacity: number,
  context: RateNormalizationContext,
): { analysisRate: number; normalization: Readonly<RateNormalizationMetadata> } {
  if (point.rate === null) {
    throw new RateNormalizationError("invalidRatePoints", { invalidPointIds: [point.id] });
  }

  switch (point.rateUnit) {
    case "h-1":
      if (context.confirmHInverseMeasuredRate !== true) {
        throw new RateNormalizationError("measuredRateConfirmationRequired", { pointId: point.id });
      }
      return {
        analysisRate: point.rate,
        normalization: Object.freeze({
          method: "measured-rate-direct",
          measuredRateConfirmed: true,
        }),
      };

    case "A-g-1":
    case "mA-g-1": {
      requirePositiveMeasuredCapacity(point, capacity);
      const currentMilliAmpsPerGram = point.rateUnit === "A-g-1" ? point.rate * 1000 : point.rate;
      return {
        analysisRate: currentMilliAmpsPerGram / capacity,
        normalization: Object.freeze({ method: "specific-current" }),
      };
    }

    case "C-rate": {
      requirePositiveMeasuredCapacity(point, capacity);
      const theoreticalCapacity = context.theoreticalCapacity;
      if (!theoreticalCapacity) {
        throw new RateNormalizationError("theoreticalCapacityRequired", { pointId: point.id });
      }
      if (!Number.isFinite(theoreticalCapacity.value) || theoreticalCapacity.value <= 0) {
        throw new RateNormalizationError("invalidTheoreticalCapacity", {
          value: theoreticalCapacity.value,
          unit: theoreticalCapacity.unit,
        });
      }
      const theoreticalCapacityNormalized = normalizedCapacity(
        theoreticalCapacity.value,
        theoreticalCapacity.unit,
      );
      return {
        analysisRate: point.rate * theoreticalCapacityNormalized / capacity,
        normalization: Object.freeze({
          method: "c-rate",
          theoreticalCapacity: theoreticalCapacity.value,
          theoreticalCapacityUnit: theoreticalCapacity.unit,
        }),
      };
    }
  }
}

export function normalizeRatePoints(
  points: ReadonlyArray<RatePoint>,
  context: RateNormalizationContext,
): NormalizedRatePoint[] {
  const report = validateRatePoints(points);
  if (report.hasErrors) {
    throw new RateNormalizationError("invalidRatePoints", {
      invalidPointIds: report.invalidPoints.map(({ id }) => id),
      issues: report.issues.filter(({ severity }) => severity === "error"),
    });
  }

  return report.validPoints.map((point) => {
    const capacity = normalizedCapacity(point.capacity as number, point.capacityUnit);
    const { analysisRate, normalization } = normalizeAnalysisRate(point, capacity, context);
    if (!Number.isFinite(analysisRate) || !Number.isFinite(capacity)) {
      throw new RateNormalizationError("nonFiniteNormalizedValue", { pointId: point.id });
    }

    return Object.freeze({
      id: point.id,
      analysisRate,
      analysisRateUnit: "h-1" as const,
      analysisCapacity: capacity,
      analysisCapacityUnit: "mAh-g-1" as const,
      originalRate: point.rate as number,
      originalRateUnit: point.rateUnit,
      originalCapacity: point.capacity as number,
      originalCapacityUnit: point.capacityUnit,
      normalization,
    });
  });
}
