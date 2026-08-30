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
    ["point_id", "time_original", "time_unit", "current_original", "current_unit", "active_mass_g", ...provenanceHeaders],
    points.map((point) => [
      point.id,
      point.time,
      options.timeUnit,
      point.current,
      options.currentUnit,
      options.activeMassG,
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
      "capacity_mAh_g-1", "effective_rate_h-1", "included_in_rate_fit", "exclusion_reason",
      "input_order", "sign_convention", "baseline_mode", "baseline_value_original_current_unit",
      "integration_range_start", "integration_range_end", "integration_method", "smoothing",
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
      point.effectiveRateH1 === null ? "false" : "true",
      point.exclusionReason,
      result.inputOrder,
      result.processing.sign,
      result.processing.baseline.mode,
      result.processing.baseline.mode === "constant" ? result.processing.baseline.value : null,
      result.processing.integrationRange?.start ?? null,
      result.processing.integrationRange?.end ?? null,
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
  return rowsToCsv(
    ["point_id", "rate_h-1", "capacity_mAh_g-1", ...provenanceHeaders],
    result.ratePoints.map((point) => [
      point.id,
      point.rate,
      point.capacity,
      metadata.resultKind,
      metadata.exampleId,
    ]),
  );
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
