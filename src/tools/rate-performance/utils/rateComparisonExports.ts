import { rowsToCsv } from "../../../lib/toolExport";
import type {
  ModelComparisonResult,
  ModelComparisonRow,
} from "../analysis/compareRateModels";
import type { RateFitPoint } from "../analysis/fitRatePerformance";
import {
  RATE_EXPORT_METADATA_HEADERS,
  rateExportMetadataColumns,
  type RateExportMetadata,
} from "./rateExports";

const provenanceHeaders = RATE_EXPORT_METADATA_HEADERS.slice(1);

export function serializeModelComparisonCsv(
  result: Readonly<ModelComparisonResult>,
  metadata: Readonly<RateExportMetadata>,
): string {
  const provenance = rateExportMetadataColumns(metadata).slice(1);
  return rowsToCsv(
    [
      "model_id", "equation_type", "parameters", "parameter_count", "r_squared",
      "adjusted_r_squared", "rmse", "aic", "aicc", "bic", "criterion",
      "delta_criterion", "convergence", "rank", "failure_code", ...provenanceHeaders,
    ],
    result.rows.map((row) => [
      row.modelId,
      row.equationType,
      serializeParameters(row),
      row.parameterCount,
      row.statistics?.rSquared ?? null,
      row.statistics?.adjustedRSquared ?? null,
      row.statistics?.rmse ?? null,
      row.statistics?.aic ?? null,
      row.statistics?.aicc ?? null,
      row.statistics?.bic ?? null,
      result.criterion ?? "",
      row.deltaCriterion,
      row.convergence,
      row.rank,
      row.failureCode ?? "",
      ...provenance,
    ]),
  );
}

export function serializeModelComparisonResidualsCsv(
  data: ReadonlyArray<Readonly<RateFitPoint>>,
  result: Readonly<ModelComparisonResult>,
  metadata: Readonly<RateExportMetadata>,
): string {
  const provenance = rateExportMetadataColumns(metadata).slice(1);
  return rowsToCsv(
    ["model_id", "criterion", "rate", "observed_capacity", "predicted_capacity", "residual", "rate_unit", "capacity_unit", ...provenanceHeaders],
    result.rows.flatMap((row) => row.predictions && row.residuals
      ? data.map((point, index) => [
        row.modelId,
        result.criterion ?? "",
        point.rate,
        point.capacity,
        row.predictions?.[index] ?? null,
        row.residuals?.[index] ?? null,
        metadata.analysisRateUnit,
        metadata.analysisCapacityUnit,
        ...provenance,
      ])
      : []),
  );
}

function serializeParameters(row: Readonly<ModelComparisonRow>): string {
  if (!row.parameters) return "";
  return `Q_M=${row.parameters.qM} [mAh-g-1];tau=${row.parameters.tau} [h];n=${row.parameters.n} [dimensionless]`;
}
