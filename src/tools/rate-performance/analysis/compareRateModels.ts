import { getRateModel } from "../models/registry";
import type {
  CharacteristicTimeRateParameters,
  RateModelDefinition,
} from "../models/types";
import {
  fitRatePerformance,
  type RateFitFailureCode,
  type RateFitOptions,
  type RateFitPoint,
  type RateFitResult,
} from "./fitRatePerformance";
import type { FitStatistics } from "./fitStatistics";

export type ModelComparisonErrorCode =
  | "noModelsSelected"
  | "duplicateModelId"
  | "modelUnknown"
  | "modelPendingValidation";

export class ModelComparisonError extends Error {
  readonly code: ModelComparisonErrorCode;
  readonly modelId?: string;

  constructor(code: ModelComparisonErrorCode, modelId?: string) {
    super(comparisonErrorMessage(code, modelId));
    this.name = "ModelComparisonError";
    this.code = code;
    this.modelId = modelId;
  }
}

export type ModelComparisonCriterion = "AICc" | "AIC";

export type ModelRecommendationReason =
  | "recommended"
  | "singleModel"
  | "incompleteFits"
  | "criterionUnavailable"
  | "insufficientEvidence";

export interface ModelComparisonRow {
  readonly modelId: string;
  readonly modelName: string;
  readonly equationType: string;
  readonly parameterCount: number;
  readonly parameters: Readonly<CharacteristicTimeRateParameters> | null;
  readonly statistics: Readonly<FitStatistics> | null;
  readonly predictions: ReadonlyArray<number> | null;
  readonly residuals: ReadonlyArray<number> | null;
  readonly convergence: "converged" | "failed";
  readonly failureCode: RateFitFailureCode | null;
  readonly rank: number | null;
  readonly deltaCriterion: number | null;
}

export interface ModelComparisonResult {
  readonly rows: ReadonlyArray<Readonly<ModelComparisonRow>>;
  readonly criterion: ModelComparisonCriterion | null;
  readonly recommendation: string | null;
  readonly recommendationReason: ModelRecommendationReason;
  readonly usedPointCount: number;
}

export interface ModelComparisonOptions {
  readonly signal?: AbortSignal;
}

type ComparisonFitter = (
  data: ReadonlyArray<RateFitPoint>,
  options: RateFitOptions,
) => Promise<RateFitResult>;

export interface ModelComparatorDependencies {
  readonly fit: ComparisonFitter;
  readonly resolveModel: (id: string) => Readonly<RateModelDefinition> | undefined;
}

/** Relative/absolute tolerance used when information-criterion values tie. */
export const MODEL_COMPARISON_TIE_TOLERANCE = 1e-9;

/**
 * Compare validated registry models against the same complete scientific data.
 * Model IDs are fully gated before any optimizer work begins.
 */
export function createRateModelComparator(
  dependencies: ModelComparatorDependencies,
): (
  data: ReadonlyArray<RateFitPoint>,
  modelIds: ReadonlyArray<string>,
  options?: ModelComparisonOptions,
) => Promise<ModelComparisonResult> {
  return async (data, modelIds, options = {}) => {
    const models = validateSelection(modelIds, dependencies.resolveModel);
    const settled = await Promise.allSettled(models.map((model) => Promise.resolve().then(() => (
      dependencies.fit(data, {
        modelId: model.id,
        signal: options.signal,
      })
    ))));
    const fits = settled.map((outcome, index): RateFitResult => outcome.status === "fulfilled"
      ? outcome.value
      : rejectedFit(models[index].id, outcome.reason, options.signal));
    return buildComparisonResult(data.length, models, fits);
  };
}

function rejectedFit(modelId: string, reason: unknown, signal?: AbortSignal): RateFitResult {
  const cancelled = signal?.aborted === true;
  return {
    status: "failed",
    modelId,
    failure: {
      code: cancelled ? "cancelled" : "optimizer-error",
      message: cancelled
        ? "The shared comparison was cancelled."
        : reason instanceof Error
          ? reason.message
          : "The model fitter rejected without an Error value.",
    },
    iterations: 0,
    iterationCountExact: true,
    warnings: [],
  };
}

function validateSelection(
  modelIds: ReadonlyArray<string>,
  resolveModel: ModelComparatorDependencies["resolveModel"],
): ReadonlyArray<Readonly<RateModelDefinition>> {
  if (modelIds.length === 0) throw new ModelComparisonError("noModelsSelected");
  const seen = new Set<string>();
  const models: RateModelDefinition[] = [];
  for (const modelId of modelIds) {
    if (seen.has(modelId)) throw new ModelComparisonError("duplicateModelId", modelId);
    seen.add(modelId);
    const model = resolveModel(modelId);
    if (!model) throw new ModelComparisonError("modelUnknown", modelId);
    if (model.status !== "validated" || !model.fit) {
      throw new ModelComparisonError("modelPendingValidation", modelId);
    }
    models.push(model);
  }
  return models;
}

function buildComparisonResult(
  usedPointCount: number,
  models: ReadonlyArray<Readonly<RateModelDefinition>>,
  fits: ReadonlyArray<Readonly<RateFitResult>>,
): ModelComparisonResult {
  const candidates = fits.filter((fit): fit is Extract<RateFitResult, { status: "converged" }> => (
    fit.status === "converged"
  ));
  const criterion: ModelComparisonCriterion | null = candidates.length === 0
    ? null
    : candidates.every(({ statistics }) => finite(statistics.aicc))
      ? "AICc"
      : "AIC";
  const valueFor = (fit: Readonly<RateFitResult>): number | null => {
    if (fit.status !== "converged" || !criterion) return null;
    const value = criterion === "AICc" ? fit.statistics.aicc : fit.statistics.aic;
    return finite(value) ? value : null;
  };
  const bestValue = fits.reduce<number | null>((best, fit) => {
    const value = valueFor(fit);
    return value === null || (best !== null && best <= value) ? best : value;
  }, null);
  const byId = new Map(models.map((model) => [model.id, model]));
  const rows = fits.map((fit, selectionIndex) => {
    const model = byId.get(fit.modelId);
    if (!model) throw new Error(`Fitter returned an unselected model: ${fit.modelId}`);
    const criterionValue = valueFor(fit);
    return {
      selectionIndex,
      criterionValue,
      row: fit.status === "converged" ? {
        modelId: model.id,
        modelName: model.name,
        equationType: model.family,
        parameterCount: model.parameters.length,
        parameters: fit.parameters,
        statistics: fit.statistics,
        predictions: fit.predictions,
        residuals: fit.residuals,
        convergence: "converged" as const,
        failureCode: null,
        rank: null,
        deltaCriterion: criterionValue !== null && bestValue !== null ? criterionValue - bestValue : null,
      } : {
        modelId: model.id,
        modelName: model.name,
        equationType: model.family,
        parameterCount: model.parameters.length,
        parameters: null,
        statistics: null,
        predictions: null,
        residuals: null,
        convergence: "failed" as const,
        failureCode: fit.failure.code,
        rank: null,
        deltaCriterion: null,
      },
    };
  }).sort((left, right) => {
    if (left.criterionValue !== null && right.criterionValue !== null) {
      return left.criterionValue - right.criterionValue || left.selectionIndex - right.selectionIndex;
    }
    if (left.criterionValue !== null) return -1;
    if (right.criterionValue !== null) return 1;
    if (left.row.convergence !== right.row.convergence) return left.row.convergence === "converged" ? -1 : 1;
    return left.selectionIndex - right.selectionIndex;
  });

  // Competition ranking: ties share a rank and the next rank skips the tied places (1, 1, 3).
  let previousCriterion: number | null = null;
  let previousRank = 0;
  let rankedCount = 0;
  const rankedRows = rows.map(({ row, criterionValue }) => {
    if (criterionValue === null) return row;
    rankedCount += 1;
    const rank = previousCriterion !== null && criterionTie(previousCriterion, criterionValue)
      ? previousRank
      : rankedCount;
    previousCriterion = criterionValue;
    previousRank = rank;
    return { ...row, rank };
  });
  const recommendation = recommendationFor(rankedRows, models.length);
  return {
    rows: rankedRows,
    criterion,
    recommendation: recommendation.modelId,
    recommendationReason: recommendation.reason,
    usedPointCount,
  };
}

function recommendationFor(
  rows: ReadonlyArray<Readonly<ModelComparisonRow>>,
  selectedCount: number,
): Readonly<{ modelId: string | null; reason: ModelRecommendationReason }> {
  if (selectedCount === 1) return { modelId: null, reason: "singleModel" };
  if (rows.some(({ convergence }) => convergence !== "converged")) {
    return { modelId: null, reason: "incompleteFits" };
  }
  if (rows.some(({ rank, deltaCriterion }) => rank === null || deltaCriterion === null)) {
    return { modelId: null, reason: "criterionUnavailable" };
  }
  const bestRows = rows.filter(({ rank }) => rank === 1);
  if (bestRows.length !== 1) return { modelId: null, reason: "insufficientEvidence" };
  const best = bestRows[0];
  const runnerUp = rows.find(({ rank }) => rank === 2);
  if (!best || !runnerUp || (runnerUp.deltaCriterion ?? 0) < 2) {
    return { modelId: null, reason: "insufficientEvidence" };
  }
  return { modelId: best.modelId, reason: "recommended" };
}

function criterionTie(left: number, right: number): boolean {
  return Math.abs(left - right) <= MODEL_COMPARISON_TIE_TOLERANCE
    * Math.max(1, Math.abs(left), Math.abs(right));
}

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function comparisonErrorMessage(code: ModelComparisonErrorCode, modelId?: string): string {
  switch (code) {
    case "noModelsSelected": return "Select at least one validated model for comparison.";
    case "duplicateModelId": return `The comparison selection contains the duplicate model ID ${modelId ?? ""}.`;
    case "modelUnknown": return `The model ${modelId ?? ""} is not registered.`;
    case "modelPendingValidation": return `The model ${modelId ?? ""} has not passed scientific validation.`;
  }
}

export const compareRateModels = createRateModelComparator({
  fit: fitRatePerformance,
  resolveModel: getRateModel,
});
