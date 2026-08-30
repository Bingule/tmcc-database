import type {
  ThicknessScalingConverged,
  ThicknessScalingFit,
} from "../analysis/thicknessScaling";
import type { RateFitConverged } from "../analysis/fitRatePerformance";
import type { RateNormalizationContext, RatePoint } from "../models/types";

export interface ThicknessSampleExportSource {
  readonly id: string;
  readonly sampleName: string;
  readonly thickness: number | null;
  readonly thicknessUnit: "um" | "mm" | "m";
  readonly massLoading: number | null;
  readonly rateInput: Readonly<{
    mode: "manual" | "upload";
    points: ReadonlyArray<Readonly<RatePoint>>;
    normalizationContext: Readonly<RateNormalizationContext>;
  }>;
}

export interface ThicknessFitExportRecord {
  readonly sampleId: string;
  readonly sampleName: string;
  readonly fit: Readonly<RateFitConverged>;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

export function serializeThicknessSamplesCsv(
  result: Readonly<ThicknessScalingConverged>,
  sources: ReadonlyArray<Readonly<ThicknessSampleExportSource>> = [],
): string {
  const normalizedById = new Map(result.samples.map((sample) => [sample.id, sample]));
  const exportSources: ReadonlyArray<Readonly<ThicknessSampleExportSource>> = sources.length > 0
    ? sources
    : result.samples.map((sample) => ({
      id: sample.id,
      sampleName: sample.sampleName,
      thickness: sample.originalThickness,
      thicknessUnit: sample.originalThicknessUnit,
      massLoading: sample.massLoading ?? null,
      rateInput: { mode: "manual", points: [], normalizationContext: {} },
    }));
  return csv([
    "sample_id", "sample_name", "original_thickness", "original_thickness_unit",
    "thickness_metres", "thickness_micrometres", "mass_loading", "mass_loading_unit", "input_mode",
    "included_in_scaling", "point_id", "original_rate", "original_rate_unit", "original_capacity", "original_capacity_unit",
  ], exportSources.flatMap((source) => {
    const normalized = normalizedById.get(source.id);
    const points = source.rateInput.points;
    const rows = points.length > 0 ? points : [null];
    return rows.map((point) => [
      source.id, source.sampleName, source.thickness, source.thicknessUnit,
      normalized?.thicknessMetres, normalized?.thicknessMicrometres, source.massLoading, "mg-cm-2", source.rateInput.mode,
      normalized !== undefined,
      point?.id, point?.rate, point?.rateUnit, point?.capacity, point?.capacityUnit,
    ]);
  }));
}

export function serializeThicknessFitsCsv(
  result: Readonly<ThicknessScalingConverged>,
  records: ReadonlyArray<Readonly<ThicknessFitExportRecord>> = [],
): string {
  const recordById = new Map(records.map((record) => [record.sampleId, record]));
  return csv([
    "sample_id", "sample_name", "q_m", "tau_hours", "tau_seconds", "n", "tau_standard_error_hours",
    "tau_standard_error_seconds", "tau_ci95_lower_hours", "tau_ci95_upper_hours", "sse", "rmse",
    "r_squared", "adjusted_r_squared", "aic", "aicc", "bic", "iterations", "used_point_count",
    "warnings", "source_model", "fit_uses_all_valid_points",
  ], result.samples.map((sample) => {
    const fit = recordById.get(sample.id)?.fit;
    const tauUncertainty = fit?.uncertainty.parameters.tau;
    return [
      sample.id, sample.sampleName, fit?.parameters.qM, fit?.parameters.tau ?? sample.tau,
      (fit?.parameters.tau ?? sample.tau) * 3600, fit?.parameters.n,
      tauUncertainty?.standardError ?? sample.tauStandardError,
      (tauUncertainty?.standardError ?? sample.tauStandardError) == null
        ? null : (tauUncertainty?.standardError ?? sample.tauStandardError as number) * 3600,
      tauUncertainty?.confidenceInterval95?.lower, tauUncertainty?.confidenceInterval95?.upper,
      fit?.statistics.sse, fit?.statistics.rmse, fit?.statistics.rSquared, fit?.statistics.adjustedRSquared,
      fit?.statistics.aic, fit?.statistics.aicc, fit?.statistics.bic, fit?.iterations, fit?.usedPointCount,
      fit?.warnings.map((warning) => warning.code).join(";"), fit?.modelId ?? "tian-characteristic-time", true,
    ];
  }));
}

function parameterText(fit: ThicknessScalingFit): string {
  switch (fit.modelId) {
    case "linear":
      return `interceptSeconds=${fit.parameters.interceptSeconds};slopeSecondsPerMetre=${fit.parameters.slopeSecondsPerMetre}`;
    case "quadratic":
      return `interceptSeconds=${fit.parameters.interceptSeconds};coefficientSecondsPerMetreSquared=${fit.parameters.coefficientSecondsPerMetreSquared}`;
    case "power":
      return [
        `amplitude=${fit.parameters.amplitude}`,
        `alpha=${fit.parameters.alpha}`,
        `alphaStandardError=${fit.parameters.alphaStandardError ?? ""}`,
        `alphaCi95Lower=${fit.parameters.alphaConfidenceInterval95?.lower ?? ""}`,
        `alphaCi95Upper=${fit.parameters.alphaConfidenceInterval95?.upper ?? ""}`,
      ].join(";");
  }
}

export function serializeThicknessScalingCsv(result: Readonly<ThicknessScalingConverged>): string {
  return csv([
    "model_id", "equation", "parameters", "sse", "rmse", "r_squared", "adjusted_r_squared",
    "aic", "aicc", "bic", "criterion", "criterion_value", "ranked_best", "weighting",
    "comparison_scale",
  ], Object.values(result.fits).map((fit) => [
    fit.modelId, fit.equation, parameterText(fit), fit.statistics.sse, fit.statistics.rmse,
    fit.statistics.rSquared, fit.statistics.adjustedRSquared, fit.statistics.aic,
    fit.statistics.aicc, fit.statistics.bic, result.criterion.name, fit.criterionValue,
    fit.modelId === result.bestModelId, result.weighting, result.criterion.comparisonScale,
  ]));
}

export function serializeThicknessResidualsCsv(result: Readonly<ThicknessScalingConverged>): string {
  return csv([
    "model_id", "sample_id", "thickness_metres", "observed_tau_seconds",
    "predicted_tau_seconds", "residual_seconds", "comparison_scale",
  ], Object.values(result.fits).flatMap((fit) => fit.residuals.map((residual) => [
    fit.modelId, residual.sampleId, residual.thicknessMetres, residual.observedTauSeconds,
    residual.predictedTauSeconds, residual.residualSeconds, result.criterion.comparisonScale,
  ])));
}

export function serializeThicknessProvenanceCsv(
  result: Readonly<ThicknessScalingConverged>,
  sources: ReadonlyArray<Readonly<ThicknessSampleExportSource>> = [],
): string {
  return csv(["sample_id", "field", "value"], [
    [null, "source_fit_model", "tian-characteristic-time"],
    [null, "source_tau_unit", "h"],
    [null, "analysis_tau_unit", "s"],
    [null, "analysis_thickness_unit", "m"],
    [null, "fit_uses_all_valid_points", true],
    [null, "failed_samples_excluded", true],
    [null, "duplicate_thickness_policy", "reject; never average or merge"],
    [null, "minimum_distinct_thicknesses", 3],
    [null, "weighting", result.weighting],
    [null, "comparison_criterion", result.criterion.name],
    [null, "comparison_logic", result.criterion.logic],
    [null, "interpretation_boundary", "Scaling association alone cannot identify a unique physical mechanism."],
    ...sources.flatMap((source) => [
      [source.id, "input_mode", source.rateInput.mode],
      [source.id, "measured_rate_confirmed", source.rateInput.normalizationContext.confirmHInverseMeasuredRate === true],
      [source.id, "theoretical_capacity", source.rateInput.normalizationContext.theoreticalCapacity?.value],
      [source.id, "theoretical_capacity_unit", source.rateInput.normalizationContext.theoreticalCapacity?.unit],
    ]),
  ]);
}
