import type { RateNormalizationContext, RatePoint, NormalizedRatePoint } from "../models/types";
import { getRateModel } from "../models/registry";
import { normalizeRatePoints } from "../utils/rateUnits";
import {
  fitRatePerformance,
  MAX_SYNC_RATE_FIT_POINTS,
  type RateFitConverged,
  type RateFitOptions,
  type RateFitPoint,
  type RateFitResult,
} from "./fitRatePerformance";
import type { ThicknessUnit } from "./thicknessScaling";

export interface ThicknessSeriesSource {
  readonly id: string;
  readonly sampleName: string;
  readonly thickness: number | null;
  readonly thicknessUnit: ThicknessUnit;
  readonly massLoading: number | null;
  readonly modelId: string;
  readonly points: ReadonlyArray<Readonly<RatePoint>>;
  readonly normalizationContext: Readonly<RateNormalizationContext>;
}

interface ThicknessSeriesOutcomeBase {
  readonly sampleId: string;
  readonly sampleName: string;
  readonly modelId: string;
  readonly modelEquation: string;
  readonly referenceIds: ReadonlyArray<string>;
  readonly normalizedPoints: ReadonlyArray<Readonly<NormalizedRatePoint>>;
}

export interface ThicknessSeriesConverged extends ThicknessSeriesOutcomeBase {
  readonly status: "converged";
  readonly fit: Readonly<RateFitConverged>;
}

export interface ThicknessSeriesFailed extends ThicknessSeriesOutcomeBase {
  readonly status: "failed";
  readonly failureCode: string;
  readonly failureMessage: string;
}

export type ThicknessSeriesOutcome = ThicknessSeriesConverged | ThicknessSeriesFailed;

type ThicknessRateFitter = (
  data: ReadonlyArray<RateFitPoint>,
  options: RateFitOptions,
) => Promise<RateFitResult>;

export interface FitThicknessSeriesOptions {
  readonly fit?: ThicknessRateFitter;
  readonly signal?: AbortSignal;
  readonly onProgress?: (current: number, total: number, sample: Readonly<ThicknessSeriesSource>) => void;
}

function metadata(source: Readonly<ThicknessSeriesSource>) {
  const model = getRateModel(source.modelId);
  return {
    sampleId: source.id,
    sampleName: source.sampleName,
    modelId: source.modelId,
    modelEquation: model?.equation ?? "",
    referenceIds: model?.referenceIds ?? [],
  };
}

function failed(
  source: Readonly<ThicknessSeriesSource>,
  failureCode: string,
  failureMessage: string,
  normalizedPoints: ReadonlyArray<Readonly<NormalizedRatePoint>> = [],
): ThicknessSeriesFailed {
  return { status: "failed", ...metadata(source), normalizedPoints, failureCode, failureMessage };
}

export async function fitThicknessSeries(
  sources: ReadonlyArray<Readonly<ThicknessSeriesSource>>,
  options: Readonly<FitThicknessSeriesOptions> = {},
): Promise<ThicknessSeriesOutcome[]> {
  const fit = options.fit ?? fitRatePerformance;
  const outcomes: ThicknessSeriesOutcome[] = [];
  for (const [index, source] of sources.entries()) {
    if (options.signal?.aborted) break;
    options.onProgress?.(index + 1, sources.length, source);
    if (source.thickness === null || !Number.isFinite(source.thickness) || source.thickness <= 0) {
      outcomes.push(failed(source, "invalid-thickness", "Thickness must be positive and finite."));
      continue;
    }
    const populated = source.points.filter(({ rate, capacity }) => rate !== null || capacity !== null);
    if (populated.length <= 3) {
      outcomes.push(failed(source, "no-complete-data", "No complete rate-capacity data."));
      continue;
    }
    let normalized: NormalizedRatePoint[];
    try {
      normalized = normalizeRatePoints(populated, source.normalizationContext);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "normalization-failed";
      outcomes.push(failed(source, code, "Rate-capacity input could not be normalized."));
      continue;
    }
    if (normalized.length > MAX_SYNC_RATE_FIT_POINTS) {
      outcomes.push(failed(source, "too-many-points", `This sample exceeds ${MAX_SYNC_RATE_FIT_POINTS} points.`, normalized));
      continue;
    }
    try {
      const result = await fit(
        normalized.map(({ analysisRate: rate, analysisCapacity: capacity }) => ({ rate, capacity })),
        { modelId: source.modelId, signal: options.signal },
      );
      if (result.status === "failed") {
        outcomes.push(failed(source, result.failure.code, result.failure.message, normalized));
      } else {
        outcomes.push({ status: "converged", ...metadata(source), normalizedPoints: normalized, fit: result });
      }
    } catch {
      outcomes.push(failed(source, "unexpected-fit", "The sample fit failed unexpectedly.", normalized));
    }
  }
  return outcomes;
}
