export interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  pointCount: number;
}

type Point = { x: number; y: number };

export function linearRegression(points: Point[]): RegressionResult | null {
  const finitePoints = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (finitePoints.length < 2) return null;

  const ordinaryResult = fitWithScales(finitePoints, 1, 1);
  if (ordinaryResult) return ordinaryResult;

  const xScale = Math.max(...finitePoints.map((point) => Math.abs(point.x)));
  const yScale = Math.max(...finitePoints.map((point) => Math.abs(point.y)));
  const safeXScale = xScale === 0 ? 1 : xScale;
  const safeYScale = yScale === 0 ? 1 : yScale;
  return fitWithScales(finitePoints, safeXScale, safeYScale);
}

function fitWithScales(finitePoints: Point[], safeXScale: number, safeYScale: number): RegressionResult | null {
  const scaledPoints = finitePoints.map((point) => ({
    x: point.x / safeXScale,
    y: point.y / safeYScale
  }));
  const meanX = mean(scaledPoints.map((point) => point.x));
  const meanY = mean(scaledPoints.map((point) => point.y));

  let covariance = 0;
  let xVariance = 0;
  for (const point of scaledPoints) {
    const centeredX = point.x - meanX;
    covariance += centeredX * (point.y - meanY);
    xVariance += centeredX * centeredX;
  }
  if (xVariance === 0 || !Number.isFinite(xVariance) || !Number.isFinite(covariance)) return null;

  const scaledSlope = covariance / xVariance;
  const scaledIntercept = meanY - scaledSlope * meanX;
  const slope = scaledSlope * (safeYScale / safeXScale);
  const intercept = scaledIntercept === 0 ? 0 : scaledIntercept * safeYScale;
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return null;

  let residualSumSquares = 0;
  let totalSumSquares = 0;
  for (const point of scaledPoints) {
    const residual = point.y - (scaledIntercept + scaledSlope * point.x);
    const centeredY = point.y - meanY;
    residualSumSquares += residual * residual;
    totalSumSquares += centeredY * centeredY;
  }

  let rSquared: number;
  if (totalSumSquares === 0) {
    if (residualSumSquares !== 0) return null;
    rSquared = 1;
  } else {
    rSquared = 1 - residualSumSquares / totalSumSquares;
    if (rSquared > 1 && rSquared < 1 + Number.EPSILON * 8) rSquared = 1;
    if (rSquared < 0 && rSquared > -Number.EPSILON * 8) rSquared = 0;
  }
  if (!Number.isFinite(rSquared)) return null;

  return { slope: normalizeZero(slope), intercept: normalizeZero(intercept), rSquared, pointCount: finitePoints.length };
}

function mean(values: number[]) {
  let result = 0;
  for (let index = 0; index < values.length; index += 1) {
    result += (values[index] - result) / (index + 1);
  }
  return result;
}

function normalizeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}
