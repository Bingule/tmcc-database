import { attemptBValueFits, validateInterpolatedCvData } from "./cvAnalysis";
import { CvCycleStructureError, normalizeAlignedCvCycles } from "./cvCycle";
import { makeDunnFractionGrid } from "./cvDunnConfidence";
import { fitDunnBranches } from "./cvDunnFit";
import { reconstructDunnContribution } from "./cvDunnQuality";
import { optimizeSharedFraction } from "./cvDunnReconstruction";
import { alignCvBranches, toSequentialGrid } from "./cvInterpolation";
import {
  CvAnalysisError,
  type BValuePoint,
  type CvAnalysisSettings,
  type CvFitRecord,
  type CvFitStatus,
  type CvQualitySummary,
  type CvSeries,
  type CvWorkflowResult,
  type DunnFitGrid
} from "./cvTypes";

export function analyzeCvWorkflow(series: CvSeries[], settings: CvAnalysisSettings): CvWorkflowResult {
  validateSeriesInputs(series);
  validateRSquaredThreshold(settings.rSquaredThreshold);

  try {
    const cycles = normalizeAlignedCvCycles(series);
    const alignedGrid = alignCvBranches(series, cycles, settings.potentialInterval);
    const analysisGrid = toSequentialGrid(alignedGrid);
    validateInterpolatedCvData(analysisGrid);
    const bRecords = classifyRecords(attemptBValueFits(analysisGrid), settings.rSquaredThreshold);
    const dunnRecords = fitDunnBranches(alignedGrid, settings.turningPointTrim);
    const contributions = bRecords.some((record) => record.fit)
      ? alignedGrid.scanRates.map((scanRate, seriesIndex) => {
        const fractions = makeDunnFractionGrid(
          dunnRecords,
          scanRate,
          settings.dunnConfidenceMode,
          settings.rSquaredThreshold
        );
        const optimized = optimizeSharedFraction(fractions, alignedGrid.potentials);
        return reconstructDunnContribution({
          alignedGrid,
          dunnRecords,
          optimized,
          fractions,
          scanRate,
          seriesIndex,
          mode: settings.dunnConfidenceMode,
          threshold: settings.rSquaredThreshold,
          resolvedTurningPointTrim: dunnRecords.resolvedTurningPointTrim
        });
      })
      : [];

    return {
      series: cloneSeries(series),
      alignedGrid,
      analysisGrid,
      bRecords,
      dunnRecords,
      contributions,
      summary: makeSummary(alignedGrid.potentials.length, analysisGrid, bRecords, dunnRecords),
      settings: cloneSettings(settings)
    };
  } catch (error) {
    throw mapWorkflowError(error);
  }
}

function classifyRecords<T extends { rSquared: number }>(
  records: Array<CvFitRecord<T>>,
  threshold: number
): Array<CvFitRecord<T>> {
  return records.map((record) => {
    if (!record.fit) return record;
    return {
      ...record,
      status: threshold === 0 || record.fit.rSquared >= threshold
        ? "valid"
        : "belowRSquaredThreshold"
    };
  });
}

function makeSummary(
  commonPointCount: number,
  analysisGrid: { potentials: number[] },
  bRecords: Array<CvFitRecord<BValuePoint>>,
  dunnRecords: DunnFitGrid
): CvQualitySummary {
  const dunnBranchRecords = [...dunnRecords.forward, ...dunnRecords.reverse];
  return {
    commonPointCount,
    retainedPointCount: analysisGrid.potentials.length,
    validBCount: countStatus(bRecords, "valid"),
    excludedBCount: countStatus(bRecords, "belowRSquaredThreshold"),
    unavailableBCount: countUnavailable(bRecords),
    validDunnCount: dunnBranchRecords.filter((record) => record.status === "valid").length,
    excludedDunnCount: dunnBranchRecords.filter((record) => record.status === "belowRSquaredThreshold").length,
    unavailableDunnCount: dunnBranchRecords.filter((record) =>
      record.status !== "valid" && record.status !== "belowRSquaredThreshold").length
  };
}

function countStatus<T>(records: Array<CvFitRecord<T>>, status: CvFitStatus) {
  return records.filter((record) => record.status === status).length;
}

function countUnavailable<T>(records: Array<CvFitRecord<T>>) {
  return records.filter((record) =>
    record.status !== "valid" && record.status !== "belowRSquaredThreshold").length;
}

function validateSeriesInputs(series: CvSeries[]) {
  if (series.length === 0) throw new CvAnalysisError("noSeries");
  for (const item of series) {
    if (!Number.isFinite(item.scanRate) || item.scanRate <= 0) throw new CvAnalysisError("invalidScanRate");
    if (item.points.length === 0) throw new CvAnalysisError("noPoints");
    for (const point of item.points) {
      if (!Number.isFinite(point.potential)) throw new CvAnalysisError("invalidPotential");
      if (!Number.isFinite(point.current)) throw new CvAnalysisError("invalidCurrent");
    }
  }
}

function validateRSquaredThreshold(threshold: number) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new CvAnalysisError("invalidRSquaredThreshold");
  }
}

function cloneSeries(series: CvSeries[]): CvSeries[] {
  return series.map((item) => ({
    ...item,
    points: item.points.map((point) => ({ ...point }))
  }));
}

function cloneSettings(settings: CvAnalysisSettings): CvAnalysisSettings {
  return {
    potentialInterval: { ...settings.potentialInterval },
    rSquaredThreshold: settings.rSquaredThreshold,
    dunnConfidenceMode: settings.dunnConfidenceMode,
    turningPointTrim: { ...settings.turningPointTrim }
  };
}

function mapWorkflowError(error: unknown): Error {
  if (error instanceof CvCycleStructureError) {
    return new CvAnalysisError("invalidCycleStructure");
  }
  if (error instanceof CvAnalysisError) {
    if (error.code === "invalidPointInterval") return new CvAnalysisError("invalidPotentialInterval");
    return error;
  }
  return error instanceof Error ? error : new Error(String(error));
}
