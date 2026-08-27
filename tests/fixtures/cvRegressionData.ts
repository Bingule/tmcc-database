import type { CvSeries } from "../../src/lib/cvTypes";

type CurrentModel = (
  potential: number,
  branch: "forward" | "reverse",
  scanRate: number,
  seriesIndex: number,
  pointIndex: number
) => number;

export function makeBp150RegressionSeries(): CvSeries[] {
  const scanRates = [0.2, 0.4, 0.6, 0.8, 1];
  const amplitudes = [1, 10, 2, 20, 3];
  return scanRates.map((scanRate, seriesIndex) => {
    const offset = scanRate === 0.8 ? 0.0002 : 0;
    const grid = inclusiveGrid(-1.1 + offset, 0.4 + offset, 1.98e-3);
    const potentials = seamStartedLoop(grid, -0.4 + offset);
    return {
      label: `${scanRate} mV/s`,
      scanRate,
      points: makePoints(potentials, scanRate, seriesIndex, (potential, branch, _rate, index) => {
        const branchSign = branch === "forward" ? 1 : -1;
        const peak = Math.exp(-Math.pow((potential + 0.25) / 0.18, 2));
        const shoulder = Math.exp(-Math.pow((potential + 0.82) / 0.1, 2));
        const shape = 0.15 + 1.8 * peak + 0.8 * shoulder;
        return branchSign * amplitudes[index]! * shape + (branch === "forward" ? 0.04 : -0.03);
      })
    };
  });
}

export function makeNcpRegressionSeries(): CvSeries[] {
  const scanRates = [50, 20, 10, 5, 2];
  return scanRates.map((scanRate, seriesIndex) => {
    const minimum = 0.2 + (seriesIndex % 2) * 0.00046;
    const maximum = 1 - (seriesIndex % 3) * 0.00031;
    const grid = inclusiveGrid(minimum, maximum, 0.92e-3 * (1 + seriesIndex * 0.002));
    const potentials = seriesIndex % 2 === 0
      ? endpointStartedLoop(grid)
      : seamStartedLoop(grid, 0.58 + seriesIndex * 0.002);
    return {
      label: `${scanRate} mV/s`,
      scanRate,
      points: makePoints(potentials, scanRate, seriesIndex, (potential, branch, rate, index, pointIndex) => {
        const sign = branch === "forward" ? 1 : -1;
        const peak = Math.exp(-Math.pow((potential - 0.72) / 0.11, 2));
        const k1 = sign * (0.08 + 0.22 * peak);
        const k2 = sign * (0.45 + 0.35 * Math.cos((potential - 0.2) * Math.PI));
        const deterministicRipple = 0.0005 * Math.sin((pointIndex + 1) * (index + 2));
        const sparseEvidenceDistortion = potential > 0.32 && potential < 0.88
          ? sign * [0.8, -0.65, 0.75, -0.7, 0.85][index]!
          : 0;
        return k1 * rate + k2 * Math.sqrt(rate) + deterministicRipple + sparseEvidenceDistortion;
      })
    };
  });
}

export function makeSyntheticConstrainedDunnSeries(seed = 11): CvSeries[] {
  const random = makeLcg(seed);
  const scanRates = [0.7, 1.9, 4.3, 8.8];
  return scanRates.map((scanRate, seriesIndex) => {
    const minimum = -0.8 + seriesIndex * 0.002;
    const maximum = 0.6 - seriesIndex * 0.0015;
    const pointCount = 55 + seriesIndex * 3 + Math.abs(seed % 2);
    const grid = fixedCountGrid(minimum, maximum, pointCount);
    const potentials = seriesIndex % 2 === 0
      ? endpointStartedLoop(grid)
      : seamStartedLoop(grid, -0.1 + seriesIndex * 0.01);
    return {
      label: `${scanRate} mV/s`,
      scanRate,
      points: makePoints(potentials, scanRate, seriesIndex, (potential, branch, rate) => {
        const sign = branch === "forward" ? 1 : -1;
        const normalized = (potential - minimum) / (maximum - minimum);
        const gTrue = 0.25 + 0.45 * Math.pow(Math.sin(Math.PI * normalized), 2);
        const totalShape = sign * (0.8 + 0.5 * Math.cos(2 * Math.PI * normalized));
        const k1 = totalShape * gTrue;
        const k2 = totalShape * (1 - gTrue);
        const noise = (random() - 0.5) * 0.002;
        return k1 * rate + k2 * Math.sqrt(rate) + noise;
      })
    };
  });
}

export function makeResolutionStabilitySeries(pointCount: number): CvSeries[] {
  const scanRates = [0.7, 1.9, 4.3, 8.8];
  const regressionResiduals = orthogonalDunnResiduals(scanRates);
  return scanRates.map((scanRate, seriesIndex) => {
    const grid = fixedCountGrid(-0.8, 0.6, pointCount);
    const potentials = endpointStartedLoop(grid);
    return {
      label: `${scanRate} mV/s`,
      scanRate,
      points: makePoints(potentials, scanRate, seriesIndex, (potential, branch, rate) => {
        const normalized = (potential + 0.8) / 1.4;
        const sign = branch === "forward" ? 1 : -1;
        const gTrue = 0.25 + 0.45 * Math.pow(Math.sin(Math.PI * normalized), 2);
        const totalShape = sign * (0.8 + 0.5 * Math.cos(2 * Math.PI * normalized));
        // Test-only residual design: orthogonality to [1, sqrt(rate)] lowers R²
        // without biasing the theoretical Dunn k1/k2 coefficients or fraction.
        const regressionResidual = Math.sqrt(rate) * regressionResiduals[seriesIndex]!;
        const deterministicNoise = 0.0015 * Math.sin(9 * potential) * regressionResidual;
        const gapEnvelope = 0.95 + 0.05 * smoothBand(normalized, 0.35, 0.65, 0.05);
        const lowConfidenceGap = 0.6 * gapEnvelope * regressionResidual;
        return totalShape * gTrue * rate
          + totalShape * (1 - gTrue) * Math.sqrt(rate)
          + sign * (deterministicNoise + lowConfidenceGap);
      })
    };
  });
}

function orthogonalDunnResiduals(scanRates: number[]): number[] {
  const x = scanRates.map(Math.sqrt);
  const pattern = [1, -1, 1, -1];
  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanPattern = pattern.reduce((sum, value) => sum + value, 0) / pattern.length;
  const centeredX = x.map((value) => value - meanX);
  const centeredPattern = pattern.map((value) => value - meanPattern);
  const projection = centeredX.reduce((sum, value, index) =>
    sum + value * centeredPattern[index]!, 0)
    / centeredX.reduce((sum, value) => sum + value * value, 0);
  const residuals = centeredPattern.map((value, index) => value - projection * centeredX[index]!);
  const scale = Math.max(...residuals.map(Math.abs));
  return residuals.map((value) => value / scale);
}

function smoothBand(value: number, left: number, right: number, rampWidth: number): number {
  const leftRamp = Math.min(1, Math.max(0, (value - left) / rampWidth));
  const rightRamp = Math.min(1, Math.max(0, (right - value) / rampWidth));
  const smoothLeft = leftRamp ** 2 * (3 - 2 * leftRamp);
  const smoothRight = rightRamp ** 2 * (3 - 2 * rightRamp);
  return smoothLeft * smoothRight;
}

export function makeTurningPointRecoverySeries(recording: "single" | "double"): CvSeries[] {
  const scanRates = [1, 4, 9, 16];
  return scanRates.map((scanRate, seriesIndex) => {
    const grid = fixedCountGrid(-1, 1, 21);
    const potentials = recording === "single"
      ? endpointStartedLoop(grid)
      : [...grid, 1, ...grid.slice(0, -1).reverse()];
    return {
      label: `${scanRate} mV/s`,
      scanRate,
      points: makePoints(potentials, scanRate, seriesIndex, (potential, branch, rate) => {
        const sign = branch === "forward" ? 1 : -1;
        const k1 = sign * (0.35 + 0.08 * potential);
        const k2 = sign * (0.7 - 0.12 * potential);
        return k1 * rate + k2 * Math.sqrt(rate);
      })
    };
  });
}

function makePoints(
  potentials: number[],
  scanRate: number,
  seriesIndex: number,
  current: CurrentModel
): CvSeries["points"] {
  return potentials.map((potential, pointIndex) => ({
    potential,
    current: current(
      potential,
      branchAt(potentials, pointIndex),
      scanRate,
      seriesIndex,
      pointIndex
    )
  }));
}

function branchAt(potentials: number[], index: number): "forward" | "reverse" {
  const previousDelta = index > 0 ? potentials[index]! - potentials[index - 1]! : 0;
  const nextDelta = index < potentials.length - 1 ? potentials[index + 1]! - potentials[index]! : 0;
  const delta = previousDelta !== 0 ? previousDelta : nextDelta;
  return delta >= 0 ? "forward" : "reverse";
}

function inclusiveGrid(minimum: number, maximum: number, requestedInterval: number): number[] {
  const count = Math.max(2, Math.round((maximum - minimum) / requestedInterval));
  return fixedCountGrid(minimum, maximum, count + 1);
}

function fixedCountGrid(minimum: number, maximum: number, pointCount: number): number[] {
  return Array.from({ length: pointCount }, (_, index) => index === pointCount - 1
    ? maximum
    : minimum + (maximum - minimum) * index / (pointCount - 1));
}

function endpointStartedLoop(grid: number[]): number[] {
  return [...grid, ...grid.slice(0, -1).reverse()];
}

function seamStartedLoop(grid: number[], requestedSeam: number): number[] {
  const seamIndex = grid.reduce((closest, potential, index) =>
    Math.abs(potential - requestedSeam) < Math.abs(grid[closest]! - requestedSeam) ? index : closest, 0);
  return [
    ...grid.slice(seamIndex),
    ...grid.slice(0, -1).reverse(),
    ...grid.slice(1, seamIndex + 1)
  ];
}

function makeLcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
