import { getRateModel } from "../models/registry";
import type { CharacteristicTimeRateParameters, RateModelFitFunction } from "../models/types";
import {
  estimateConfidenceIntervals,
  type CharacteristicTimeParameterBounds,
  type ConfidenceIntervalResult,
  type ConfidenceWarning,
  type NumericParameterBounds,
} from "./confidenceIntervals";
import { calculateFitStatistics, type FitStatistics } from "./fitStatistics";

export interface RateFitPoint {
  readonly rate: number;
  readonly capacity: number;
}

export type RateFitFailureCode =
  | "model-not-found"
  | "model-not-validated"
  | "invalid-data"
  | "insufficient-data"
  | "invalid-options"
  | "cancelled"
  | "timeout"
  | "maximum-iterations"
  | "optimizer-error"
  | "non-finite-result"
  | "non-finite-prediction";

export type RateFitWarning = ConfidenceWarning | Readonly<{ code: "duplicate-rate"; rate: number }>;

export interface RateFitOptions {
  readonly modelId: string;
  readonly maxIterations?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly bounds?: Partial<Record<keyof CharacteristicTimeRateParameters, NumericParameterBounds>>;
}

export interface RateFitConverged {
  readonly status: "converged";
  readonly modelId: string;
  readonly parameters: Readonly<CharacteristicTimeRateParameters>;
  readonly predictions: ReadonlyArray<number>;
  readonly residuals: ReadonlyArray<number>;
  readonly statistics: Readonly<FitStatistics>;
  readonly uncertainty: Readonly<ConfidenceIntervalResult>;
  readonly iterations: number;
  readonly usedPointCount: number;
  readonly warnings: ReadonlyArray<RateFitWarning>;
}

export interface RateFitFailure {
  readonly status: "failed";
  readonly modelId: string;
  readonly failure: Readonly<{ code: RateFitFailureCode; message: string }>;
  readonly iterations: number;
  readonly warnings: ReadonlyArray<RateFitWarning>;
}

export type RateFitResult = RateFitConverged | RateFitFailure;

interface OptimizedStart {
  readonly parameters: CharacteristicTimeRateParameters;
  readonly sse: number;
  readonly iterations: number;
  readonly converged: boolean;
}

interface OptimizerResult {
  readonly parameterValues: number[];
  readonly parameterError: number;
  readonly iterations: number;
}

interface OptimizerOptions {
  readonly initialValues: ReadonlyArray<number>;
  readonly minValues: ReadonlyArray<number>;
  readonly maxValues: ReadonlyArray<number>;
  readonly maxIterations: number;
  readonly errorTolerance: number;
  readonly timeout: number;
  readonly jacobianFunction: (parameters: number[]) => (rate: number) => number[];
}

type OptimizerFunction = (
  data: Readonly<{ x: ReadonlyArray<number>; y: ReadonlyArray<number> }>,
  parameterizedFunction: (parameters: number[]) => (rate: number) => number,
  options: OptimizerOptions,
) => OptimizerResult;

const parameterIds = ["qM", "tau", "n"] as const;
const defaultMaxIterations = 240;
const defaultTimeoutMs = 2_000;

function failed(
  modelId: string,
  code: RateFitFailureCode,
  message: string,
  iterations = 0,
  warnings: ReadonlyArray<RateFitWarning> = [],
): RateFitFailure {
  return { status: "failed", modelId, failure: { code, message }, iterations, warnings };
}

function finitePositiveBound(value: number): number {
  return Math.exp(Math.min(690, Math.max(-690, value)));
}

function deriveBounds(data: ReadonlyArray<RateFitPoint>): CharacteristicTimeParameterBounds {
  const maximumCapacity = Math.max(...data.map(({ capacity }) => capacity), 1);
  const minimumRate = Math.min(...data.map(({ rate }) => rate));
  const maximumRate = Math.max(...data.map(({ rate }) => rate));

  return {
    qM: {
      minimum: Math.max(maximumCapacity * 1e-8, Number.MIN_VALUE),
      maximum: finitePositiveBound(Math.log(maximumCapacity) + Math.log(20)),
    },
    tau: {
      minimum: finitePositiveBound(-Math.log(maximumRate) - Math.log(1e6)),
      maximum: finitePositiveBound(-Math.log(minimumRate) + Math.log(1e6)),
    },
    n: { minimum: 0.05, maximum: 3 },
  };
}

function mergeBounds(
  derived: CharacteristicTimeParameterBounds,
  overrides: RateFitOptions["bounds"],
): CharacteristicTimeParameterBounds | null {
  const merged = {} as Record<keyof CharacteristicTimeRateParameters, NumericParameterBounds>;
  for (const parameter of parameterIds) {
    const bounds = overrides?.[parameter] ?? derived[parameter];
    if (
      !Number.isFinite(bounds.minimum)
      || !Number.isFinite(bounds.maximum)
      || bounds.minimum <= 0
      || bounds.maximum <= bounds.minimum
    ) {
      return null;
    }
    merged[parameter] = { minimum: bounds.minimum, maximum: bounds.maximum };
  }
  return merged;
}

function clamp(value: number, bounds: NumericParameterBounds): number {
  return Math.min(bounds.maximum, Math.max(bounds.minimum, value));
}

function deterministicStarts(
  data: ReadonlyArray<RateFitPoint>,
  bounds: CharacteristicTimeParameterBounds,
): CharacteristicTimeRateParameters[] {
  const sortedRates = data.map(({ rate }) => rate).sort((left, right) => left - right);
  const maximumCapacity = Math.max(...data.map(({ capacity }) => capacity), bounds.qM.minimum);
  const targetCapacity = maximumCapacity / 2;
  const transitionPoint = data.reduce((best, point) => (
    Math.abs(point.capacity - targetCapacity) < Math.abs(best.capacity - targetCapacity) ? point : best
  ));
  const geometricMeanRate = Math.exp(
    sortedRates.reduce((sum, rate) => sum + Math.log(rate), 0) / sortedRates.length,
  );
  const baseQM = maximumCapacity * 1.05;
  const baseTau = 1 / transitionPoint.rate;
  const candidates: CharacteristicTimeRateParameters[] = [
    { qM: baseQM, tau: baseTau, n: 0.65 },
    { qM: maximumCapacity * 1.2, tau: 1 / geometricMeanRate, n: 0.45 },
    { qM: maximumCapacity * 1.5, tau: baseTau * 0.25, n: 1 },
    { qM: baseQM, tau: baseTau * 4, n: 1.4 },
    { qM: maximumCapacity * 2, tau: 1 / sortedRates[Math.floor(sortedRates.length / 2)], n: 2 },
  ];

  const unique = new Map<string, CharacteristicTimeRateParameters>();
  for (const candidate of candidates) {
    const bounded = {
      qM: clamp(candidate.qM, bounds.qM),
      tau: clamp(candidate.tau, bounds.tau),
      n: clamp(candidate.n, bounds.n),
    };
    unique.set(parameterIds.map((parameter) => bounded[parameter].toPrecision(12)).join(":"), bounded);
  }
  return [...unique.values()];
}

function decodeParameters(encoded: ReadonlyArray<number>): CharacteristicTimeRateParameters {
  return { qM: Math.exp(encoded[0]), tau: Math.exp(encoded[1]), n: Math.exp(encoded[2]) };
}

function encodeParameters(parameters: CharacteristicTimeRateParameters): number[] {
  return parameterIds.map((parameter) => Math.log(parameters[parameter]));
}

function predictionsFor(
  data: ReadonlyArray<RateFitPoint>,
  parameters: CharacteristicTimeRateParameters,
  evaluate: RateModelFitFunction,
): number[] | null {
  try {
    const predictions = data.map(({ rate }) => evaluate(rate, parameters));
    return predictions.every(Number.isFinite) ? predictions : null;
  } catch {
    return null;
  }
}

function sumSquaredError(observed: ReadonlyArray<number>, predicted: ReadonlyArray<number>): number {
  return observed.reduce((sum, value, index) => {
    const residual = value - predicted[index];
    return sum + residual * residual;
  }, 0);
}

function encodedJacobian(evaluate: RateModelFitFunction) {
  return (encoded: number[]) => (rate: number): number[] => {
    const derivatives: number[] = [];
    for (let index = 0; index < encoded.length; index++) {
      const step = 1e-5;
      const lower = [...encoded];
      const upper = [...encoded];
      lower[index] -= step;
      upper[index] += step;
      const lowerValue = evaluate(rate, decodeParameters(lower));
      const upperValue = evaluate(rate, decodeParameters(upper));
      derivatives.push((upperValue - lowerValue) / (2 * step));
    }
    return derivatives;
  };
}

function relativeParameterMovement(previous: ReadonlyArray<number>, current: ReadonlyArray<number>): number {
  return Math.max(...current.map((value, index) => Math.abs(value - previous[index])));
}

function relativeSseImprovement(previous: number, current: number): number {
  return Math.abs(previous - current) / Math.max(1, Math.abs(previous), Math.abs(current));
}

async function optimizeStart(
  optimizer: OptimizerFunction,
  data: ReadonlyArray<RateFitPoint>,
  evaluate: RateModelFitFunction,
  start: CharacteristicTimeRateParameters,
  bounds: CharacteristicTimeParameterBounds,
  maxIterations: number,
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<OptimizedStart | RateFitFailureCode> {
  const observed = data.map(({ capacity }) => capacity);
  const x = data.map(({ rate }) => rate);
  const energyScale = observed.reduce((sum, value) => sum + value * value, 0);
  const absoluteTolerance = Math.max(1e-24, energyScale * 1e-20);
  const encodedMinimum = parameterIds.map((parameter) => Math.log(bounds[parameter].minimum));
  const encodedMaximum = parameterIds.map((parameter) => Math.log(bounds[parameter].maximum));
  let encoded = encodeParameters(start);
  const initialPredictions = predictionsFor(data, start, evaluate);
  if (!initialPredictions) return "non-finite-prediction";
  let previousSse = sumSquaredError(observed, initialPredictions);
  let totalIterations = 0;
  let confirmations = 0;

  while (totalIterations < maxIterations) {
    if (signal?.aborted) return "cancelled";
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return "timeout";
    const batchIterations = Math.min(24, maxIterations - totalIterations);
    let optimized: OptimizerResult;
    try {
      optimized = optimizer(
        { x, y: observed },
        (candidate) => {
          const parameters = decodeParameters(candidate);
          return (rate) => evaluate(rate, parameters);
        },
        {
          initialValues: encoded,
          minValues: encodedMinimum,
          maxValues: encodedMaximum,
          maxIterations: batchIterations,
          errorTolerance: absoluteTolerance,
          timeout: remainingMs / 1000,
          jacobianFunction: encodedJacobian(evaluate),
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return message.includes("execution time") ? "timeout" : "optimizer-error";
    }
    totalIterations += optimized.iterations;
    if (signal?.aborted) return "cancelled";
    if (!optimized.parameterValues.every(Number.isFinite) || !Number.isFinite(optimized.parameterError)) {
      return "non-finite-result";
    }

    const parameters = decodeParameters(optimized.parameterValues);
    if (!parameterIds.every((parameter) => Number.isFinite(parameters[parameter]))) {
      return "non-finite-result";
    }
    const predictions = predictionsFor(data, parameters, evaluate);
    if (!predictions) return "non-finite-prediction";
    const currentSse = sumSquaredError(observed, predictions);
    if (!Number.isFinite(currentSse)) return "non-finite-result";

    const optimizerReportedConvergence = optimized.iterations < batchIterations;
    const stable = relativeSseImprovement(previousSse, currentSse) <= 1e-10
      && relativeParameterMovement(encoded, optimized.parameterValues) <= 1e-7;
    confirmations = stable ? confirmations + 1 : 0;
    encoded = [...optimized.parameterValues];
    previousSse = currentSse;

    if (optimizerReportedConvergence || confirmations >= 1) {
      return { parameters, sse: currentSse, iterations: totalIterations, converged: true };
    }
    if (optimized.iterations === 0) break;
  }

  return {
    parameters: decodeParameters(encoded),
    sse: previousSse,
    iterations: totalIterations,
    converged: false,
  };
}

/**
 * Fit a validated characteristic-time model to every supplied point.
 *
 * AbortSignal cancellation is checked between deterministic starts and bounded
 * optimizer batches. The optimizer itself is synchronous, so its timeout option
 * is also passed through to provide an in-loop execution gate.
 */
export async function fitRatePerformance(
  data: ReadonlyArray<RateFitPoint>,
  options: RateFitOptions,
): Promise<RateFitResult> {
  const { modelId } = options;
  const model = getRateModel(modelId);
  if (!model) return failed(modelId, "model-not-found", "The requested rate model is not registered.");
  if (model.status !== "validated" || !model.fit) {
    return failed(modelId, "model-not-validated", "The requested rate model has not passed the validation gate.");
  }
  if (data.some(({ rate, capacity }) => (
    !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(capacity) || capacity < 0
  ))) {
    return failed(modelId, "invalid-data", "Rates must be positive and all rates and capacities must be finite.");
  }
  if (data.length <= parameterIds.length) {
    return failed(modelId, "insufficient-data", "More observations than fitted parameters are required.");
  }

  const maxIterations = options.maxIterations ?? defaultMaxIterations;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isInteger(maxIterations) || maxIterations <= 0 || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    return failed(modelId, "invalid-options", "Iteration and timeout limits must be finite positive controls.");
  }
  if (options.signal?.aborted) return failed(modelId, "cancelled", "The fit was cancelled before optimization.");
  if (timeoutMs === 0) return failed(modelId, "timeout", "The fit timeout elapsed before optimization.");

  const derivedBounds = deriveBounds(data);
  const bounds = mergeBounds(derivedBounds, options.bounds);
  if (!bounds) return failed(modelId, "invalid-options", "Every parameter bound must be finite, positive, and ordered.");

  const duplicateRates = new Set<number>();
  const seenRates = new Set<number>();
  for (const { rate } of data) {
    if (seenRates.has(rate)) duplicateRates.add(rate);
    seenRates.add(rate);
  }
  const inputWarnings: RateFitWarning[] = [...duplicateRates].map((rate) => ({ code: "duplicate-rate", rate }));
  const deadline = Date.now() + timeoutMs;

  // Kept inside the fit path so opening a Rate page does not load the optimizer chunk.
  // The package's ESM exports resolve in Vite and Node, but this repository's
  // legacy `moduleResolution: "Node"` cannot follow its exports-only typings.
  // Keep the suppression local and validate the exact used 5.1.0 surface above.
  // @ts-expect-error -- package export-map types require node16/bundler resolution.
  const optimizerModule: { levenbergMarquardt: OptimizerFunction } = await import("ml-levenberg-marquardt");
  const { levenbergMarquardt } = optimizerModule;
  const candidates: OptimizedStart[] = [];
  let exhaustedIterations = 0;
  let lastFailure: RateFitFailureCode = "maximum-iterations";

  for (const start of deterministicStarts(data, bounds)) {
    const optimized = await optimizeStart(
      levenbergMarquardt,
      data,
      model.fit,
      start,
      bounds,
      maxIterations,
      deadline,
      options.signal,
    );
    if (typeof optimized === "string") {
      lastFailure = optimized;
      if (optimized === "timeout" || optimized === "cancelled") {
        return failed(modelId, optimized, `The fit was ${optimized}.`, exhaustedIterations, inputWarnings);
      }
      continue;
    }
    exhaustedIterations += optimized.iterations;
    if (optimized.converged) candidates.push(optimized);
  }

  if (candidates.length === 0) {
    const code = lastFailure === "maximum-iterations" ? "maximum-iterations" : lastFailure;
    return failed(modelId, code, "No deterministic start produced a finite converged solution.", exhaustedIterations, inputWarnings);
  }

  const best = candidates.reduce((current, candidate) => candidate.sse < current.sse ? candidate : current);
  const predictions = predictionsFor(data, best.parameters, model.fit);
  if (!predictions) {
    return failed(modelId, "non-finite-prediction", "The fitted model produced a non-finite prediction.", best.iterations, inputWarnings);
  }
  const observed = data.map(({ capacity }) => capacity);
  const residuals = observed.map((value, index) => value - predictions[index]);
  if (!residuals.every(Number.isFinite)) {
    return failed(modelId, "non-finite-result", "The fitted residuals are not finite.", best.iterations, inputWarnings);
  }

  const statistics = calculateFitStatistics(observed, predictions, parameterIds.length);
  if (statistics.sse === null) {
    return failed(modelId, "non-finite-result", "The fitted sum of squared errors is not finite.", best.iterations, inputWarnings);
  }
  const uncertainty = estimateConfidenceIntervals(data, best.parameters, model.fit, bounds, statistics.sse);

  return {
    status: "converged",
    modelId,
    parameters: best.parameters,
    predictions,
    residuals,
    statistics,
    uncertainty,
    iterations: best.iterations,
    usedPointCount: data.length,
    warnings: [...inputWarnings, ...uncertainty.warnings],
  };
}
