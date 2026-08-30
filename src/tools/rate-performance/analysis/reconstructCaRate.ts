import type { RatePoint } from "../models/types";

export type CaTimeUnit = "s" | "min" | "h";
export type CaCurrentUnit = "A" | "mA";
export type CaCurrentSign = "positive" | "negative";

export interface CaPoint {
  readonly id: string;
  readonly time: number;
  readonly current: number;
}

export interface CaReconstructionOptions {
  readonly timeUnit: CaTimeUnit;
  readonly currentUnit: CaCurrentUnit;
  readonly activeMassG: number;
  readonly sign: CaCurrentSign;
  /** Constant baseline is a non-negative magnitude, applied after sign normalization. */
  readonly baseline: Readonly<{ mode: "off" } | { mode: "constant"; value: number }>;
  readonly integrationRange?: Readonly<{ start: number; end: number }>;
}

export type CaExclusionReason =
  | "zero-accumulated-capacity"
  | "non-positive-current"
  | "non-positive-rate"
  | "non-finite-result";

export interface ReconstructedCaPoint {
  readonly id: string;
  readonly originalIndex: number;
  readonly originalTime: number;
  readonly originalCurrent: number;
  readonly timeS: number;
  readonly signedCurrentMa: number;
  readonly adjustedCurrentMa: number;
  readonly specificCurrentMaG: number;
  readonly cumulativeCapacityMahG: number;
  readonly effectiveRateH1: number | null;
  readonly exclusionReason: CaExclusionReason | null;
}

export interface CaReconstructionSuccess {
  readonly status: "success";
  readonly inputOrder: "as-entered" | "sorted-for-analysis";
  readonly points: ReadonlyArray<Readonly<ReconstructedCaPoint>>;
  readonly capacity: ReadonlyArray<number>;
  readonly ratePoints: ReadonlyArray<Readonly<RatePoint>>;
  readonly excludedInputPointIds: ReadonlyArray<string>;
  readonly processing: Readonly<{
    timeUnit: CaTimeUnit;
    currentUnit: CaCurrentUnit;
    activeMassG: number;
    sign: CaCurrentSign;
    baseline: CaReconstructionOptions["baseline"];
    integrationRange: CaReconstructionOptions["integrationRange"] | null;
    integration: "trapezoidal";
    smoothing: "off";
    effectiveRateDefinition: "specific-current-over-accumulated-specific-capacity";
  }>;
}

export type CaReconstructionFailureCode =
  | "insufficient-points"
  | "invalid-point"
  | "invalid-options"
  | "duplicate-time"
  | "no-valid-rate-points";

export interface CaReconstructionFailure {
  readonly status: "failure";
  readonly code: CaReconstructionFailureCode;
  readonly pointIds: ReadonlyArray<string>;
}

export type CaRateResult = CaReconstructionSuccess | CaReconstructionFailure;

const TIME_TO_SECONDS: Readonly<Record<CaTimeUnit, number>> = {
  s: 1,
  min: 60,
  h: 3600,
};

const CURRENT_TO_MA: Readonly<Record<CaCurrentUnit, number>> = {
  A: 1000,
  mA: 1,
};

export function reconstructCaRate(
  input: ReadonlyArray<Readonly<CaPoint>>,
  options: Readonly<CaReconstructionOptions>,
): CaRateResult {
  if (!validOptions(options)) return failure("invalid-options");
  const invalid = input.filter((point) => !point.id || !Number.isFinite(point.time) || !Number.isFinite(point.current));
  if (invalid.length > 0) return failure("invalid-point", invalid.map(({ id }) => id));

  const range = options.integrationRange;
  const selected = input
    .map((point, originalIndex) => ({ ...point, originalIndex }))
    .filter(({ time }) => !range || (time >= range.start && time <= range.end));
  if (selected.length < 2) return failure("insufficient-points", selected.map(({ id }) => id));

  const duplicateIds = duplicateTimePointIds(selected);
  if (duplicateIds.length > 0) return failure("duplicate-time", duplicateIds);

  const inputOrder = selected.every((point, index) => index === 0 || selected[index - 1].time < point.time)
    ? "as-entered" as const
    : "sorted-for-analysis" as const;
  const sorted = [...selected].sort((left, right) => left.time - right.time);
  const signMultiplier = options.sign === "positive" ? 1 : -1;
  const baselineMa = options.baseline.mode === "constant"
    ? options.baseline.value * CURRENT_TO_MA[options.currentUnit]
    : 0;

  let cumulativeCapacityMahG = 0;
  const points: ReconstructedCaPoint[] = sorted.map((point, index) => {
    const signedCurrentMa = point.current * CURRENT_TO_MA[options.currentUnit] * signMultiplier;
    const adjustedCurrentMa = signedCurrentMa - baselineMa;
    const specificCurrentMaG = adjustedCurrentMa / options.activeMassG;
    if (index > 0) {
      const previous = sorted[index - 1];
      const previousSignedMa = previous.current * CURRENT_TO_MA[options.currentUnit] * signMultiplier;
      const previousSpecificMaG = (previousSignedMa - baselineMa) / options.activeMassG;
      const elapsedHours = ((point.time - previous.time) * TIME_TO_SECONDS[options.timeUnit]) / 3600;
      cumulativeCapacityMahG += ((previousSpecificMaG + specificCurrentMaG) / 2) * elapsedHours;
    }
    const { effectiveRateH1, exclusionReason } = deriveRate(specificCurrentMaG, cumulativeCapacityMahG);
    return {
      id: point.id,
      originalIndex: point.originalIndex,
      originalTime: point.time,
      originalCurrent: point.current,
      timeS: point.time * TIME_TO_SECONDS[options.timeUnit],
      signedCurrentMa,
      adjustedCurrentMa,
      specificCurrentMaG,
      cumulativeCapacityMahG,
      effectiveRateH1,
      exclusionReason,
    };
  });

  const ratePoints: RatePoint[] = points.flatMap((point) => point.effectiveRateH1 === null ? [] : [{
    id: point.id,
    rate: point.effectiveRateH1,
    rateUnit: "h-1" as const,
    capacity: point.cumulativeCapacityMahG,
    capacityUnit: "mAh-g-1" as const,
  }]);
  if (ratePoints.length === 0) return failure("no-valid-rate-points", points.map(({ id }) => id));

  const selectedIds = new Set(selected.map(({ id }) => id));
  return {
    status: "success",
    inputOrder,
    points,
    capacity: points.map(({ cumulativeCapacityMahG: capacity }) => capacity),
    ratePoints,
    excludedInputPointIds: input.filter(({ id }) => !selectedIds.has(id)).map(({ id }) => id),
    processing: {
      timeUnit: options.timeUnit,
      currentUnit: options.currentUnit,
      activeMassG: options.activeMassG,
      sign: options.sign,
      baseline: options.baseline,
      integrationRange: options.integrationRange ?? null,
      integration: "trapezoidal",
      smoothing: "off",
      effectiveRateDefinition: "specific-current-over-accumulated-specific-capacity",
    },
  };
}

function validOptions(options: Readonly<CaReconstructionOptions>): boolean {
  if (!Number.isFinite(options.activeMassG) || options.activeMassG <= 0) return false;
  if (options.baseline.mode === "constant" && (!Number.isFinite(options.baseline.value) || options.baseline.value < 0)) return false;
  const range = options.integrationRange;
  return !range || (Number.isFinite(range.start) && Number.isFinite(range.end) && range.start < range.end);
}

function duplicateTimePointIds(points: ReadonlyArray<Readonly<CaPoint>>): string[] {
  const idsByTime = new Map<number, string[]>();
  points.forEach(({ id, time }) => idsByTime.set(time, [...(idsByTime.get(time) ?? []), id]));
  return [...idsByTime.values()].filter((ids) => ids.length > 1).flat();
}

function deriveRate(specificCurrentMaG: number, capacityMahG: number): Readonly<{
  effectiveRateH1: number | null;
  exclusionReason: CaExclusionReason | null;
}> {
  if (!Number.isFinite(specificCurrentMaG) || !Number.isFinite(capacityMahG)) {
    return { effectiveRateH1: null, exclusionReason: "non-finite-result" };
  }
  if (capacityMahG <= 0) return { effectiveRateH1: null, exclusionReason: "zero-accumulated-capacity" };
  if (specificCurrentMaG <= 0) return { effectiveRateH1: null, exclusionReason: "non-positive-current" };
  const rate = specificCurrentMaG / capacityMahG;
  return Number.isFinite(rate) && rate > 0
    ? { effectiveRateH1: rate, exclusionReason: null }
    : { effectiveRateH1: null, exclusionReason: "non-positive-rate" };
}

function failure(code: CaReconstructionFailureCode, pointIds: ReadonlyArray<string> = []): CaReconstructionFailure {
  return { status: "failure", code, pointIds: [...pointIds] };
}
