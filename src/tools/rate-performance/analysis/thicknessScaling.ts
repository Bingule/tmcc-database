import { studentTCritical95 } from "./confidenceIntervals";
import { calculateFitStatistics, type FitStatistics } from "./fitStatistics";

export type ThicknessUnit = "um" | "mm" | "m";
export type ThicknessScalingModelId = "linear" | "quadratic" | "power";
export type ThicknessWeighting = "unweighted" | "tau-standard-error";

export interface ThicknessScalingSample {
  readonly id: string;
  readonly sampleName: string;
  readonly thickness: number;
  readonly thicknessUnit: ThicknessUnit;
  readonly tau: number;
  readonly tauStandardError?: number | null;
  readonly massLoading?: number | null;
}

export interface NormalizedThicknessScalingSample extends ThicknessScalingSample {
  readonly originalThickness: number;
  readonly originalThicknessUnit: ThicknessUnit;
  readonly thicknessMetres: number;
  readonly thicknessMicrometres: number;
  readonly tauSeconds: number;
  readonly tauStandardErrorSeconds: number | null;
}

export interface ThicknessScalingResidual {
  readonly sampleId: string;
  readonly thicknessMetres: number;
  readonly observedTauSeconds: number;
  readonly predictedTauSeconds: number;
  readonly residualSeconds: number;
}

interface BaseThicknessScalingFit {
  readonly modelId: ThicknessScalingModelId;
  readonly equation: string;
  readonly predictions: ReadonlyArray<number>;
  readonly residuals: ReadonlyArray<Readonly<ThicknessScalingResidual>>;
  readonly statistics: Readonly<FitStatistics>;
  readonly criterionValue: number;
}

export interface LinearThicknessScalingFit extends BaseThicknessScalingFit {
  readonly modelId: "linear";
  readonly parameters: Readonly<{ interceptSeconds: number; slopeSecondsPerMetre: number }>;
}

export interface QuadraticThicknessScalingFit extends BaseThicknessScalingFit {
  readonly modelId: "quadratic";
  readonly parameters: Readonly<{ interceptSeconds: number; coefficientSecondsPerMetreSquared: number }>;
}

export interface PowerThicknessScalingFit extends BaseThicknessScalingFit {
  readonly modelId: "power";
  readonly parameters: Readonly<{
    amplitude: number;
    alpha: number;
    alphaStandardError: number | null;
    alphaConfidenceInterval95: Readonly<{ lower: number; upper: number }> | null;
  }>;
}

export type ThicknessScalingFit = LinearThicknessScalingFit | QuadraticThicknessScalingFit | PowerThicknessScalingFit;

export type ThicknessScalingFailureCode =
  | "invalid-thickness"
  | "duplicate-thickness"
  | "invalid-tau"
  | "invalid-tau-uncertainty"
  | "insufficient-distinct-thicknesses"
  | "regression-failed";

export interface ThicknessScalingFailure {
  readonly status: "failed";
  readonly failure: Readonly<{
    code: ThicknessScalingFailureCode;
    sampleIds: ReadonlyArray<string>;
    message: string;
  }>;
}

export interface ThicknessScalingConverged {
  readonly status: "converged";
  readonly samples: ReadonlyArray<Readonly<NormalizedThicknessScalingSample>>;
  readonly fits: Readonly<{
    linear: LinearThicknessScalingFit;
    quadratic: QuadraticThicknessScalingFit;
    power: PowerThicknessScalingFit;
  }>;
  readonly weighting: ThicknessWeighting;
  readonly criterion: Readonly<{
    name: "AICc" | "AIC" | "RMSE";
    comparisonScale: "tau-seconds";
    lowerIsBetter: true;
    logic: string;
  }>;
  readonly bestModelId: ThicknessScalingModelId;
}

export type ThicknessScalingResult = ThicknessScalingConverged | ThicknessScalingFailure;

const unitToMetres: Readonly<Record<ThicknessUnit, number>> = {
  um: 1e-6,
  mm: 1e-3,
  m: 1,
};

export function normalizeThickness(value: number, unit: ThicknessUnit): number {
  return value * unitToMetres[unit];
}

function failed(code: ThicknessScalingFailureCode, sampleIds: ReadonlyArray<string>, message: string): ThicknessScalingFailure {
  return { status: "failed", failure: { code, sampleIds: [...sampleIds], message } };
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(Math.abs(left), Math.abs(right), 1e-300) * 1e-12;
}

interface RegressionResult {
  readonly intercept: number;
  readonly slope: number;
  readonly slopeStandardError: number | null;
}

function regress(
  x: ReadonlyArray<number>,
  y: ReadonlyArray<number>,
  weights: ReadonlyArray<number>,
): RegressionResult | null {
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let index = 0; index < x.length; index += 1) {
    const weight = weights[index];
    totalWeight += weight;
    weightedX += weight * x[index];
    weightedY += weight * y[index];
  }
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;
  const meanX = weightedX / totalWeight;
  const meanY = weightedY / totalWeight;
  let cross = 0;
  let squareX = 0;
  for (let index = 0; index < x.length; index += 1) {
    const centeredX = x[index] - meanX;
    cross += weights[index] * centeredX * (y[index] - meanY);
    squareX += weights[index] * centeredX * centeredX;
  }
  if (!Number.isFinite(squareX) || squareX <= 0) return null;
  const slope = cross / squareX;
  const intercept = meanY - slope * meanX;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;

  const degreesOfFreedom = x.length - 2;
  let slopeStandardError: number | null = null;
  if (degreesOfFreedom > 0) {
    const weightedSse = x.reduce((sum, value, index) => {
      const residual = y[index] - (intercept + slope * value);
      return sum + weights[index] * residual * residual;
    }, 0);
    const variance = weightedSse / degreesOfFreedom / squareX;
    if (Number.isFinite(variance) && variance >= 0) slopeStandardError = Math.sqrt(variance);
  }
  return { intercept, slope, slopeStandardError };
}

function residualsFor(
  samples: ReadonlyArray<Readonly<NormalizedThicknessScalingSample>>,
  predictions: ReadonlyArray<number>,
): ThicknessScalingResidual[] {
  return samples.map((sample, index) => ({
    sampleId: sample.id,
    thicknessMetres: sample.thicknessMetres,
    observedTauSeconds: sample.tauSeconds,
    predictedTauSeconds: predictions[index],
    residualSeconds: sample.tauSeconds - predictions[index],
  }));
}

function fitLinearFeature(
  modelId: "linear" | "quadratic",
  samples: ReadonlyArray<Readonly<NormalizedThicknessScalingSample>>,
  feature: ReadonlyArray<number>,
  weights: ReadonlyArray<number>,
): LinearThicknessScalingFit | QuadraticThicknessScalingFit | null {
  const observed = samples.map(({ tauSeconds }) => tauSeconds);
  const regression = regress(feature, observed, weights);
  if (!regression) return null;
  const predictions = feature.map((value) => regression.intercept + regression.slope * value);
  if (!predictions.every(Number.isFinite)) return null;
  const statistics = calculateFitStatistics(observed, predictions, 2);
  const base = {
    equation: modelId === "linear" ? "tau = b0 + b1 L" : "tau = b0 + b2 L^2",
    predictions,
    residuals: residualsFor(samples, predictions),
    statistics,
    criterionValue: Number.NaN,
  };
  return modelId === "linear"
    ? { ...base, modelId, parameters: { interceptSeconds: regression.intercept, slopeSecondsPerMetre: regression.slope } }
    : { ...base, modelId, parameters: { interceptSeconds: regression.intercept, coefficientSecondsPerMetreSquared: regression.slope } };
}

function fitPower(
  samples: ReadonlyArray<Readonly<NormalizedThicknessScalingSample>>,
  weighting: ThicknessWeighting,
): PowerThicknessScalingFit | null {
  const logThickness = samples.map(({ thicknessMetres }) => Math.log(thicknessMetres));
  const logTau = samples.map(({ tauSeconds }) => Math.log(tauSeconds));
  const weights = weighting === "tau-standard-error"
    ? samples.map(({ tauSeconds, tauStandardErrorSeconds }) => (tauSeconds / (tauStandardErrorSeconds as number)) ** 2)
    : samples.map(() => 1);
  const regression = regress(logThickness, logTau, weights);
  if (!regression) return null;
  const amplitude = Math.exp(regression.intercept);
  const predictions = samples.map(({ thicknessMetres }) => amplitude * thicknessMetres ** regression.slope);
  if (!Number.isFinite(amplitude) || !predictions.every(Number.isFinite)) return null;
  const observed = samples.map(({ tauSeconds }) => tauSeconds);
  const statistics = calculateFitStatistics(observed, predictions, 2);
  const alphaConfidenceInterval95 = regression.slopeStandardError === null
    ? null
    : (() => {
      const margin = studentTCritical95(samples.length - 2) * regression.slopeStandardError;
      return { lower: regression.slope - margin, upper: regression.slope + margin };
    })();
  return {
    modelId: "power",
    equation: "tau = a L^alpha",
    parameters: {
      amplitude,
      alpha: regression.slope,
      alphaStandardError: regression.slopeStandardError,
      alphaConfidenceInterval95,
    },
    predictions,
    residuals: residualsFor(samples, predictions),
    statistics,
    criterionValue: Number.NaN,
  };
}

function criterionFor(fits: ReadonlyArray<ThicknessScalingFit>): ThicknessScalingConverged["criterion"] {
  if (fits.every(({ statistics }) => statistics.aicc !== null)) {
    return {
      name: "AICc",
      comparisonScale: "tau-seconds",
      lowerIsBetter: true,
      logic: "Lowest finite AICc from unweighted original-tau residuals; all models have two parameters.",
    };
  }
  if (fits.every(({ statistics }) => statistics.aic !== null)) {
    return {
      name: "AIC",
      comparisonScale: "tau-seconds",
      lowerIsBetter: true,
      logic: "AICc is unavailable for at least one model; compare finite AIC from unweighted original-tau residuals.",
    };
  }
  return {
    name: "RMSE",
    comparisonScale: "tau-seconds",
    lowerIsBetter: true,
    logic: "Information criteria are unavailable for an exact or degenerate residual; compare original-tau RMSE.",
  };
}

function criterionValue(fit: ThicknessScalingFit, criterion: ThicknessScalingConverged["criterion"]): number {
  const value = criterion.name === "AICc"
    ? fit.statistics.aicc
    : criterion.name === "AIC"
      ? fit.statistics.aic
      : fit.statistics.rmse;
  return value ?? Number.POSITIVE_INFINITY;
}

export function fitThicknessScaling(samples: ReadonlyArray<Readonly<ThicknessScalingSample>>): ThicknessScalingResult {
  const invalidThickness = samples.filter(({ thickness, thicknessUnit }) => (
    !Number.isFinite(thickness) || thickness <= 0 || !Number.isFinite(normalizeThickness(thickness, thicknessUnit))
  )).map(({ id }) => id);
  if (invalidThickness.length > 0) {
    return failed("invalid-thickness", invalidThickness, "Thickness must be positive and finite.");
  }
  const invalidTau = samples.filter(({ tau }) => !Number.isFinite(tau) || tau <= 0).map(({ id }) => id);
  if (invalidTau.length > 0) return failed("invalid-tau", invalidTau, "Tau must be positive and finite.");
  const invalidUncertainty = samples.filter(({ tauStandardError }) => (
    tauStandardError !== undefined && tauStandardError !== null
    && (!Number.isFinite(tauStandardError) || tauStandardError <= 0)
  )).map(({ id }) => id);
  if (invalidUncertainty.length > 0) {
    return failed("invalid-tau-uncertainty", invalidUncertainty, "Tau standard errors must be positive and finite when supplied.");
  }

  const normalized: NormalizedThicknessScalingSample[] = samples.map((sample) => {
    const thicknessMetres = normalizeThickness(sample.thickness, sample.thicknessUnit);
    return {
      ...sample,
      originalThickness: sample.thickness,
      originalThicknessUnit: sample.thicknessUnit,
      thicknessMetres,
      thicknessMicrometres: thicknessMetres * 1e6,
      tauSeconds: sample.tau * 3600,
      tauStandardErrorSeconds: sample.tauStandardError == null ? null : sample.tauStandardError * 3600,
    };
  });

  const duplicateIds = new Set<string>();
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      if (nearlyEqual(normalized[left].thicknessMetres, normalized[right].thicknessMetres)) {
        duplicateIds.add(normalized[left].id);
        duplicateIds.add(normalized[right].id);
      }
    }
  }
  if (duplicateIds.size > 0) {
    return failed("duplicate-thickness", [...duplicateIds], "Duplicate physical thicknesses are not averaged or silently merged.");
  }
  if (normalized.length < 3) {
    return failed(
      "insufficient-distinct-thicknesses",
      normalized.map(({ id }) => id),
      "At least three valid distinct thicknesses are required.",
    );
  }

  const weighting: ThicknessWeighting = normalized.every(({ tauStandardErrorSeconds }) => (
    tauStandardErrorSeconds !== null && tauStandardErrorSeconds > 0
  )) ? "tau-standard-error" : "unweighted";
  const weights = weighting === "tau-standard-error"
    ? normalized.map(({ tauStandardErrorSeconds }) => 1 / (tauStandardErrorSeconds as number) ** 2)
    : normalized.map(() => 1);
  const linear = fitLinearFeature("linear", normalized, normalized.map(({ thicknessMetres }) => thicknessMetres), weights);
  const quadratic = fitLinearFeature("quadratic", normalized, normalized.map(({ thicknessMetres }) => thicknessMetres ** 2), weights);
  const power = fitPower(normalized, weighting);
  if (!linear || !quadratic || !power) {
    return failed("regression-failed", normalized.map(({ id }) => id), "The scaling regression produced a singular or non-finite result.");
  }

  const rawFits: ThicknessScalingFit[] = [linear, quadratic, power];
  const criterion = criterionFor(rawFits);
  const withCriterion = rawFits.map((fit) => ({ ...fit, criterionValue: criterionValue(fit, criterion) })) as [
    LinearThicknessScalingFit,
    QuadraticThicknessScalingFit,
    PowerThicknessScalingFit,
  ];
  const [linearFit, quadraticFit, powerFit] = withCriterion;
  const bestModelId = withCriterion.reduce((best, fit) => (
    fit.criterionValue < best.criterionValue ? fit : best
  )).modelId;
  return {
    status: "converged",
    samples: normalized,
    fits: { linear: linearFit, quadratic: quadraticFit, power: powerFit },
    weighting,
    criterion,
    bestModelId,
  };
}
