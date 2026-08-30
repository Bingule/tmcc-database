import { rowsToCsv } from "../../../lib/toolExport";
import type {
  CaPoint,
  CaReconstructionOptions,
  CaReconstructionSuccess,
} from "../analysis/reconstructCaRate";
import type { RateFitResult } from "../analysis/fitRatePerformance";
import type { ChartPoint } from "../../../components/ScientificLineChart";

export interface CaExportMetadata {
  readonly resultKind: "example" | "user";
  readonly exampleId: string | null;
}

const provenanceHeaders = ["result_kind", "example_id"];

export function serializeCaOriginalCsv(
  points: ReadonlyArray<Readonly<Pick<CaPoint, "id"> & { readonly time: number | null; readonly current: number | null }>>,
  options: Readonly<CaReconstructionOptions>,
  metadata: Readonly<CaExportMetadata>,
): string {
  return rowsToCsv(
    ["point_id", "time_original", "time_unit", "current_original", "current_unit", "active_mass_g", "validation_status", "validation_reason", "sign_convention", "baseline_mode", "baseline_value_original_current_unit", "baseline_application_order", "fit_time_start", "fit_time_end", "fit_rate_minimum_h-1", "fit_rate_maximum_h-1", "integration_origin", "integration_method", "smoothing", ...provenanceHeaders],
    points.map((point) => [
      point.id,
      point.time,
      options.timeUnit,
      point.current,
      options.currentUnit,
      options.activeMassG,
      validOriginal(point) ? "valid" : "invalid",
      originalReason(point),
      options.sign,
      options.baseline.mode,
      options.baseline.mode === "constant" ? options.baseline.value : null,
      "after-sign-normalization",
      options.fitRange?.timeStart ?? null,
      options.fitRange?.timeEnd ?? null,
      options.fitRange?.minimumRateH1 ?? null,
      options.fitRange?.maximumRateH1 ?? null,
      "physical-zero-time",
      "trapezoidal",
      "off",
      metadata.resultKind,
      metadata.exampleId,
    ]),
  );
}

export function serializeCaReconstructedCsv(
  result: Readonly<CaReconstructionSuccess>,
  metadata: Readonly<CaExportMetadata>,
): string {
  return rowsToCsv(
    [
      "point_id", "original_row_index", "time_original", "time_s", "current_original",
      "signed_current_mA", "baseline_adjusted_current_mA", "specific_current_mA_g-1",
      "capacity_mAh_g-1", "effective_rate_h-1", "included_in_fit", "fit_exclusion_reason", "reconstruction_exclusion_reason",
      "input_order", "sign_convention", "baseline_mode", "baseline_value_original_current_unit",
      "baseline_application_order", "active_mass_g", "original_time_unit", "original_current_unit",
      "fit_time_start", "fit_time_end", "fit_rate_minimum_h-1", "fit_rate_maximum_h-1", "integration_origin", "integration_method", "smoothing",
      "effective_rate_definition", ...provenanceHeaders,
    ],
    result.points.map((point) => [
      point.id,
      point.originalIndex + 1,
      point.originalTime,
      point.timeS,
      point.originalCurrent,
      point.signedCurrentMa,
      point.adjustedCurrentMa,
      point.specificCurrentMaG,
      point.cumulativeCapacityMahG,
      point.effectiveRateH1,
      point.includedInFit ? "true" : "false",
      point.fitExclusionReason,
      point.exclusionReason,
      result.inputOrder,
      result.processing.sign,
      result.processing.baseline.mode,
      result.processing.baseline.mode === "constant" ? result.processing.baseline.value : null,
      result.processing.baselineOrder,
      result.processing.activeMassG,
      result.processing.timeUnit,
      result.processing.currentUnit,
      result.processing.fitRange?.timeStart ?? null,
      result.processing.fitRange?.timeEnd ?? null,
      result.processing.fitRange?.minimumRateH1 ?? null,
      result.processing.fitRange?.maximumRateH1 ?? null,
      result.processing.integrationOrigin,
      result.processing.integration,
      result.processing.smoothing,
      result.processing.effectiveRateDefinition,
      metadata.resultKind,
      metadata.exampleId,
    ]),
  );
}

export function serializeCaRateCsv(
  result: Readonly<CaReconstructionSuccess>,
  metadata: Readonly<CaExportMetadata>,
): string {
  const reconstructedById = new Map(result.points.map((point) => [point.id, point]));
  return rowsToCsv(
    ["point_id", "rate_h-1", "capacity_mAh_g-1", "included_in_fit", "fit_exclusion_reason", "model_id", ...provenanceHeaders],
    result.reconstructedRatePoints.map((point) => {
      const reconstructed = reconstructedById.get(point.id);
      return [
      point.id,
      point.rate,
      point.capacity,
      reconstructed?.includedInFit ? "true" : "false",
      reconstructed?.fitExclusionReason ?? null,
      "rational-characteristic-time",
      metadata.resultKind,
      metadata.exampleId,
      ];
    }),
  );
}

function validOriginal(point: { readonly id: string; readonly time: number | null; readonly current: number | null }) {
  return Boolean(point.id) && typeof point.time === "number" && Number.isFinite(point.time) && typeof point.current === "number" && Number.isFinite(point.current);
}
function originalReason(point: { readonly id: string; readonly time: number | null; readonly current: number | null }) {
  if (!point.id) return "missing-id";
  if (point.time === null) return "missing-time";
  if (!Number.isFinite(point.time)) return "invalid-time";
  if (point.current === null) return "missing-current";
  if (!Number.isFinite(point.current)) return "invalid-current";
  return null;
}

export function serializeCaFitCurveCsv(
  curve: ReadonlyArray<Readonly<ChartPoint>>,
  metadata: Readonly<CaExportMetadata>,
): string {
  return rowsToCsv(
    ["effective_rate_h-1", "fitted_capacity_mAh_g-1", "model_id", ...provenanceHeaders],
    curve.map((point) => [point.x, point.y, "rational-characteristic-time", metadata.resultKind, metadata.exampleId]),
  );
}

export function serializeCaFitParametersCsv(
  fit: Extract<RateFitResult, { status: "converged" }>,
  metadata: Readonly<CaExportMetadata>,
): string {
  const rows = (["qM", "tau", "n"] as const).map((parameter) => [
    parameter, fit.parameters[parameter], parameter === "qM" ? "mAh g^-1" : parameter === "tau" ? "h" : "dimensionless",
    "fitted", fit.statistics.rmse, fit.statistics.rSquared, fit.status, fit.iterations,
    fit.modelId, metadata.resultKind, metadata.exampleId,
  ]);
  return rowsToCsv(
    ["parameter", "value", "unit", "parameter_type", "rmse", "r_squared", "convergence_status", "iterations", "model_id", ...provenanceHeaders],
    rows,
  );
}
