import { rowsToCsv } from "../../../lib/toolExport";
import type {
  ModelComparisonResult,
  ModelComparisonRow,
} from "../analysis/compareRateModels";
import type { RateFitPoint } from "../analysis/fitRatePerformance";

export function serializeModelComparisonCsv(result: Readonly<ModelComparisonResult>): string {
  return rowsToCsv(
    [
      "model_id", "equation_type", "parameters", "parameter_count", "r_squared",
      "adjusted_r_squared", "rmse", "aic", "aicc", "bic", "criterion",
      "delta_criterion", "convergence", "rank", "failure_code",
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
    ]),
  );
}

export function serializeModelComparisonResidualsCsv(
  data: ReadonlyArray<Readonly<RateFitPoint>>,
  result: Readonly<ModelComparisonResult>,
): string {
  return rowsToCsv(
    ["model_id", "rate", "observed_capacity", "predicted_capacity", "residual", "rate_unit", "capacity_unit"],
    result.rows.flatMap((row) => row.predictions && row.residuals
      ? data.map((point, index) => [
        row.modelId,
        point.rate,
        point.capacity,
        row.predictions?.[index] ?? null,
        row.residuals?.[index] ?? null,
        "h-1",
        "mAh-g-1",
      ])
      : []),
  );
}

function serializeParameters(row: Readonly<ModelComparisonRow>): string {
  if (!row.parameters) return "";
  return `Q_M=${row.parameters.qM};tau=${row.parameters.tau};n=${row.parameters.n}`;
}
