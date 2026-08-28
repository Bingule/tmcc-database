import { getRateModel } from "../models/registry";
import type {
  CharacteristicTimeRateParameters,
  RateModelDefinition,
  RateModelFitFunction,
} from "../models/types";
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
  /** Actual optimizer iterations consumed globally across every attempted start. */
  readonly iterations: number;
  /** Successful optimizer batches report their completed iteration counts exactly. */
  readonly iterationCountExact: true;
  readonly usedPointCount: number;
  readonly warnings: ReadonlyArray<RateFitWarning>;
}

export interface RateFitFailure {
  readonly status: "failed";
  readonly modelId: string;
  readonly failure: Readonly<{ code: RateFitFailureCode; message: string }>;
  /** Known completed iterations; a lower bound when iterationCountExact is false. */
  readonly iterations: number;
  /** False when the optimizer throws inside a synchronous batch before reporting its iterations. */
  readonly iterationCountExact: boolean;
  readonly warnings: ReadonlyArray<RateFitWarning>;
}

export type RateFitResult = RateFitConverged | RateFitFailure;

interface OptimizedStart {
  readonly parameters: CharacteristicTimeRateParameters;
  readonly sse: number;
  readonly iterations: number;
}

type OptimizedStartOutcome =
  | Readonly<{ status: "converged"; result: OptimizedStart }>
  | Readonly<{ status: "exhausted"; iterations: number }>
  | Readonly<{
    status: "failed";
    code: RateFitFailureCode;
    iterations: number;
    iterationCountExact: boolean;
  }>;

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

export type RateOptimizer = (
  data: Readonly<{ x: ReadonlyArray<number>; y: ReadonlyArray<number> }>,
  parameterizedFunction: (parameters: number[]) => (rate: number) => number,
  options: OptimizerOptions,
) => OptimizerResult;

export interface RateFitDependencies {
  readonly loadOptimizer: () => Promise<Readonly<{ levenbergMarquardt: RateOptimizer }>>;
  readonly resolveModel: (id: string) => Readonly<RateModelDefinition> | undefined;
  readonly yieldToMacrotask: () => Promise<void>;
  readonly now: () => number;
}

const parameterIds = ["qM", "tau", "n"] as const;
const defaultMaxIterations = 240;
const defaultTimeoutMs = 2_000;

function failed(
  modelId: string,
  code: RateFitFailureCode,
  message: string,
  iterations = 0,
  warnings: ReadonlyArray<RateFitWarning> = [],
  iterationCountExact = true,
): RateFitFailure {
  return {
    status: "failed",
    modelId,
    failure: { code, message },
    iterations,
    iterationCountExact,
    warnings,
  };
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
  optimizer: RateOptimizer,
  data: ReadonlyArray<RateFitPoint>,
  evaluate: RateModelFitFunction,
  start: CharacteristicTimeRateParameters,
  bounds: CharacteristicTimeParameterBounds,
  maxIterations: number,
  deadline: number,
  signal: AbortSignal | undefined,
  yieldToMacrotask: () => Promise<void>,
  now: () => number,
): Promise<OptimizedStartOutcome> {
  const observed = data.map(({ capacity }) => capacity);
  const x = data.map(({ rate }) => rate);
  const energyScale = observed.reduce((sum, value) => sum + value * value, 0);
  const absoluteTolerance = Math.max(1e-24, energyScale * 1e-20);
  const encodedMinimum = parameterIds.map((parameter) => Math.log(bounds[parameter].minimum));
  const encodedMaximum = parameterIds.map((parameter) => Math.log(bounds[parameter].maximum));
  let encoded = encodeParameters(start);
  const initialPredictions = predictionsFor(data, start, evaluate);
  if (!initialPredictions) {
    return {
      status: "failed",
      code: "non-finite-prediction",
      iterations: 0,
      iterationCountExact: true,
    };
  }
  let previousSse = sumSquaredError(observed, initialPredictions);
  let totalIterations = 0;
  let confirmations = 0;

  while (totalIterations < maxIterations) {
    if (signal?.aborted) {
      return {
        status: "failed",
        code: "cancelled",
        iterations: totalIterations,
        iterationCountExact: true,
      };
    }
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      return {
        status: "failed",
        code: "timeout",
        iterations: totalIterations,
        iterationCountExact: true,
      };
    }
    const batchIterations = Math.min(8, maxIterations - totalIterations);
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
      return {
        status: "failed",
        code: message.includes("execution time") ? "timeout" : "optimizer-error",
        iterations: totalIterations,
        iterationCountExact: false,
      };
    }
    if (
      !Number.isInteger(optimized.iterations)
      || optimized.iterations < 0
      || optimized.iterations > batchIterations
    ) {
      return {
        status: "failed",
        code: "optimizer-error",
        iterations: totalIterations,
        iterationCountExact: false,
      };
    }
    totalIterations += optimized.iterations;
    if (!optimized.parameterValues.every(Number.isFinite) || !Number.isFinite(optimized.parameterError)) {
      return {
        status: "failed",
        code: "non-finite-result",
        iterations: totalIterations,
        iterationCountExact: true,
      };
    }

    const parameters = decodeParameters(optimized.parameterValues);
    if (!parameterIds.every((parameter) => Number.isFinite(parameters[parameter]))) {
      return {
        status: "failed",
        code: "non-finite-result",
        iterations: totalIterations,
        iterationCountExact: true,
      };
    }
    const predictions = predictionsFor(data, parameters, evaluate);
    if (!predictions) {
      return {
        status: "failed",
        code: "non-finite-prediction",
        iterations: totalIterations,
        iterationCountExact: true,
      };
    }
    const currentSse = sumSquaredError(observed, predictions);
    if (!Number.isFinite(currentSse)) {
      return {
        status: "failed",
        code: "non-finite-result",
        iterations: totalIterations,
        iterationCountExact: true,
      };
    }

    const optimizerReportedConvergence = optimized.iterations < batchIterations;
    const stable = relativeSseImprovement(previousSse, currentSse) <= 1e-10
      && relativeParameterMovement(encoded, optimized.parameterValues) <= 1e-7;
    confirmations = stable ? confirmations + 1 : 0;
    encoded = [...optimized.parameterValues];
    previousSse = currentSse;

    const startBudgetExhausted = totalIterations >= maxIterations;
    if (!startBudgetExhausted && ((optimizerReportedConvergence && stable) || confirmations >= 2)) {
      return {
        status: "converged",
        result: { parameters, sse: currentSse, iterations: totalIterations },
      };
    }
    if (optimized.iterations === 0) {
      return {
        status: "failed",
        code: "optimizer-error",
        iterations: totalIterations,
        iterationCountExact: true,
      };
    }
    if (startBudgetExhausted) return { status: "exhausted", iterations: totalIterations };
    if (totalIterations < maxIterations) await yieldToMacrotask();
  }

  return { status: "exhausted", iterations: totalIterations };
}

/**
 * Fit a validated characteristic-time model to every supplied point.
 *
 * AbortSignal cancellation is checked between deterministic starts and bounded
 * optimizer batches. The optimizer itself is synchronous, so its timeout option
 * is also passed through to provide an in-loop execution gate.
 */
async function fitRatePerformanceWithDependencies(
  data: ReadonlyArray<RateFitPoint>,
  options: RateFitOptions,
  dependencies: RateFitDependencies,
): Promise<RateFitResult> {
  const { modelId } = options;
  const model = dependencies.resolveModel(modelId);
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
  const deadline = dependencies.now() + timeoutMs;

  let optimizerModule: Readonly<{ levenbergMarquardt: RateOptimizer }>;
  try {
    optimizerModule = await dependencies.loadOptimizer();
  } catch {
    return failed(modelId, "optimizer-error", "The optimizer module could not be loaded.", 0, inputWarnings);
  }
  const { levenbergMarquardt } = optimizerModule;
  if (typeof levenbergMarquardt !== "function") {
    return failed(modelId, "optimizer-error", "The optimizer module has an invalid API.", 0, inputWarnings);
  }
  const candidates: OptimizedStart[] = [];
  let totalIterations = 0;
  let lastFailure: RateFitFailureCode = "maximum-iterations";
  const starts = deterministicStarts(data, bounds);

  for (const [startIndex, start] of starts.entries()) {
    const remainingBudget = maxIterations - totalIterations;
    if (remainingBudget <= 0) break;
    const remainingStarts = starts.length - startIndex;
    const startBudget = Math.ceil(remainingBudget / remainingStarts);
    const optimized = await optimizeStart(
      levenbergMarquardt,
      data,
      model.fit,
      start,
      bounds,
      startBudget,
      deadline,
      options.signal,
      dependencies.yieldToMacrotask,
      dependencies.now,
    );
    totalIterations += optimized.status === "converged"
      ? optimized.result.iterations
      : optimized.iterations;
    if (optimized.status === "failed") {
      lastFailure = optimized.code;
      if (
        optimized.code === "timeout"
        || optimized.code === "cancelled"
        || !optimized.iterationCountExact
      ) {
        const message = optimized.code === "cancelled"
          ? "The fit was cancelled."
          : optimized.code === "timeout"
            ? "The fit timed out inside an optimizer batch."
            : "The optimizer failed inside a batch before reporting its iteration count.";
        return failed(
          modelId,
          optimized.code,
          message,
          totalIterations,
          inputWarnings,
          optimized.iterationCountExact,
        );
      }
    } else if (optimized.status === "converged") {
      candidates.push(optimized.result);
    }

    if (startIndex < starts.length - 1 && totalIterations < maxIterations) {
      await dependencies.yieldToMacrotask();
      if (options.signal?.aborted) {
        return failed(modelId, "cancelled", "The fit was cancelled.", totalIterations, inputWarnings);
      }
      if (dependencies.now() >= deadline) {
        return failed(modelId, "timeout", "The fit timed out.", totalIterations, inputWarnings);
      }
    }
  }

  if (totalIterations >= maxIterations) {
    return failed(
      modelId,
      "maximum-iterations",
      "The global optimizer iteration budget was exhausted before a fit could be accepted.",
      totalIterations,
      inputWarnings,
    );
  }

  if (candidates.length === 0) {
    const code = lastFailure === "maximum-iterations" ? "maximum-iterations" : lastFailure;
    return failed(modelId, code, "No deterministic start produced a finite converged solution.", totalIterations, inputWarnings);
  }

  const best = candidates.reduce((current, candidate) => candidate.sse < current.sse ? candidate : current);
  const predictions = predictionsFor(data, best.parameters, model.fit);
  if (!predictions) {
    return failed(modelId, "non-finite-prediction", "The fitted model produced a non-finite prediction.", totalIterations, inputWarnings);
  }
  const observed = data.map(({ capacity }) => capacity);
  const residuals = observed.map((value, index) => value - predictions[index]);
  if (!residuals.every(Number.isFinite)) {
    return failed(modelId, "non-finite-result", "The fitted residuals are not finite.", totalIterations, inputWarnings);
  }

  const statistics = calculateFitStatistics(observed, predictions, parameterIds.length);
  if (statistics.sse === null) {
    return failed(modelId, "non-finite-result", "The fitted sum of squared errors is not finite.", totalIterations, inputWarnings);
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
    // This is the actual global optimizer work across every attempted start.
    iterations: totalIterations,
    iterationCountExact: true,
    usedPointCount: data.length,
    warnings: [...inputWarnings, ...uncertainty.warnings],
  };
}

const defaultDependencies: RateFitDependencies = {
  // Kept inside the fit path so opening a Rate page does not load the optimizer chunk.
  // The package's ESM exports resolve in Vite and Node, but this repository's
  // legacy `moduleResolution: "Node"` cannot follow its exports-only typings.
  // Keep the suppression local and validate the exact used 5.1.0 surface above.
  loadOptimizer: async () => {
    // @ts-expect-error -- package export-map types require node16/bundler resolution.
    const module: { levenbergMarquardt: RateOptimizer } = await import("ml-levenberg-marquardt");
    return module;
  },
  resolveModel: getRateModel,
  yieldToMacrotask: () => new Promise((resolve) => setTimeout(resolve, 0)),
  now: Date.now,
};

export function createRatePerformanceFitter(
  overrides: Partial<RateFitDependencies> = {},
): (data: ReadonlyArray<RateFitPoint>, options: RateFitOptions) => Promise<RateFitResult> {
  const dependencies: RateFitDependencies = { ...defaultDependencies, ...overrides };
  return (data, options) => fitRatePerformanceWithDependencies(data, options, dependencies);
}

export const fitRatePerformance = createRatePerformanceFitter();
