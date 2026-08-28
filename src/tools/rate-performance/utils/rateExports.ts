import { rowsToCsv } from "../../../lib/toolExport";
import type { FitStatistics } from "../analysis/fitStatistics";
import type { RateFitWarning } from "../analysis/fitRatePerformance";
import type { NormalizedRatePoint, RatePoint } from "../models/types";

export interface RateExportMetadata {
  readonly modelId: string;
  readonly rateDefinition: string;
  readonly normalizationBasis: string;
  readonly settings?: Readonly<Record<string, string | number | boolean>>;
}

export interface RateFitExportPoint {
  readonly rate: number;
  readonly observedCapacity: number;
  readonly fittedCapacity: number;
  readonly residual: number;
}

export interface RateFittedCurveExportPoint {
  readonly rate: number;
  readonly fittedCapacity: number;
}

export interface RateParameterExportItem {
  readonly name: string;
  readonly value: number | null;
  readonly unit: string;
  readonly type: string;
  readonly standardError?: number | null;
  readonly confidenceInterval95Lower?: number | null;
  readonly confidenceInterval95Upper?: number | null;
}

export interface RateParameterExportSummary {
  readonly statistics: Readonly<FitStatistics>;
  readonly convergenceStatus: string;
  readonly iterations: number;
  readonly iterationCountExact: boolean;
  readonly warnings: ReadonlyArray<RateFitWarning>;
}

function metadataColumns(metadata: RateExportMetadata): Array<string> {
  return [
    metadata.modelId,
    metadata.rateDefinition,
    metadata.normalizationBasis,
    Object.entries(metadata.settings ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(";"),
  ];
}

const metadataHeaders = ["model_id", "rate_definition", "normalization_basis", "settings"];

export function serializeOriginalRateCsv(
  points: ReadonlyArray<Readonly<RatePoint>>,
  metadata: RateExportMetadata,
): string {
  const suffix = metadataColumns(metadata);
  return rowsToCsv(
    ["point_id", "rate", "rate_unit", "capacity", "capacity_unit", ...metadataHeaders],
    points.map((point) => [
      point.id,
      point.rate,
      point.rateUnit,
      point.capacity,
      point.capacityUnit,
      ...suffix,
    ]),
  );
}

export function serializeNormalizedRateCsv(
  points: ReadonlyArray<Readonly<NormalizedRatePoint>>,
  metadata: RateExportMetadata,
): string {
  const suffix = metadataColumns(metadata);
  return rowsToCsv(
    [
      "point_id",
      "analysis_rate",
      "analysis_rate_unit",
      "analysis_capacity",
      "analysis_capacity_unit",
      "original_rate",
      "original_rate_unit",
      "original_capacity",
      "original_capacity_unit",
      "normalization_method",
      "measured_rate_confirmed",
      "theoretical_capacity",
      "theoretical_capacity_unit",
      ...metadataHeaders,
    ],
    points.map((point) => [
      point.id,
      point.analysisRate,
      point.analysisRateUnit,
      point.analysisCapacity,
      point.analysisCapacityUnit,
      point.originalRate,
      point.originalRateUnit,
      point.originalCapacity,
      point.originalCapacityUnit,
      point.normalization.method,
      point.normalization.measuredRateConfirmed === true ? "true" : null,
      point.normalization.theoreticalCapacity ?? null,
      point.normalization.theoreticalCapacityUnit ?? null,
      ...suffix,
    ]),
  );
}

export function serializeRateFittedCurveCsv(
  points: ReadonlyArray<Readonly<RateFittedCurveExportPoint>>,
  metadata: RateExportMetadata,
): string {
  const suffix = metadataColumns(metadata);
  return rowsToCsv(
    ["rate", "fitted_capacity", "rate_unit", "capacity_unit", ...metadataHeaders],
    points.map((point) => [point.rate, point.fittedCapacity, "h-1", "mAh-g-1", ...suffix]),
  );
}

export function serializeRateResidualsCsv(
  points: ReadonlyArray<Readonly<RateFitExportPoint>>,
  metadata: RateExportMetadata,
): string {
  const suffix = metadataColumns(metadata);
  return rowsToCsv(
    [
      "rate",
      "observed_capacity",
      "predicted_capacity",
      "residual",
      "rate_unit",
      "capacity_unit",
      ...metadataHeaders,
    ],
    points.map((point) => [
      point.rate,
      point.observedCapacity,
      point.fittedCapacity,
      point.residual,
      "h-1",
      "mAh-g-1",
      ...suffix,
    ]),
  );
}

export function serializeRateFitCsv(
  points: ReadonlyArray<Readonly<RateFitExportPoint>>,
  metadata: RateExportMetadata,
): string {
  const suffix = metadataColumns(metadata);
  return rowsToCsv(
    [
      "rate",
      "observed_capacity",
      "fitted_capacity",
      "residual",
      "rate_unit",
      "capacity_unit",
      ...metadataHeaders,
    ],
    points.map((point) => [
      point.rate,
      point.observedCapacity,
      point.fittedCapacity,
      point.residual,
      "h-1",
      "mAh-g-1",
      ...suffix,
    ]),
  );
}

export function serializeRateParametersCsv(
  parameters: ReadonlyArray<Readonly<RateParameterExportItem>>,
  metadata: RateExportMetadata,
  summary?: Readonly<RateParameterExportSummary>,
): string {
  const suffix = metadataColumns(metadata);
  const statistics = summary?.statistics;
  const warnings = summary ? serializeWarnings(summary.warnings) : "";
  return rowsToCsv(
    [
      "parameter", "value", "unit", "parameter_type", "standard_error", "ci95_lower", "ci95_upper",
      "sse", "rmse", "r_squared", "adjusted_r_squared", "aic", "aicc", "bic",
      "convergence_status", "iterations", "iteration_count_exact", "warnings", ...metadataHeaders,
    ],
    parameters.map((parameter) => [
      parameter.name,
      parameter.value,
      parameter.unit,
      parameter.type,
      parameter.standardError ?? null,
      parameter.confidenceInterval95Lower ?? null,
      parameter.confidenceInterval95Upper ?? null,
      statistics?.sse ?? null,
      statistics?.rmse ?? null,
      statistics?.rSquared ?? null,
      statistics?.adjustedRSquared ?? null,
      statistics?.aic ?? null,
      statistics?.aicc ?? null,
      statistics?.bic ?? null,
      summary?.convergenceStatus ?? "",
      summary?.iterations ?? null,
      summary ? String(summary.iterationCountExact) : "",
      warnings,
      ...suffix,
    ]),
  );
}

function serializeWarnings(warnings: ReadonlyArray<RateFitWarning>): string {
  return warnings.map((warning) => {
    switch (warning.code) {
      case "duplicate-rate": return `${warning.code}:${warning.rate}`;
      case "boundary-locked": return `${warning.code}:${warning.parameter}`;
      case "insufficient-degrees-of-freedom":
      case "singular-covariance":
      case "non-finite-jacobian": return warning.code;
    }
  }).join(";");
}
