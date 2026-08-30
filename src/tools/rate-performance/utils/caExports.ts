import { rowsToCsv } from "../../../lib/toolExport";
import type {
  CaPoint,
  CaReconstructionFailure,
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
const sourceHeaders = ["source_kind", "source_file_name", "source_sheet_name", "source_header_mode", "source_has_header", "source_file_row_number"];
const processingHeaders = ["active_mass_g", "original_time_unit", "original_current_unit", "sign_convention", "baseline_mode", "baseline_value_original_current_unit", "baseline_application_order", "integration_origin", "integration_method", "smoothing", "effective_rate_definition", "fit_time_start_original_time_unit", "fit_time_end_original_time_unit", "fit_rate_minimum_h-1", "fit_rate_maximum_h-1"];

export function serializeCaOriginalCsv(
  points: ReadonlyArray<Readonly<Pick<CaPoint, "id" | "source"> & { readonly time: number | null; readonly current: number | null }>>,
  options: Readonly<CaReconstructionOptions>,
  metadata: Readonly<CaExportMetadata>,
): string {
  return rowsToCsv(
    ["point_id", "time_original", "current_original", "validation_status", "validation_reason", ...sourceHeaders, ...processingHeaders, ...provenanceHeaders],
    points.map((point) => [
      point.id,
      point.time,
      point.current,
      validOriginal(point) ? "valid" : "invalid",
      originalReason(point),
      ...sourceRow(point.source),
      ...optionProcessingRow(options),
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
      "input_order", ...sourceHeaders, ...processingHeaders, ...provenanceHeaders,
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
      ...sourceRow(point.source),
      ...processingRow(result),
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
    ["point_id", "rate_h-1", "capacity_mAh_g-1", "included_in_fit", "fit_exclusion_reason", ...sourceHeaders, ...processingHeaders, ...provenanceHeaders],
    result.reconstructedRatePoints.map((point) => {
      const reconstructed = reconstructedById.get(point.id);
      return [
      point.id,
      point.rate,
      point.capacity,
      reconstructed?.includedInFit ? "true" : "false",
      reconstructed?.fitExclusionReason ?? null,
      ...sourceRow(reconstructed?.source),
      ...processingRow(result),
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
  reconstruction: Readonly<CaReconstructionSuccess>,
  fit: Extract<RateFitResult, { status: "converged" }>,
  metadata: Readonly<CaExportMetadata>,
): string {
  return rowsToCsv(
    ["effective_rate_h-1", "fitted_capacity_mAh_g-1", "model_id", "fit_status", "used_point_count", ...processingHeaders, ...provenanceHeaders],
    curve.map((point) => [point.x, point.y, fit.modelId, fit.status, fit.usedPointCount, ...processingRow(reconstruction), metadata.resultKind, metadata.exampleId]),
  );
}

export function serializeCaFitParametersCsv(
  fit: Extract<RateFitResult, { status: "converged" }>,
  reconstruction: Readonly<CaReconstructionSuccess>,
  metadata: Readonly<CaExportMetadata>,
): string {
  const rows = (["qM", "tau", "n"] as const).map((parameter) => [
    parameter, fit.parameters[parameter], parameter === "qM" ? "mAh g^-1" : parameter === "tau" ? "h" : "dimensionless",
    "fitted", fit.statistics.rmse, fit.statistics.rSquared, fit.status, fit.iterations,
    fit.modelId, fit.usedPointCount, ...processingRow(reconstruction), metadata.resultKind, metadata.exampleId,
  ]);
  return rowsToCsv(
    ["parameter", "value", "unit", "parameter_type", "rmse", "r_squared", "convergence_status", "iterations", "model_id", "used_point_count", ...processingHeaders, ...provenanceHeaders],
    rows,
  );
}

export function serializeCaFailureCsv(failure: Readonly<CaReconstructionFailure>, points: ReadonlyArray<Readonly<CaPoint>>, options: Readonly<CaReconstructionOptions>, metadata: Readonly<CaExportMetadata>) {
  const byId = new Map(points.map((point) => [point.id, point]));
  return rowsToCsv(["failure_code", "conflict_point_id", "time_original", "current_original", ...sourceHeaders, ...processingHeaders, ...provenanceHeaders], failure.pointIds.map((id) => {
    const point = byId.get(id); return [failure.code, id, point?.time ?? null, point?.current ?? null, ...sourceRow(point?.source), ...optionProcessingRow(options), metadata.resultKind, metadata.exampleId];
  }));
}

function sourceRow(source?: Readonly<CaPoint["source"]>) { return [source?.kind ?? "programmatic", source?.fileName ?? null, source?.sheetName ?? null, source?.headerMode ?? null, source?.hasHeader === undefined ? null : String(source.hasHeader), source?.fileRowNumber ?? null] as Array<string | number | null>; }
function processingRow(result: Readonly<CaReconstructionSuccess>) { const value = result.processing; return [value.activeMassG, value.timeUnit, value.currentUnit, value.sign, value.baseline.mode, value.baseline.mode === "constant" ? value.baseline.value : null, value.baselineOrder, value.integrationOrigin, value.integration, value.smoothing, value.effectiveRateDefinition, value.fitRange?.timeStart ?? null, value.fitRange?.timeEnd ?? null, value.fitRange?.minimumRateH1 ?? null, value.fitRange?.maximumRateH1 ?? null] as Array<string | number | null>; }
function optionProcessingRow(value: Readonly<CaReconstructionOptions>) { return [value.activeMassG, value.timeUnit, value.currentUnit, value.sign, value.baseline.mode, value.baseline.mode === "constant" ? value.baseline.value : null, "after-sign-normalization", "physical-zero-time", "trapezoidal", "off", "specific-current-over-accumulated-specific-capacity", value.fitRange?.timeStart ?? null, value.fitRange?.timeEnd ?? null, value.fitRange?.minimumRateH1 ?? null, value.fitRange?.maximumRateH1 ?? null] as Array<string | number | null>; }
