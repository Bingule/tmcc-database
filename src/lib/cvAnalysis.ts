import { linearRegression } from "./regression";
import {
  CvAnalysisError,
  type BValuePoint,
  type CvFitRecord,
  type CvSeries,
  type DunnAnalysisResult,
  type DunnContribution,
  type DunnPoint,
  type InterpolatedCvData
} from "./cvTypes";

type SortedSeries = CvSeries & { points: Array<{ potential: number; current: number }> };

export function interpolateCommonGrid(series: CvSeries[]): InterpolatedCvData {
  if (series.length === 0) throw new CvAnalysisError("noSeries");
  const sortedSeries = series.map(validateAndSortSeries);
  const commonMinimum = Math.max(...sortedSeries.map((item) => item.points[0].potential));
  const commonMaximum = Math.min(...sortedSeries.map((item) => item.points[item.points.length - 1].potential));
  if (commonMinimum > commonMaximum) throw new CvAnalysisError("noCommonPotentialRange");

  const potentials = [...new Set(sortedSeries.flatMap((item) => item.points
    .map((point) => point.potential)
    .filter((potential) => potential >= commonMinimum && potential <= commonMaximum)))]
    .sort((left, right) => left - right);
  if (potentials.length === 0) throw new CvAnalysisError("noCommonPotentialRange");

  return {
    potentials,
    scanRates: sortedSeries.map((item) => item.scanRate),
    currents: sortedSeries.map((item) => potentials.map((potential) => interpolateAt(item.points, potential)))
  };
}

export function analyzeBValue(data: InterpolatedCvData): BValuePoint[] {
  return attemptBValueFits(data).flatMap((record) => record.fit ? [record.fit] : []);
}

export function attemptBValueFits(data: InterpolatedCvData): Array<CvFitRecord<BValuePoint>> {
  validateInterpolatedCvData(data);
  const records: Array<CvFitRecord<BValuePoint>> = [];

  for (let potentialIndex = 0; potentialIndex < data.potentials.length; potentialIndex += 1) {
    const fitPoints: BValuePoint["fitPoints"] = [];
    const distinctScanRates = new Set<number>();
    let zeroCurrentUnavailable = false;
    for (let seriesIndex = 0; seriesIndex < data.scanRates.length; seriesIndex += 1) {
      const scanRate = data.scanRates[seriesIndex];
      const current = data.currents[seriesIndex][potentialIndex];
      if (!Number.isFinite(scanRate) || scanRate <= 0 || !Number.isFinite(current)) continue;
      if (current === 0) {
        zeroCurrentUnavailable = true;
        continue;
      }
      const logScanRate = Math.log(scanRate);
      const logCurrentMagnitude = Math.log(Math.abs(current));
      if (!Number.isFinite(logScanRate) || !Number.isFinite(logCurrentMagnitude)) continue;
      distinctScanRates.add(scanRate);
      fitPoints.push({ logScanRate, logCurrentMagnitude });
    }
    const potential = data.potentials[potentialIndex];
    if (distinctScanRates.size < 3) {
      records.push({
        potential,
        fit: null,
        status: zeroCurrentUnavailable ? "zeroCurrentLogUnavailable" : "insufficientData"
      });
      continue;
    }

    const regression = linearRegression(fitPoints.map((point) => ({
      x: point.logScanRate,
      y: point.logCurrentMagnitude
    })));
    if (!regression) {
      records.push({ potential, fit: null, status: "regressionFailed" });
      continue;
    }
    records.push({
      potential,
      status: "valid",
      fit: {
        potential,
        b: regression.slope,
        intercept: regression.intercept,
        rSquared: regression.rSquared,
        pointCount: regression.pointCount,
        fitPoints
      }
    });
  }

  return records;
}

export function analyzeDunn(data: InterpolatedCvData): DunnAnalysisResult {
  const records = attemptDunnFits(data);
  const points = records.flatMap((record) => record.fit ? [record.fit] : []);
  const coefficients = records.map((record) => record.fit
    ? { k1: record.fit.k1, k2: record.fit.k2 }
    : null);
  return { points, contributions: integrateDunnContributions(data, coefficients) };
}

export function attemptDunnFits(data: InterpolatedCvData): Array<CvFitRecord<DunnPoint>> {
  validateInterpolatedCvData(data);
  const records: Array<CvFitRecord<DunnPoint>> = [];

  for (let potentialIndex = 0; potentialIndex < data.potentials.length; potentialIndex += 1) {
    const fitPoints: Array<{ x: number; y: number }> = [];
    const distinctScanRates = new Set<number>();
    for (let seriesIndex = 0; seriesIndex < data.scanRates.length; seriesIndex += 1) {
      const scanRate = data.scanRates[seriesIndex];
      const current = data.currents[seriesIndex][potentialIndex];
      if (!Number.isFinite(scanRate) || scanRate <= 0 || !Number.isFinite(current)) continue;
      const squareRootRate = Math.sqrt(scanRate);
      const normalizedCurrent = current / squareRootRate;
      if (!Number.isFinite(squareRootRate) || !Number.isFinite(normalizedCurrent)) continue;
      distinctScanRates.add(scanRate);
      fitPoints.push({ x: squareRootRate, y: normalizedCurrent });
    }
    const potential = data.potentials[potentialIndex];
    if (distinctScanRates.size < 3) {
      records.push({ potential, fit: null, status: "insufficientData" });
      continue;
    }

    const regression = linearRegression(fitPoints);
    if (!regression) {
      records.push({ potential, fit: null, status: "regressionFailed" });
      continue;
    }
    const point = {
      potential,
      k1: regression.slope,
      k2: regression.intercept,
      rSquared: regression.rSquared,
      pointCount: regression.pointCount
    };
    records.push({ potential, fit: point, status: "valid" });
  }

  return records;
}

export function integrateDunnContributions(
  data: InterpolatedCvData,
  coefficients: Array<{ k1: number; k2: number } | null>
): DunnContribution[] {
  validateInterpolatedCvData(data);
  if (coefficients.length !== data.potentials.length) throw new CvAnalysisError("invalidDataShape");
  return data.scanRates.flatMap((scanRate) => {
    if (!Number.isFinite(scanRate) || scanRate <= 0) return [];
    const contribution = makeContribution(scanRate, data.potentials, coefficients);
    return contribution ? [contribution] : [];
  });
}

function validateAndSortSeries(series: CvSeries): SortedSeries {
  if (!Number.isFinite(series.scanRate) || series.scanRate <= 0) throw new CvAnalysisError("invalidScanRate");
  if (series.points.length === 0) throw new CvAnalysisError("noPoints");
  for (const point of series.points) {
    if (!Number.isFinite(point.potential)) throw new CvAnalysisError("invalidPotential");
    if (!Number.isFinite(point.current)) throw new CvAnalysisError("invalidCurrent");
  }
  const points = [...series.points].sort((left, right) => left.potential - right.potential);
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].potential === points[index - 1].potential) throw new CvAnalysisError("duplicatePotential");
  }
  return { ...series, points };
}

function interpolateAt(points: SortedSeries["points"], potential: number) {
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].potential === potential) return points[middle].current;
    if (points[middle].potential < potential) low = middle + 1;
    else high = middle - 1;
  }
  if (high < 0 || low >= points.length) throw new CvAnalysisError("noCommonPotentialRange");
  const left = points[high];
  const right = points[low];
  const fraction = (potential - left.potential) / (right.potential - left.potential);
  const current = left.current * (1 - fraction) + right.current * fraction;
  if (!Number.isFinite(current)) throw new CvAnalysisError("invalidCurrent");
  return current;
}

export function validateInterpolatedCvData(data: InterpolatedCvData) {
  if (data.currents.length !== data.scanRates.length
    || data.currents.some((row) => row.length !== data.potentials.length)) {
    throw new CvAnalysisError("invalidDataShape");
  }
  for (let index = 0; index < data.potentials.length; index += 1) {
    if (!Number.isFinite(data.potentials[index])) throw new CvAnalysisError("invalidPotential");
    if (index > 0 && data.potentials[index] <= data.potentials[index - 1]) {
      throw new CvAnalysisError("invalidDataShape");
    }
  }
}

function makeContribution(
  scanRate: number,
  potentials: number[],
  coefficients: Array<{ k1: number; k2: number } | null>
): DunnContribution | null {
  const squareRootRate = Math.sqrt(scanRate);
  const reconstructed = coefficients.map((coefficient) => {
    const capacitive = finiteOrNull(coefficient?.k1, scanRate);
    const diffusion = finiteOrNull(coefficient?.k2, squareRootRate);
    return capacitive === null || diffusion === null
      ? { capacitive: null, diffusion: null }
      : { capacitive, diffusion };
  });
  const capacitiveCurrent = reconstructed.map((current) => current.capacitive);
  const diffusionCurrent = reconstructed.map((current) => current.diffusion);
  const validPointCount = reconstructed.filter((current) => current.capacitive !== null).length;
  const sampledPointCount = potentials.length;
  let capacitiveArea = 0;
  let diffusionArea = 0;
  let intervalCount = 0;

  for (let index = 0; index < potentials.length - 1; index += 1) {
    const capLeft = capacitiveCurrent[index];
    const capRight = capacitiveCurrent[index + 1];
    const diffLeft = diffusionCurrent[index];
    const diffRight = diffusionCurrent[index + 1];
    if (capLeft === null || capRight === null || diffLeft === null || diffRight === null) continue;
    const width = potentials[index + 1] - potentials[index];
    const capIncrement = width * (Math.abs(capLeft) + Math.abs(capRight)) / 2;
    const diffIncrement = width * (Math.abs(diffLeft) + Math.abs(diffRight)) / 2;
    if (!Number.isFinite(capIncrement) || !Number.isFinite(diffIncrement)) return null;
    capacitiveArea += capIncrement;
    diffusionArea += diffIncrement;
    if (!Number.isFinite(capacitiveArea) || !Number.isFinite(diffusionArea)) return null;
    intervalCount += 1;
  }

  const percentages = normalizedPercentages(capacitiveArea, diffusionArea, intervalCount);
  if (!percentages) return null;
  return {
    scanRate,
    capacitivePercent: percentages.capacitive,
    diffusionPercent: percentages.diffusion,
    validPointCount,
    sampledPointCount,
    coveragePercent: sampledPointCount === 0 ? 0 : validPointCount / sampledPointCount * 100,
    capacitiveCurrent,
    diffusionCurrent
  };
}

function finiteOrNull(coefficient: number | undefined, factor: number) {
  if (coefficient === undefined) return null;
  const value = coefficient * factor;
  return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
}

function normalizedPercentages(capacitiveArea: number, diffusionArea: number, intervalCount: number) {
  if (intervalCount === 0) return null;
  const scale = Math.max(capacitiveArea, diffusionArea);
  if (scale === 0 || !Number.isFinite(scale)) return null;
  const capacitiveFraction = capacitiveArea / scale;
  const diffusionFraction = diffusionArea / scale;
  const denominator = capacitiveFraction + diffusionFraction;
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  const capacitive = capacitiveFraction / denominator * 100;
  const diffusion = 100 - capacitive;
  return Number.isFinite(capacitive) && Number.isFinite(diffusion) ? { capacitive, diffusion } : null;
}
