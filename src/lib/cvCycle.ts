import type { CvSeries, CvSweepBranch, SweepDirection } from "./cvTypes";

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
