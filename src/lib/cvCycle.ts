import type {
  CvSeries,
  CvSweepBranch,
  CvSweepPoint,
  NormalizedCvBranch,
  NormalizedCvCycle,
  SweepDirection
} from "./cvTypes";

export type CvCycleStructureReason =
  | "tooManyTurningPoints"
  | "duplicatePotential"
  | "branchPointCount"
  | "inconsistentBranches";

export class CvCycleStructureError extends Error {
  constructor(
    readonly reason: CvCycleStructureReason,
    readonly detail: Readonly<Record<string, unknown>> = {}
  ) {
    super(reason);
    this.name = "CvCycleStructureError";
  }
}

export function splitCvCycle(points: CvSeries["points"]): CvSweepBranch[] {
  for (let sourceIndex = 0; sourceIndex < points.length; sourceIndex += 1) {
    const point = points[sourceIndex];
    if (!Number.isFinite(point.potential) || !Number.isFinite(point.current)) {
      throw new CvCycleStructureError("branchPointCount", {
        reason: "nonFinitePoint",
        sourceIndex
      });
    }
  }

  const branches: CvSweepBranch[] = [];
  let branchStart = 0;
  let direction: SweepDirection | null = null;
  let turningPointCount = 0;
  let sharesStartWithPrevious = false;

  const closeBranch = (end: number) => {
    if (direction === null) {
      throw new CvCycleStructureError("branchPointCount", { branchIndex: branches.length });
    }
    const branchPoints = points.slice(branchStart, end + 1);
    if (new Set(branchPoints.map((point) => point.potential)).size < 2) {
      throw new CvCycleStructureError("branchPointCount", { branchIndex: branches.length });
    }
    branches.push({
      branchIndex: branches.length,
      direction,
      sharesStartWithPrevious,
      points: branchPoints.map((point, offset) => ({
        potential: point.potential,
        current: point.current,
        sourceIndex: branchStart + offset
      }))
    });
  };

  const recordTurningPoint = () => {
    turningPointCount += 1;
    if (turningPointCount > 2) {
      throw new CvCycleStructureError("tooManyTurningPoints", { turningPointCount });
    }
  };

  for (let edgeIndex = 0; edgeIndex < points.length - 1; edgeIndex += 1) {
    const nextDirection = directionForEdge(points, edgeIndex);
    if (nextDirection === null) {
      const followingDirection = nextNonZeroDirection(points, edgeIndex + 1);
      if (direction !== null && followingDirection === -direction) {
        recordTurningPoint();
        closeBranch(edgeIndex);
        branchStart = edgeIndex + 1;
        direction = followingDirection;
        sharesStartWithPrevious = false;
      }
      continue;
    }

    if (direction === null) {
      direction = nextDirection;
      continue;
    }
    if (nextDirection === direction) continue;

    recordTurningPoint();
    closeBranch(edgeIndex);
    branchStart = edgeIndex;
    direction = nextDirection;
    sharesStartWithPrevious = true;
  }

  closeBranch(points.length - 1);
  return branches;
}

export function splitAlignedCvCycles(series: CvSeries[]): CvSweepBranch[][] {
  const split = alignCyclicSeams(series.map((item) => splitCvCycle(item.points)));
  const expected = split[0];
  if (expected === undefined) return split;

  for (let seriesIndex = 1; seriesIndex < split.length; seriesIndex += 1) {
    const candidate = split[seriesIndex];
    if (candidate.length !== expected.length || candidate.some((branch, branchIndex) => branch.direction !== expected[branchIndex].direction)) {
      throw new CvCycleStructureError("inconsistentBranches", {
        seriesIndex,
        expectedBranchCount: expected.length,
        actualBranchCount: candidate.length
      });
    }
  }
  return split;
}

type DirectionRun = {
  direction: SweepDirection;
  startIndex: number;
  endIndex: number;
};

export function normalizeCvCycle(points: CvSeries["points"]): NormalizedCvCycle {
  validateFinitePoints(points);
  const coarseRuns = directionRuns(points, Number.EPSILON * 32);
  const initialScale = selectionScale(points, coarseRuns);
  const directionTolerance = Math.max(
    Number.EPSILON * Math.max(1, initialScale.span) * 32,
    initialScale.nativePotentialInterval * 1e-6
  );
  const runs = directionRuns(points, directionTolerance);
  const scale = selectionScale(points, runs);
  const selection = selectFirstClosedLoop(points, runs, scale.nativePotentialInterval, scale.span);
  const selected = points.slice(selection.startIndex, selection.endIndex + 1);
  const nativePotentialInterval = robustNativeInterval(selected);
  const selectedSpan = potentialSpan(selected);
  const selectedDirectionTolerance = Math.max(
    Number.EPSILON * Math.max(1, selectedSpan) * 32,
    nativePotentialInterval * 1e-6
  );
  const selectedRuns = directionRuns(selected, selectedDirectionTolerance);
  const normalized = normalizeRunsAtCyclicSeam(
    selected.map((point, index) => ({
      ...point,
      sourceIndex: selection.startIndex + index
    })),
    selectedRuns,
    selectedDirectionTolerance
  );

  return {
    originalPoints: selected.map((point) => ({ ...point })),
    selectedStartIndex: selection.startIndex,
    selectedEndIndex: selection.endIndex,
    ignoredPointCount: points.length - selection.endIndex - 1,
    nativePotentialInterval,
    forward: normalized.forward,
    reverse: normalized.reverse,
    turningPotentials: normalized.turningPotentials
  };
}

function selectionScale(
  points: CvSeries["points"],
  runs: DirectionRun[]
): { nativePotentialInterval: number; span: number } {
  const firstRun = runs[0];
  const reverseRun = runs[1];
  if (firstRun === undefined || reverseRun === undefined) {
    const prefixEndIndex = firstRun === undefined ? 0 : firstRun.endIndex + 1;
    const prefix = points.slice(0, Math.max(2, prefixEndIndex));
    return {
      nativePotentialInterval: robustNativeInterval(prefix),
      span: potentialSpan(prefix)
    };
  }

  const twoTurnPrefix = points.slice(0, reverseRun.endIndex + 1);
  const twoTurnNativeInterval = robustNativeInterval(twoTurnPrefix);
  const twoTurnSpan = potentialSpan(twoTurnPrefix);
  const startsAtEndpoint = closeTo(
    points[0].potential,
    runDirectionalExtremum(points, reverseRun),
    closureTolerance(twoTurnNativeInterval, twoTurnSpan)
  );
  const scaleEndIndex = startsAtEndpoint ? firstRun.endIndex : reverseRun.endIndex;
  const prefix = points.slice(0, scaleEndIndex + 1);
  return {
    nativePotentialInterval: robustNativeInterval(prefix),
    span: potentialSpan(prefix)
  };
}

export function normalizeAlignedCvCycles(series: CvSeries[]): NormalizedCvCycle[] {
  return series.map((item) => normalizeCvCycle(item.points));
}

function validateFinitePoints(points: CvSeries["points"]): void {
  if (points.length < 2) {
    throw new CvCycleStructureError("branchPointCount", { reason: "tooFewPoints" });
  }
  for (let sourceIndex = 0; sourceIndex < points.length; sourceIndex += 1) {
    const point = points[sourceIndex];
    if (!Number.isFinite(point.potential) || !Number.isFinite(point.current)) {
      throw new CvCycleStructureError("branchPointCount", { reason: "nonFinitePoint", sourceIndex });
    }
  }
}

function robustNativeInterval(points: CvSeries["points"]): number {
  const intervals = points
    .slice(1)
    .map((point, index) => Math.abs(point.potential - points[index].potential))
    .filter((interval) => interval > Number.EPSILON)
    .sort((left, right) => left - right);
  if (intervals.length === 0) {
    throw new CvCycleStructureError("branchPointCount", { reason: "constantPotential" });
  }
  const middle = Math.floor(intervals.length / 2);
  return intervals.length % 2 === 1
    ? intervals[middle]
    : (intervals[middle - 1] + intervals[middle]) / 2;
}

function potentialSpan(points: CvSeries["points"]): number {
  const potentials = points.map((point) => point.potential);
  return Math.max(...potentials) - Math.min(...potentials);
}

function directionRuns(points: CvSeries["points"], tolerance: number): DirectionRun[] {
  const runs: DirectionRun[] = [];
  let direction: SweepDirection | null = null;
  let startIndex = 0;
  let lastNonZeroEdge = -1;
  let sawPlateau = false;

  for (let edgeIndex = 0; edgeIndex < points.length - 1; edgeIndex += 1) {
    const delta = points[edgeIndex + 1].potential - points[edgeIndex].potential;
    const nextDirection = Math.abs(delta) <= tolerance ? null : (delta > 0 ? 1 : -1) as SweepDirection;
    if (nextDirection === null) {
      if (direction !== null) sawPlateau = true;
      continue;
    }
    if (direction === null) {
      direction = nextDirection;
      lastNonZeroEdge = edgeIndex;
      continue;
    }
    if (direction === nextDirection) {
      lastNonZeroEdge = edgeIndex;
      sawPlateau = false;
      continue;
    }

    runs.push({
      direction,
      startIndex,
      endIndex: sawPlateau ? lastNonZeroEdge + 1 : edgeIndex
    });
    direction = nextDirection;
    startIndex = edgeIndex;
    lastNonZeroEdge = edgeIndex;
    sawPlateau = false;
  }

  if (direction === null) {
    throw new CvCycleStructureError("branchPointCount", { reason: "constantPotential" });
  }
  runs.push({ direction, startIndex, endIndex: points.length - 1 });
  return runs;
}

function closureTolerance(native: number, span: number): number {
  return Math.min(Math.max(2.5 * native, 0.001 * span), 0.01 * span);
}

function selectFirstClosedLoop(
  points: CvSeries["points"],
  runs: DirectionRun[],
  nativePotentialInterval: number,
  span: number
): { startIndex: number; endIndex: number } {
  if (span <= 0) {
    throw new CvCycleStructureError("branchPointCount", { reason: "constantPotential" });
  }
  const tolerance = closureTolerance(nativePotentialInterval, span);
  const startPotential = points[0].potential;
  const initialDirection = runs[0]?.direction;
  if (initialDirection === undefined) {
    throw new CvCycleStructureError("branchPointCount", { reason: "noSweepDirection" });
  }
  const reverseRun = runs[1];
  const startsAtExtremum = reverseRun !== undefined
    && closeTo(startPotential, runDirectionalExtremum(points, reverseRun), tolerance);

  if (startsAtExtremum) {
    const oppositeExtremum = runDirectionalExtremum(points, runs[0]);
    if (
      reverseRun.direction !== -initialDirection
      || !runReachesPotential(points, runs[0], oppositeExtremum, tolerance)
    ) {
      throw new CvCycleStructureError("branchPointCount", { reason: "incompleteCycle" });
    }
    const endIndex = closestIndexNearPotential(
      points,
      reverseRun.startIndex,
      reverseRun.endIndex,
      startPotential,
      tolerance
    );
    if (endIndex === undefined) {
      throw new CvCycleStructureError("branchPointCount", { reason: "incompleteCycle" });
    }
    return { startIndex: 0, endIndex };
  }

  const returnRun = runs[2];
  const firstExtremum = runDirectionalExtremum(points, runs[0]);
  const secondExtremum = reverseRun === undefined ? undefined : runDirectionalExtremum(points, reverseRun);
  if (
    reverseRun === undefined
    || returnRun === undefined
    || reverseRun.direction !== -initialDirection
    || returnRun.direction !== initialDirection
    || !runReachesPotential(points, runs[0], firstExtremum, tolerance)
    || secondExtremum === undefined
    || !runReachesPotential(points, reverseRun, secondExtremum, tolerance)
  ) {
    throw new CvCycleStructureError("branchPointCount", { reason: "incompleteCycle" });
  }
  const endIndex = closestIndexNearPotential(
    points,
    returnRun.startIndex,
    returnRun.endIndex,
    startPotential,
    tolerance
  );
  if (endIndex === undefined) {
    throw new CvCycleStructureError("branchPointCount", { reason: "incompleteCycle" });
  }
  return { startIndex: 0, endIndex };
}

function runDirectionalExtremum(points: CvSeries["points"], run: DirectionRun): number {
  const potentials = points.slice(run.startIndex, run.endIndex + 1).map((point) => point.potential);
  return run.direction === 1 ? Math.max(...potentials) : Math.min(...potentials);
}

function runReachesPotential(
  points: CvSeries["points"],
  run: DirectionRun,
  potential: number,
  tolerance: number
): boolean {
  return points.slice(run.startIndex, run.endIndex + 1)
    .some((point) => closeTo(point.potential, potential, tolerance));
}

function closestIndexNearPotential(
  points: CvSeries["points"],
  startIndex: number,
  endIndex: number,
  potential: number,
  tolerance: number
): number | undefined {
  let closestIndex: number | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = startIndex; index <= endIndex; index += 1) {
    const distance = Math.abs(points[index].potential - potential);
    if (distance <= tolerance && distance < closestDistance) {
      closestIndex = index;
      closestDistance = distance;
    }
  }
  return closestIndex;
}

function closeTo(left: number, right: number, tolerance: number): boolean {
  return Math.abs(left - right) <= tolerance;
}

function normalizeRunsAtCyclicSeam(
  points: CvSweepPoint[],
  runs: DirectionRun[],
  tolerance: number
): { forward: NormalizedCvBranch; reverse: NormalizedCvBranch; turningPotentials: number[] } {
  const runPoints = runs.map((run) => points.slice(run.startIndex, run.endIndex + 1));
  const first = runs[0];
  const last = runs.at(-1);
  if (first === undefined || last === undefined) {
    throw new CvCycleStructureError("branchPointCount", { reason: "noSweepDirection" });
  }

  if (first.direction === last.direction && runs.length >= 3) {
    const openingPoint = runPoints[0]?.[0];
    const closingRun = runPoints.at(-1);
    const closingPoint = closingRun?.at(-1);
    if (openingPoint !== undefined && closingRun !== undefined && closingPoint !== undefined && closeTo(openingPoint.potential, closingPoint.potential, tolerance)) {
      closingRun.pop();
    }
  }

  const branches = new Map<SweepDirection, CvSweepPoint[]>();
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    const branch = runPoints[index];
    const existing = branches.get(run.direction);
    branches.set(run.direction, existing === undefined ? branch : joinSeamRuns(existing, branch));
  }

  const forwardPoints = branches.get(1);
  const reversePoints = branches.get(-1);
  if (forwardPoints === undefined || reversePoints === undefined) {
    throw new CvCycleStructureError("branchPointCount", { reason: "incompleteCycle" });
  }
  forwardPoints.sort((left, right) => left.potential - right.potential);
  reversePoints.sort((left, right) => right.potential - left.potential);

  return {
    forward: { kind: "forward", direction: 1, points: forwardPoints },
    reverse: { kind: "reverse", direction: -1, points: reversePoints },
    turningPotentials: [forwardPoints.at(-1)!.potential, reversePoints.at(-1)!.potential]
  };
}

function joinSeamRuns(first: CvSweepPoint[], last: CvSweepPoint[]): CvSweepPoint[] {
  const joined = [...last, ...first];
  return joined.filter((point, index) => index === 0 || point.sourceIndex !== joined[index - 1].sourceIndex);
}

function alignCyclicSeams(cycles: CvSweepBranch[][]): CvSweepBranch[][] {
  if (!cycles.some((cycle) => cycle.length === 2) || !cycles.some((cycle) => cycle.length === 3)) {
    return cycles;
  }
  const reference = cycles.find((cycle) => cycle.length === 3)!;
  const initialDirection = reference[0].direction;
  const matchesCyclicPattern = cycles.every((cycle) => {
    if (cycle.length === 2) {
      return cycle[0].direction === initialDirection && cycle[1].direction === -initialDirection;
    }
    return cycle.length === 3
      && cycle[0].direction === initialDirection
      && cycle[1].direction === -initialDirection
      && cycle[2].direction === initialDirection;
  });
  if (!matchesCyclicPattern) return cycles;

  return cycles.map((cycle) => {
    if (cycle.length === 3) {
      return cycle.map((branch, branchIndex) => branchIndex === 2
        ? { ...branch, cyclicClosure: true }
        : branch);
    }
    const initial = cycle[0];
    return [
      ...cycle,
      {
        branchIndex: 2,
        direction: initial.direction,
        points: initial.points.map((point) => ({ ...point })),
        sharesStartWithPrevious: false,
        cyclicClosure: true
      }
    ];
  });
}

function directionForEdge(points: CvSeries["points"], edgeIndex: number): SweepDirection | null {
  const left = points[edgeIndex];
  const right = points[edgeIndex + 1];
  if (left === undefined || right === undefined) return null;
  const delta = right.potential - left.potential;
  if (delta === 0) return null;
  return delta > 0 ? 1 : -1;
}

function nextNonZeroDirection(points: CvSeries["points"], edgeIndex: number): SweepDirection | null {
  for (let index = edgeIndex; index < points.length - 1; index += 1) {
    const direction = directionForEdge(points, index);
    if (direction !== null) return direction;
  }
  return null;
}
