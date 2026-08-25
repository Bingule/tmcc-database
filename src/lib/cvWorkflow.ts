import {
  attemptBValueFits,
  attemptDunnFits,
  integrateDunnContributions,
  interpolateCommonGrid,
  resolveGridBranches,
  validateInterpolatedCvData
} from "./cvAnalysis";
import {
  CvAnalysisError,
  type BValuePoint,
  type CvAnalysisSettings,
  type CvFitRecord,
  type CvFitStatus,
  type CvQualitySummary,
  type CvSeries,
  type CvWorkflowResult,
  type DunnPoint,
  type InterpolatedCvData
} from "./cvTypes";

export function selectPointInterval(data: InterpolatedCvData, interval: number): InterpolatedCvData {
  validatePointInterval(interval);
  validateInterpolatedCvData(data);
  const sourceBranches = resolveGridBranches(data);
  const selectedIndices = new Set<number>();
  for (const branch of sourceBranches) {
    for (let index = branch.startIndex; index <= branch.endIndex; index += interval) {
      selectedIndices.add(index);
    }
    selectedIndices.add(branch.endIndex);
  }
  const indices = [...selectedIndices].sort((left, right) => left - right);
  const rebasedIndices = new Map(indices.map((sourceIndex, outputIndex) => [sourceIndex, outputIndex]));

  return {
    potentials: indices.map((index) => data.potentials[index]),
    scanRates: [...data.scanRates],
    currents: data.currents.map((row) => indices.map((index) => row[index])),
    branches: sourceBranches.map((branch) => ({
      branchIndex: branch.branchIndex,
      direction: branch.direction,
      startIndex: rebasedIndices.get(branch.startIndex)!,
      endIndex: rebasedIndices.get(branch.endIndex)!
    }))
  };
}

export function analyzeCvWorkflow(series: CvSeries[], settings: CvAnalysisSettings): CvWorkflowResult {
  validatePointInterval(settings.pointInterval);
  validateRSquaredThreshold(settings.rSquaredThreshold);
  const fullGrid = interpolateCommonGrid(series);
  const analysisGrid = selectPointInterval(fullGrid, settings.pointInterval);
  const bRecords = classifyRecords(attemptBValueFits(analysisGrid), settings.rSquaredThreshold);
  const dunnRecords = classifyRecords(attemptDunnFits(analysisGrid), settings.rSquaredThreshold);
  const coefficients = dunnRecords.map((record) => record.status === "valid" && record.fit
    ? { k1: record.fit.k1, k2: record.fit.k2 }
    : null);
  const contributions = integrateDunnContributions(analysisGrid, coefficients);

  return {
    series: cloneSeries(series),
    fullGrid,
    analysisGrid,
    bRecords,
    dunnRecords,
    contributions,
    summary: makeSummary(fullGrid, analysisGrid, bRecords, dunnRecords),
    settings: { ...settings }
  };
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
  fullGrid: InterpolatedCvData,
  analysisGrid: InterpolatedCvData,
  bRecords: Array<CvFitRecord<BValuePoint>>,
  dunnRecords: Array<CvFitRecord<DunnPoint>>
): CvQualitySummary {
  return {
    commonPointCount: fullGrid.potentials.length,
    retainedPointCount: analysisGrid.potentials.length,
    validBCount: countStatus(bRecords, "valid"),
    excludedBCount: countStatus(bRecords, "belowRSquaredThreshold"),
    unavailableBCount: countUnavailable(bRecords),
    validDunnCount: countStatus(dunnRecords, "valid"),
    excludedDunnCount: countStatus(dunnRecords, "belowRSquaredThreshold"),
    unavailableDunnCount: countUnavailable(dunnRecords)
  };
}

function countStatus<T>(records: Array<CvFitRecord<T>>, status: CvFitStatus) {
  return records.filter((record) => record.status === status).length;
}

function countUnavailable<T>(records: Array<CvFitRecord<T>>) {
  return records.filter((record) =>
    record.status !== "valid" && record.status !== "belowRSquaredThreshold").length;
}

function validatePointInterval(interval: number) {
  if (!Number.isInteger(interval) || interval < 1 || interval > 30) {
    throw new CvAnalysisError("invalidPointInterval");
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
