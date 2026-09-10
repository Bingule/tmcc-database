import type { RatePoint } from "../models/types";

export type CaTimeUnit = "s" | "min" | "h";
export type CaCurrentUnit = "A" | "mA";
export type CaCurrentSign = "positive" | "negative";
export interface CaPointSource {
  readonly kind: "manual-placeholder" | "manual" | "example" | "upload" | "programmatic";
  readonly fileName?: string; readonly sheetName?: string; readonly headerMode?: "auto" | "header" | "data";
  readonly hasHeader?: boolean; readonly fileRowNumber?: number;
}
export interface CaPoint { readonly id: string; readonly time: number; readonly current: number; readonly source?: Readonly<CaPointSource> }
export interface CaFitRange { readonly timeStart?: number; readonly timeEnd?: number; readonly minimumRateH1?: number; readonly maximumRateH1?: number }
export interface CaReconstructionOptions {
  readonly timeUnit: CaTimeUnit; readonly currentUnit: CaCurrentUnit; readonly activeMassG: number; readonly sign: CaCurrentSign;
  /** Original-current-unit magnitude, subtracted after sign normalization. */
  readonly baseline: Readonly<{ mode: "off" } | { mode: "constant"; value: number }>;
  /** Fit selection only; integration always uses the complete trace from physical t=0. */
  readonly fitRange?: Readonly<CaFitRange>;
}
export type CaExclusionReason = "zero-accumulated-capacity" | "non-positive-current" | "non-positive-rate" | "non-finite-result";
export type CaFitExclusionReason = CaExclusionReason | "before-fit-time-range" | "after-fit-time-range" | "below-fit-rate-range" | "above-fit-rate-range";
export interface ReconstructedCaPoint {
  readonly id: string; readonly originalIndex: number; readonly originalTime: number; readonly originalCurrent: number;
  readonly timeS: number; readonly signedCurrentMa: number; readonly adjustedCurrentMa: number; readonly specificCurrentMaG: number;
  readonly cumulativeCapacityMahG: number; readonly effectiveRateH1: number | null; readonly exclusionReason: CaExclusionReason | null;
  readonly includedInFit: boolean; readonly fitExclusionReason: CaFitExclusionReason | null;
  readonly source: Readonly<CaPointSource>;
}
export interface CaReconstructionSuccess {
  readonly status: "success"; readonly inputOrder: "as-entered" | "sorted-for-analysis";
  readonly points: ReadonlyArray<Readonly<ReconstructedCaPoint>>; readonly capacity: ReadonlyArray<number>;
  readonly reconstructedRatePoints: ReadonlyArray<Readonly<RatePoint>>; readonly ratePoints: ReadonlyArray<Readonly<RatePoint>>;
  readonly processing: Readonly<{
    timeUnit: CaTimeUnit; currentUnit: CaCurrentUnit; activeMassG: number; sign: CaCurrentSign;
    baseline: CaReconstructionOptions["baseline"]; baselineOrder: "after-sign-normalization";
    fitRange: CaReconstructionOptions["fitRange"] | null; integrationOrigin: "physical-zero-time";
    integration: "trapezoidal"; smoothing: "off"; effectiveRateDefinition: "specific-current-over-accumulated-specific-capacity";
  }>;
}
export type CaReconstructionFailureCode = "insufficient-points" | "invalid-point" | "invalid-options" | "duplicate-time" | "nonzero-start-time";
export interface CaReconstructionFailure { readonly status: "failure"; readonly code: CaReconstructionFailureCode; readonly pointIds: ReadonlyArray<string> }
export type CaRateResult = CaReconstructionSuccess | CaReconstructionFailure;

const TIME_TO_SECONDS: Readonly<Record<CaTimeUnit, number>> = { s: 1, min: 60, h: 3600 };
const CURRENT_TO_MA: Readonly<Record<CaCurrentUnit, number>> = { A: 1000, mA: 1 };

export function reconstructCaRate(input: ReadonlyArray<Readonly<CaPoint>>, options: Readonly<CaReconstructionOptions>): CaRateResult {
  if (!validOptions(options)) return failure("invalid-options");
  const invalidIds: string[] = [];
  for (const point of input) if (!point.id || !Number.isFinite(point.time) || !Number.isFinite(point.current)) invalidIds.push(point.id);
  if (invalidIds.length) return failure("invalid-point", invalidIds);
  if (input.length < 2) return failure("insufficient-points", input.map(({ id }) => id));
  const duplicateIds = duplicateTimePointIds(input); if (duplicateIds.length) return failure("duplicate-time", duplicateIds);
  const indexed = input.map((point, originalIndex) => ({ ...point, originalIndex }));
  const inputOrder = indexed.every((point, index) => index === 0 || indexed[index - 1].time < point.time) ? "as-entered" as const : "sorted-for-analysis" as const;
  const sorted = [...indexed].sort((left, right) => left.time - right.time);
  if (Math.abs(sorted[0].time * TIME_TO_SECONDS[options.timeUnit]) > 1e-9) return failure("nonzero-start-time", [sorted[0].id]);

  const signMultiplier = options.sign === "positive" ? 1 : -1;
  const currentFactor = CURRENT_TO_MA[options.currentUnit];
  const baselineMa = options.baseline.mode === "constant" ? options.baseline.value * currentFactor : 0;
  let cumulativeCapacityMahG = 0;
  const points: ReconstructedCaPoint[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const point = sorted[index];
    const signedCurrentMa = point.current * currentFactor * signMultiplier;
    const adjustedCurrentMa = signedCurrentMa - baselineMa;
    const specificCurrentMaG = adjustedCurrentMa / options.activeMassG;
    if (index > 0) {
      const previous = sorted[index - 1];
      const previousSpecific = (previous.current * currentFactor * signMultiplier - baselineMa) / options.activeMassG;
      cumulativeCapacityMahG += ((previousSpecific + specificCurrentMaG) / 2) * ((point.time - previous.time) * TIME_TO_SECONDS[options.timeUnit] / 3600);
    }
    const derived = deriveRate(specificCurrentMaG, cumulativeCapacityMahG);
    const fitExclusionReason = selectFitExclusion(point.time, derived.effectiveRateH1, derived.exclusionReason, options.fitRange);
    points.push({ id: point.id, originalIndex: point.originalIndex, originalTime: point.time, originalCurrent: point.current, source: point.source ?? { kind: "programmatic" }, timeS: point.time * TIME_TO_SECONDS[options.timeUnit], signedCurrentMa, adjustedCurrentMa, specificCurrentMaG, cumulativeCapacityMahG, ...derived, includedInFit: fitExclusionReason === null, fitExclusionReason });
  }
  const reconstructedRatePoints: RatePoint[] = []; const ratePoints: RatePoint[] = [];
  for (const point of points) {
    if (point.effectiveRateH1 === null) continue;
    const ratePoint = { id: point.id, rate: point.effectiveRateH1, rateUnit: "h-1" as const, capacity: point.cumulativeCapacityMahG, capacityUnit: "mAh-g-1" as const };
    reconstructedRatePoints.push(ratePoint); if (point.includedInFit) ratePoints.push(ratePoint);
  }
  return { status: "success", inputOrder, points, capacity: points.map(({ cumulativeCapacityMahG }) => cumulativeCapacityMahG), reconstructedRatePoints, ratePoints,
    processing: { timeUnit: options.timeUnit, currentUnit: options.currentUnit, activeMassG: options.activeMassG, sign: options.sign, baseline: options.baseline, baselineOrder: "after-sign-normalization", fitRange: options.fitRange ?? null, integrationOrigin: "physical-zero-time", integration: "trapezoidal", smoothing: "off", effectiveRateDefinition: "specific-current-over-accumulated-specific-capacity" } };
}

function validOptions(options: Readonly<CaReconstructionOptions>) {
  if (!Number.isFinite(options.activeMassG) || options.activeMassG <= 0) return false;
  if (options.baseline.mode === "constant" && (!Number.isFinite(options.baseline.value) || options.baseline.value < 0)) return false;
  const range = options.fitRange; if (!range) return true;
  if ([range.timeStart, range.timeEnd, range.minimumRateH1, range.maximumRateH1].some((value) => value !== undefined && !Number.isFinite(value))) return false;
  if (range.timeStart !== undefined && range.timeEnd !== undefined && range.timeStart > range.timeEnd) return false;
  if (range.minimumRateH1 !== undefined && (range.minimumRateH1 <= 0 || (range.maximumRateH1 !== undefined && range.minimumRateH1 > range.maximumRateH1))) return false;
  return range.maximumRateH1 === undefined || range.maximumRateH1 > 0;
}
function duplicateTimePointIds(points: ReadonlyArray<Readonly<CaPoint>>) {
  const idsByTime = new Map<number, string[]>();
  for (const { id, time } of points) { const ids = idsByTime.get(time); if (ids) ids.push(id); else idsByTime.set(time, [id]); }
  const output: string[] = []; for (const ids of idsByTime.values()) if (ids.length > 1) output.push(...ids); return output;
}
function deriveRate(specificCurrentMaG: number, capacityMahG: number): { effectiveRateH1: number | null; exclusionReason: CaExclusionReason | null } {
  if (!Number.isFinite(specificCurrentMaG) || !Number.isFinite(capacityMahG)) return { effectiveRateH1: null, exclusionReason: "non-finite-result" };
  if (capacityMahG <= 0) return { effectiveRateH1: null, exclusionReason: "zero-accumulated-capacity" };
  if (specificCurrentMaG <= 0) return { effectiveRateH1: null, exclusionReason: "non-positive-current" };
  const rate = specificCurrentMaG / capacityMahG;
  return Number.isFinite(rate) && rate > 0 ? { effectiveRateH1: rate, exclusionReason: null } : { effectiveRateH1: null, exclusionReason: "non-positive-rate" };
}
function selectFitExclusion(time: number, rate: number | null, reconstructionReason: CaExclusionReason | null, range?: Readonly<CaFitRange>): CaFitExclusionReason | null {
  if (range?.timeStart !== undefined && time < range.timeStart) return "before-fit-time-range";
  if (range?.timeEnd !== undefined && time > range.timeEnd) return "after-fit-time-range";
  if (reconstructionReason) return reconstructionReason;
  if (rate !== null && range?.minimumRateH1 !== undefined && rate < range.minimumRateH1) return "below-fit-rate-range";
  if (rate !== null && range?.maximumRateH1 !== undefined && rate > range.maximumRateH1) return "above-fit-rate-range";
  return null;
}
function failure(code: CaReconstructionFailureCode, pointIds: ReadonlyArray<string> = []): CaReconstructionFailure { return { status: "failure", code, pointIds: [...pointIds] }; }
