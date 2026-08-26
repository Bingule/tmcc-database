import {
  CvAnalysisError,
  type CvAlignedBranchGrid,
  type CvSeries,
  type CvSweepPoint,
  type InterpolatedCvData,
  type NormalizedCvBranch,
  type NormalizedCvCycle,
  type PotentialIntervalSetting
} from "./cvTypes";

export type { CvAlignedBranchGrid, PotentialIntervalSetting } from "./cvTypes";

export function pchipInterpolate(x: number[], y: number[], query: number[]): number[] {
  validatePchipInput(x, y);
  const derivatives = pchipDerivatives(x, y);
  const minimum = x[0]!;
  const maximum = x.at(-1)!;

  return query.map((queryX) => {
    if (!Number.isFinite(queryX)) throw new CvAnalysisError("invalidPotential");
    if (queryX < minimum || queryX > maximum) {
      throw new CvAnalysisError("noCommonPotentialRange");
    }
    if (queryX === maximum) return y.at(-1)!;

    const leftIndex = intervalIndex(x, queryX);
    const x0 = x[leftIndex]!;
    const x1 = x[leftIndex + 1]!;
    const y0 = y[leftIndex]!;
    const y1 = y[leftIndex + 1]!;
    const h = x1 - x0;
    const t = (queryX - x0) / h;
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
    const h10 = t ** 3 - 2 * t ** 2 + t;
    const h01 = -2 * t ** 3 + 3 * t ** 2;
    const h11 = t ** 3 - t ** 2;
    return h00 * y0 + h10 * h * derivatives[leftIndex]!
      + h01 * y1 + h11 * h * derivatives[leftIndex + 1]!;
  });
}

export function alignCvBranches(
  series: CvSeries[],
  cycles: NormalizedCvCycle[],
  interval: PotentialIntervalSetting
): CvAlignedBranchGrid {
  if (series.length === 0) throw new CvAnalysisError("noSeries");
  if (cycles.length !== series.length) throw new CvAnalysisError("invalidDataShape");

  const branches = cycles.flatMap((cycle) => [cycle.forward, cycle.reverse]).map(asAscendingBranch);
  branches.forEach((branch) => validatePchipInput(branch.x, branch.y));
  const commonMinimum = Math.max(...branches.map((branch) => branch.x[0]!));
  const commonMaximum = Math.min(...branches.map((branch) => branch.x.at(-1)!));
  if (commonMinimum > commonMaximum) throw new CvAnalysisError("noCommonPotentialRange");

  const nativePotentialInterval = median(branches.map((branch) => nativeInterval(branch.x)));
  const span = commonMaximum - commonMinimum;
  const { intervalCount, resolvedPotentialInterval } = resolvePotentialInterval(
    span,
    nativePotentialInterval,
    interval
  );
  const potentials = Array.from({ length: intervalCount + 1 }, (_, index) => index === intervalCount
    ? commonMaximum
    : commonMinimum + index * resolvedPotentialInterval);

  return {
    potentials,
    scanRates: series.map((item) => item.scanRate),
    forwardCurrents: cycles.map((cycle) => pchipInterpolate(
      asAscendingBranch(cycle.forward).x,
      asAscendingBranch(cycle.forward).y,
      potentials
    )),
    reverseCurrents: cycles.map((cycle) => pchipInterpolate(
      asAscendingBranch(cycle.reverse).x,
      asAscendingBranch(cycle.reverse).y,
      potentials
    )),
    commonMinimum,
    commonMaximum,
    nativePotentialInterval,
    resolvedPotentialInterval,
    cycles: [...cycles]
  };
}

export function toSequentialGrid(grid: CvAlignedBranchGrid): InterpolatedCvData {
  const reversePotentials = grid.potentials.slice(0, -1).reverse();
  return {
    potentials: [...grid.potentials, ...reversePotentials],
    scanRates: [...grid.scanRates],
    currents: grid.forwardCurrents.map((forward, seriesIndex) => [
      ...forward,
      ...grid.reverseCurrents[seriesIndex]!.slice(0, -1).reverse()
    ]),
    branches: [
      { branchIndex: 0, direction: 1, startIndex: 0, endIndex: grid.potentials.length - 1 },
      {
        branchIndex: 1,
        direction: -1,
        startIndex: grid.potentials.length - 1,
        endIndex: grid.potentials.length + reversePotentials.length - 1
      }
    ]
  };
}

type AscendingBranch = { x: number[]; y: number[] };

function asAscendingBranch(branch: NormalizedCvBranch): AscendingBranch {
  const collapsed = collapseConsecutivePlatformPoints(branch);
  const points: CvSweepPoint[] = branch.direction === 1 ? collapsed : [...collapsed].reverse();
  return {
    x: points.map((point) => point.potential),
    y: points.map((point) => point.current)
  };
}

function collapseConsecutivePlatformPoints(branch: NormalizedCvBranch): CvSweepPoint[] {
  const points: CvSweepPoint[] = [];
  let previous: CvSweepPoint | undefined;
  for (const point of branch.points) {
    if (previous !== undefined) {
      const potentialDifference = point.potential - previous.potential;
      if (potentialDifference === 0) {
        points[points.length - 1] = point;
        previous = point;
        continue;
      }
      if ((branch.direction === 1 && potentialDifference < 0)
        || (branch.direction === -1 && potentialDifference > 0)) {
        throw new CvAnalysisError("invalidDataShape");
      }
    }
    points.push(point);
    previous = point;
  }
  return points;
}

function validatePchipInput(x: number[], y: number[]): void {
  if (x.length < 2 || y.length !== x.length) throw new CvAnalysisError("invalidDataShape");
  for (let index = 0; index < x.length; index += 1) {
    if (!Number.isFinite(x[index])) throw new CvAnalysisError("invalidPotential");
    if (!Number.isFinite(y[index])) throw new CvAnalysisError("invalidCurrent");
    if (index > 0 && x[index]! <= x[index - 1]!) throw new CvAnalysisError("invalidDataShape");
  }
}

function pchipDerivatives(x: number[], y: number[]): number[] {
  const widths = x.slice(1).map((value, index) => value - x[index]!);
  const deltas = y.slice(1).map((value, index) => (value - y[index]!) / widths[index]!);
  if (x.length === 2) return [deltas[0]!, deltas[0]!];

  const derivatives = Array.from({ length: x.length }, () => 0);
  derivatives[0] = endpointDerivative(widths[0]!, widths[1]!, deltas[0]!, deltas[1]!);
  derivatives[x.length - 1] = endpointDerivative(
    widths.at(-1)!,
    widths.at(-2)!,
    deltas.at(-1)!,
    deltas.at(-2)!
  );
  for (let index = 1; index < x.length - 1; index += 1) {
    const deltaLeft = deltas[index - 1]!;
    const deltaRight = deltas[index]!;
    if (deltaLeft === 0 || deltaRight === 0 || Math.sign(deltaLeft) !== Math.sign(deltaRight)) continue;
    const widthLeft = widths[index - 1]!;
    const widthRight = widths[index]!;
    const weight1 = 2 * widthRight + widthLeft;
    const weight2 = widthRight + 2 * widthLeft;
    derivatives[index] = (weight1 + weight2) / (weight1 / deltaLeft + weight2 / deltaRight);
  }
  return derivatives;
}

function endpointDerivative(width0: number, width1: number, delta0: number, delta1: number): number {
  const derivative = ((2 * width0 + width1) * delta0 - width0 * delta1) / (width0 + width1);
  if (Math.sign(derivative) !== Math.sign(delta0)) return 0;
  if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(derivative) > 3 * Math.abs(delta0)) {
    return 3 * delta0;
  }
  return derivative;
}

function intervalIndex(x: number[], queryX: number): number {
  let lower = 0;
  let upper = x.length - 1;
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (queryX < x[middle]!) upper = middle;
    else lower = middle;
  }
  return lower;
}

function nativeInterval(x: number[]): number {
  return median(x.slice(1).map((value, index) => value - x[index]!));
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function resolvePotentialInterval(
  span: number,
  nativePotentialInterval: number,
  setting: PotentialIntervalSetting
): { intervalCount: number; resolvedPotentialInterval: number } {
  if (setting.mode === "manual") {
    const requestedVolts = setting.millivolts / 1000;
    if (!Number.isFinite(setting.millivolts) || setting.millivolts <= 0 || !Number.isFinite(requestedVolts) || requestedVolts <= 0) {
      throw new CvAnalysisError("invalidPotentialInterval");
    }
    const intervalCount = Math.max(1, Math.ceil(span / requestedVolts));
    return { intervalCount, resolvedPotentialInterval: span / intervalCount };
  }
  const intervalCount = Math.max(1, Math.round(span / nativePotentialInterval));
  return { intervalCount, resolvedPotentialInterval: span / intervalCount };
}
