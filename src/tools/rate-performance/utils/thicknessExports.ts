import { rowsToCsv } from "../../../lib/toolExport";
import type { ThicknessSeriesOutcome } from "../analysis/fitThicknessSeries";
import type { ThicknessScalingConverged, ThicknessScalingFailure, ThicknessScalingFit } from "../analysis/thicknessScaling";
import type { RateNormalizationContext, RatePoint } from "../models/types";

export interface ThicknessSampleExportSource {
  readonly id: string;
  readonly sampleName: string;
  readonly thickness: number | null;
  readonly thicknessUnit: "um" | "mm" | "m";
  readonly massLoading: number | null;
  readonly modelId: string;
  readonly rateInput: Readonly<{
    mode: "manual" | "upload";
    points: ReadonlyArray<Readonly<RatePoint>>;
    normalizationContext: Readonly<RateNormalizationContext>;
  }>;
}

export interface ThicknessExportContext {
  readonly resultKind: "example" | "user";
  readonly exampleId: string | null;
  readonly sources: ReadonlyArray<Readonly<ThicknessSampleExportSource>>;
  readonly outcomes: ReadonlyArray<Readonly<ThicknessSeriesOutcome>>;
  readonly scalingFailure: Readonly<ThicknessScalingFailure["failure"]> | null;
}

function fallbackContext(result: Readonly<ThicknessScalingConverged> | null): ThicknessExportContext {
  return {
    resultKind: "user",
    exampleId: null,
    sources: result?.samples.map((sample) => ({
      id: sample.id,
      sampleName: sample.sampleName,
      thickness: sample.originalThickness,
      thicknessUnit: sample.originalThicknessUnit,
      massLoading: sample.massLoading ?? null,
      modelId: sample.modelId,
      rateInput: { mode: "manual", points: [], normalizationContext: {} },
    })) ?? [],
    outcomes: [],
    scalingFailure: null,
  };
}

function contextFor(result: Readonly<ThicknessScalingConverged> | null, context?: Readonly<ThicknessExportContext>) {
  return context ?? fallbackContext(result);
}

function prefix(context: Readonly<ThicknessExportContext>) {
  return [context.resultKind, context.exampleId] as Array<string | number | null>;
}

export function serializeThicknessSamplesCsv(
  result: Readonly<ThicknessScalingConverged> | null,
  provided?: Readonly<ThicknessExportContext>,
): string {
  const context = contextFor(result, provided);
  const outcomeById = new Map(context.outcomes.map((outcome) => [outcome.sampleId, outcome]));
  return rowsToCsv([
    "result_kind", "example_id", "sample_id", "sample_name", "original_thickness", "original_thickness_unit",
    "mass_loading", "mass_loading_unit", "model_id", "input_mode", "sample_status", "failure_code",
    "failure_message", "excluded_from_scaling", "exclusion_code", "exclusion_message",
    "point_id", "original_rate", "original_rate_unit", "original_capacity", "original_capacity_unit",
    "analysis_rate", "analysis_rate_unit", "analysis_capacity", "analysis_capacity_unit", "normalization_method",
    "measured_rate_confirmed", "theoretical_capacity", "theoretical_capacity_unit",
  ], context.sources.flatMap((source) => {
    const outcome = outcomeById.get(source.id);
    const normalizedById = new Map(outcome?.normalizedPoints.map((point) => [point.id, point]) ?? []);
    const points = source.rateInput.points.length > 0 ? source.rateInput.points : [null];
    return points.map((point) => {
      const normalized = point ? normalizedById.get(point.id) : undefined;
      const normalizationContext = source.rateInput.normalizationContext;
      const measuredRateConfirmed = normalized?.normalization.measuredRateConfirmed
        ?? normalizationContext.confirmHInverseMeasuredRate;
      const theoreticalCapacity = normalized?.normalization.theoreticalCapacity
        ?? normalizationContext.theoreticalCapacity?.value;
      const theoreticalCapacityUnit = normalized?.normalization.theoreticalCapacityUnit
        ?? normalizationContext.theoreticalCapacity?.unit;
      const scalingExclusion = context.scalingFailure?.sampleIds.includes(source.id) ? context.scalingFailure : null;
      const exclusionCode = outcome?.status === "failed" ? outcome.failureCode : scalingExclusion?.code ?? null;
      const exclusionMessage = outcome?.status === "failed" ? outcome.failureMessage : scalingExclusion?.message ?? null;
      return [
        ...prefix(context), source.id, source.sampleName, source.thickness, source.thicknessUnit,
        source.massLoading, "mg-cm-2", source.modelId, source.rateInput.mode, outcome?.status ?? "not-run",
        outcome?.status === "failed" ? outcome.failureCode : null,
        outcome?.status === "failed" ? outcome.failureMessage : null,
        exclusionCode === null ? "false" : "true", exclusionCode, exclusionMessage,
        point?.id ?? null, point?.rate ?? null, point?.rateUnit ?? null, point?.capacity ?? null, point?.capacityUnit ?? null,
        normalized?.analysisRate ?? null, normalized?.analysisRateUnit ?? null,
        normalized?.analysisCapacity ?? null, normalized?.analysisCapacityUnit ?? null,
        normalized?.normalization.method ?? null,
        measuredRateConfirmed === undefined ? null : String(measuredRateConfirmed),
        theoreticalCapacity ?? null,
        theoreticalCapacityUnit ?? null,
      ];
    });
  }));
}

export function serializeThicknessFitsCsv(
  result: Readonly<ThicknessScalingConverged> | null,
  provided?: Readonly<ThicknessExportContext>,
): string {
  const context = contextFor(result, provided);
  return rowsToCsv([
    "result_kind", "example_id", "sample_id", "sample_name", "status", "model_id", "model_equation", "reference_ids",
    "q_m", "tau_hours", "tau_seconds", "n", "tau_standard_error_hours", "tau_standard_error_seconds",
    "tau_ci95_lower_hours", "tau_ci95_upper_hours", "sse", "rmse", "r_squared", "adjusted_r_squared",
    "aic", "aicc", "bic", "iterations", "used_point_count", "warnings", "failure_code", "failure_message",
  ], context.outcomes.map((outcome) => {
    const fit = outcome.status === "converged" ? outcome.fit : null;
    const tau = fit?.parameters.tau ?? null;
    const tauUncertainty = fit?.uncertainty.parameters.tau;
    return [
      ...prefix(context), outcome.sampleId, outcome.sampleName, outcome.status, outcome.modelId,
      outcome.modelEquation, outcome.referenceIds.join("|"), fit?.parameters.qM ?? null, tau, tau === null ? null : tau * 3600,
      fit?.parameters.n ?? null, tauUncertainty?.standardError ?? null,
      tauUncertainty?.standardError == null ? null : tauUncertainty.standardError * 3600,
      tauUncertainty?.confidenceInterval95?.lower ?? null, tauUncertainty?.confidenceInterval95?.upper ?? null,
      fit?.statistics.sse ?? null, fit?.statistics.rmse ?? null, fit?.statistics.rSquared ?? null,
      fit?.statistics.adjustedRSquared ?? null, fit?.statistics.aic ?? null, fit?.statistics.aicc ?? null,
      fit?.statistics.bic ?? null, fit?.iterations ?? null, fit?.usedPointCount ?? null,
      fit?.warnings.map((warning) => warning.code).join(";") ?? null,
      outcome.status === "failed" ? outcome.failureCode : null,
      outcome.status === "failed" ? outcome.failureMessage : null,
    ];
  }));
}

function parameterText(fit: ThicknessScalingFit): string {
  switch (fit.modelId) {
    case "linear": return `interceptSeconds=${fit.parameters.interceptSeconds};slopeSecondsPerMetre=${fit.parameters.slopeSecondsPerMetre}`;
    case "quadratic": return `interceptSeconds=${fit.parameters.interceptSeconds};coefficientSecondsPerMetreSquared=${fit.parameters.coefficientSecondsPerMetreSquared}`;
    case "power": return `amplitude=${fit.parameters.amplitude};alpha=${fit.parameters.alpha};alphaStandardError=${fit.parameters.alphaStandardError ?? ""};alphaCi95Lower=${fit.parameters.alphaConfidenceInterval95?.lower ?? ""};alphaCi95Upper=${fit.parameters.alphaConfidenceInterval95?.upper ?? ""}`;
  }
}

export function serializeThicknessScalingCsv(
  result: Readonly<ThicknessScalingConverged> | null,
  provided?: Readonly<ThicknessExportContext>,
): string {
  const context = contextFor(result, provided);
  const rows = result ? Object.values(result.fits).map((fit) => [
    ...prefix(context), "converged", fit.modelId, fit.equation, parameterText(fit),
    fit.modelId === "power" ? "s·m^-alpha" : null,
    fit.statistics.sse, fit.statistics.rmse, fit.statistics.rSquared, fit.statistics.adjustedRSquared,
    result.criterion.name, fit.criterionValue, fit.modelId === result.bestModelId ? "true" : "false",
    result.bestModelId, result.weighting, result.criterion.comparisonScale, result.criterion.purpose,
    null, null,
  ]) : [[
    ...prefix(context), "failed", null, null, null, null, null, null, null, null,
    "RMSE", null, "false", null, null, "tau-seconds", "descriptive",
    context.scalingFailure?.code ?? null, context.scalingFailure?.message ?? null,
  ]];
  return rowsToCsv([
    "result_kind", "example_id", "status", "model_id", "equation", "parameters", "amplitude_unit",
    "sse", "rmse", "r_squared", "adjusted_r_squared", "descriptive_metric", "descriptive_rmse",
    "unique_lowest_rmse", "lowest_rmse_model_id", "weighting", "comparison_scale", "comparison_purpose",
    "failure_code", "failure_message",
  ], rows);
}

export function serializeThicknessResidualsCsv(
  result: Readonly<ThicknessScalingConverged> | null,
  provided?: Readonly<ThicknessExportContext>,
): string {
  const context = contextFor(result, provided);
  const sourceById = new Map(context.sources.map((source) => [source.id, source]));
  return rowsToCsv([
    "result_kind", "example_id", "model_id", "sample_id", "sample_name", "original_thickness",
    "original_thickness_unit", "thickness_metres", "observed_tau_seconds", "predicted_tau_seconds",
    "residual_seconds", "comparison_scale",
  ], result ? Object.values(result.fits).flatMap((fit) => fit.residuals.map((residual) => {
    const source = sourceById.get(residual.sampleId);
    return [
      ...prefix(context), fit.modelId, residual.sampleId, source?.sampleName ?? residual.sampleId,
      source?.thickness ?? null, source?.thicknessUnit ?? null, residual.thicknessMetres,
      residual.observedTauSeconds, residual.predictedTauSeconds, residual.residualSeconds,
      result.criterion.comparisonScale,
    ];
  })) : []);
}

export function serializeThicknessProvenanceCsv(
  result: Readonly<ThicknessScalingConverged> | null,
  provided?: Readonly<ThicknessExportContext>,
): string {
  const context = contextFor(result, provided);
  return rowsToCsv(["sample_id", "field", "value"], [
    [null, "result_kind", context.resultKind],
    [null, "example_id", context.exampleId],
    [null, "source_tau_unit", "h"],
    [null, "analysis_tau_unit", "s"],
    [null, "analysis_thickness_unit", "m"],
    [null, "fit_uses_all_valid_points", "true"],
    [null, "failed_samples_excluded", "true"],
    [null, "duplicate_thickness_policy", "reject; never average or merge"],
    [null, "minimum_distinct_thicknesses", 3],
    [null, "descriptive_metric", "original-tau RMSE"],
    [null, "comparison_is_likelihood_ranking", "false"],
    [null, "power_amplitude_unit", "s·m^-alpha"],
    [null, "failed_sample_ids", context.outcomes.filter(({ status }) => status === "failed").map(({ sampleId }) => sampleId).join("|")],
    [null, "interpretation_boundary", "Scaling association alone cannot identify a unique physical mechanism."],
    ...(context.scalingFailure ? [
      [null, "scaling_failure_code", context.scalingFailure.code],
      [null, "scaling_failure_message", context.scalingFailure.message],
      [null, "scaling_failure_sample_ids", context.scalingFailure.sampleIds.join("|")],
    ] : []),
    ...context.outcomes.flatMap((outcome) => [
      [outcome.sampleId, "sample_name", outcome.sampleName],
      [outcome.sampleId, "status", outcome.status],
      [outcome.sampleId, "model_id", outcome.modelId],
      [outcome.sampleId, "model_equation", outcome.modelEquation],
      [outcome.sampleId, "reference_ids", outcome.referenceIds.join("|")],
      ...(outcome.status === "failed" ? [
        [outcome.sampleId, "failure_code", outcome.failureCode],
        [outcome.sampleId, "failure_message", outcome.failureMessage],
      ] : []),
    ]),
  ]);
}
