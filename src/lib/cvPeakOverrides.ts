import {
  findOriginalPeakExtrema,
  fitPeakGroups,
  predictPeakPotentialAtRate,
  type CvPeakGroup
} from "./cvPeakAnalysis";
import {
  type CvBranchKind,
  type CvPeakAnalysisResult,
  type CvPeakCandidate,
  type CvSeries,
  type NormalizedCvCycle
} from "./cvTypes";

export type CvPeakPointOverride = {
  peakId: string;
  seriesIndex: number;
  action: "confirm" | "adjust" | "exclude";
  sourceIndex?: number;
};

export type CvManualPeakAnchor = {
  manualPeakId: string;
  labelIndex: number;
  anchorSeriesIndex: number;
  branch: CvBranchKind;
  sourceIndex: number;
};

export type CvPeakOverrideState = {
  pointOverrides: CvPeakPointOverride[];
  manualPeaks: CvManualPeakAnchor[];
  removedPeakIds: string[];
  nextManualPeakNumber: number;
  nextLabelIndex: number;
};

export class CvPeakOverrideError extends Error {
  constructor(readonly code: "invalidPeak" | "invalidBranch" | "invalidSourceIndex" | "peakLimit") {
    super(code);
  }
}

export function createPeakOverrideState(): CvPeakOverrideState {
  return {
    pointOverrides: [],
    manualPeaks: [],
    removedPeakIds: [],
    nextManualPeakNumber: 1,
    nextLabelIndex: 1
  };
}

export function setPeakPointOverride(
  state: CvPeakOverrideState,
  override: CvPeakPointOverride
): CvPeakOverrideState {
  return {
    pointOverrides: [
      ...state.pointOverrides.filter((item) => item.peakId !== override.peakId || item.seriesIndex !== override.seriesIndex),
      { ...override }
    ],
    manualPeaks: state.manualPeaks.map((item) => ({ ...item })),
    removedPeakIds: [...state.removedPeakIds],
    nextManualPeakNumber: state.nextManualPeakNumber,
    nextLabelIndex: state.nextLabelIndex
  };
}

export function restorePeakPointOverride(
  state: CvPeakOverrideState,
  peakId: string,
  seriesIndex: number
): CvPeakOverrideState {
  return {
    pointOverrides: state.pointOverrides
      .filter((item) => item.peakId !== peakId || item.seriesIndex !== seriesIndex)
      .map((item) => ({ ...item })),
    manualPeaks: state.manualPeaks.map((item) => ({ ...item })),
    removedPeakIds: [...state.removedPeakIds],
    nextManualPeakNumber: state.nextManualPeakNumber,
    nextLabelIndex: state.nextLabelIndex
  };
}

export function removePeakOverride(state: CvPeakOverrideState, peakId: string): CvPeakOverrideState {
  const manual = state.manualPeaks.some((item) => item.manualPeakId === peakId);
  return {
    pointOverrides: state.pointOverrides.filter((item) => item.peakId !== peakId).map((item) => ({ ...item })),
    manualPeaks: state.manualPeaks.filter((item) => item.manualPeakId !== peakId).map((item) => ({ ...item })),
    removedPeakIds: manual || state.removedPeakIds.includes(peakId)
      ? [...state.removedPeakIds]
      : [...state.removedPeakIds, peakId],
    nextManualPeakNumber: state.nextManualPeakNumber,
    nextLabelIndex: state.nextLabelIndex
  };
}

export function snapPeakPoint(
  series: CvSeries,
  cycle: NormalizedCvCycle,
  branch: CvBranchKind,
  potential: number
): CvPeakCandidate {
  if (!Number.isFinite(potential)) throw new CvPeakOverrideError("invalidSourceIndex");
  const points = branch === "forward" ? cycle.forward.points : cycle.reverse.points;
  if (points.length === 0) throw new CvPeakOverrideError("invalidBranch");
  const selected = points.reduce((best, point) => {
    const difference = Math.abs(point.potential - potential);
    const bestDifference = Math.abs(best.potential - potential);
    return difference < bestDifference || (difference === bestDifference && point.sourceIndex < best.sourceIndex)
      ? point
      : best;
  });
  const span = Math.max(...points.map((point) => point.potential)) - Math.min(...points.map((point) => point.potential));
  return candidateFromSource(series, 0, branch, selected.sourceIndex, span);
}

export function addManualPeakOverride(
  state: CvPeakOverrideState,
  automatic: CvPeakAnalysisResult,
  series: CvSeries[],
  cycles: NormalizedCvCycle[],
  anchor: Omit<CvManualPeakAnchor, "manualPeakId" | "labelIndex">
): CvPeakOverrideState {
  if (automatic.fits.length >= 10) throw new CvPeakOverrideError("peakLimit");
  validateSourceOnBranch(series, cycles, anchor.anchorSeriesIndex, anchor.branch, anchor.sourceIndex);
  validateManualAnchor(automatic, series, cycles, anchor);
  const labelIndex = Math.max(
    state.nextLabelIndex,
    1 + Math.max(0, ...automatic.fits.map((fit) => fit.labelIndex))
  );
  return {
    pointOverrides: state.pointOverrides.map((item) => ({ ...item })),
    manualPeaks: [...state.manualPeaks.map((item) => ({ ...item })), {
      ...anchor,
      manualPeakId: `manual-${state.nextManualPeakNumber}`,
      labelIndex
    }],
    removedPeakIds: [...state.removedPeakIds],
    nextManualPeakNumber: state.nextManualPeakNumber + 1,
    nextLabelIndex: labelIndex + 1
  };
}

export function applyPeakOverrides(
  automatic: CvPeakAnalysisResult,
  series: CvSeries[],
  cycles: NormalizedCvCycle[],
  threshold: number,
  state: CvPeakOverrideState
): CvPeakAnalysisResult {
  const groups = automatic.fits
    .filter((fit) => !state.removedPeakIds.includes(fit.peakId))
    .map(fitToGroup);
  const excluded = new Map<string, CvPeakCandidate>();
  const pendingOverrides = [...state.pointOverrides];
  const applyOverridesToGroup = (group: CvPeakGroup) => {
    const matching = pendingOverrides.filter((override) => override.peakId === group.peakId);
    for (const override of matching) {
      if (!Number.isInteger(override.seriesIndex) || !series[override.seriesIndex] || !cycles[override.seriesIndex]) {
        throw new CvPeakOverrideError("invalidSourceIndex");
      }
      if (override.action === "exclude") {
        const candidate = group.candidates.get(override.seriesIndex);
        if (candidate) excluded.set(pointKey(override.peakId, override.seriesIndex), candidate);
        group.candidates.delete(override.seriesIndex);
        continue;
      }
      const sourceIndex = override.sourceIndex ?? group.candidates.get(override.seriesIndex)?.sourceIndex;
      if (sourceIndex === undefined) throw new CvPeakOverrideError("invalidSourceIndex");
      validateSourceOnBranch(series, cycles, override.seriesIndex, group.branch, sourceIndex);
      const base = group.candidates.get(override.seriesIndex);
      group.candidates.set(override.seriesIndex, {
        ...candidateFromSource(series[override.seriesIndex]!, override.seriesIndex, group.branch, sourceIndex, branchSpan(cycles[override.seriesIndex]!, group.branch)),
        prominence: base?.prominence ?? 0,
        normalizedProminence: base?.normalizedProminence ?? 0,
        confidence: base?.confidence ?? 0
      });
    }
    matching.forEach((override) => pendingOverrides.splice(pendingOverrides.indexOf(override), 1));
  };
  groups.forEach(applyOverridesToGroup);
  for (const manual of state.manualPeaks) {
    const group = makeManualGroup(manual, groups, series, cycles);
    applyOverridesToGroup(group);
    groups.push(group);
  }
  if (pendingOverrides.length > 0) throw new CvPeakOverrideError("invalidPeak");
  const fits = fitPeakGroups(groups, series, threshold, cycles).map((fit) => {
    const points = fit.points.map((point) => {
      const override = state.pointOverrides.find((item) => item.peakId === fit.peakId && item.seriesIndex === point.seriesIndex);
      const excludedCandidate = excluded.get(pointKey(fit.peakId, point.seriesIndex));
      if (override?.action === "exclude") return { ...point, candidate: excludedCandidate ?? null, status: "excluded" as const };
      if (override?.action === "confirm") return { ...point, status: "confirmed" as const };
      if (override?.action === "adjust") return { ...point, status: "adjusted" as const };
      return point;
    });
    const coverageCount = points.filter((point) => point.candidate !== null).length;
    return {
      ...fit,
      points,
      coverageCount,
      coverageStatus: coverageCount === series.length ? "complete" as const : "partial" as const
    };
  });
  return {
    candidates: automatic.candidates.map((candidate) => ({ ...candidate })),
    fits,
    maximumPeakCount: 10
  };
}

function fitToGroup(fit: CvPeakAnalysisResult["fits"][number]): CvPeakGroup {
  return {
    peakId: fit.peakId,
    labelIndex: fit.labelIndex,
    branch: fit.branch,
    kind: fit.kind,
    candidates: new Map(fit.points.flatMap((point) => point.candidate
      ? [[point.seriesIndex, { ...point.candidate }] as const]
      : []))
  };
}

function makeManualGroup(
  manual: CvManualPeakAnchor,
  occupiedGroups: CvPeakGroup[],
  series: CvSeries[],
  cycles: NormalizedCvCycle[]
): CvPeakGroup {
  const span = branchSpan(cycles[manual.anchorSeriesIndex]!, manual.branch);
  const anchor = candidateFromSource(series[manual.anchorSeriesIndex]!, manual.anchorSeriesIndex, manual.branch, manual.sourceIndex, span);
  const group: CvPeakGroup = {
    peakId: manual.manualPeakId,
    labelIndex: manual.labelIndex,
    branch: manual.branch,
    kind: manual.branch === "forward" ? "oxidation" : "reduction",
    candidates: new Map([[manual.anchorSeriesIndex, anchor]])
  };
  const order = series.map((item, seriesIndex) => ({ scanRate: item.scanRate, seriesIndex }))
    .sort((left, right) => left.scanRate - right.scanRate || left.seriesIndex - right.seriesIndex);
  const anchorPosition = order.findIndex((item) => item.seriesIndex === manual.anchorSeriesIndex);
  extendManualGroup(group, occupiedGroups, series, cycles, order.slice(anchorPosition + 1));
  extendManualGroup(group, occupiedGroups, series, cycles, order.slice(0, anchorPosition).reverse());
  return group;
}

function extendManualGroup(
  group: CvPeakGroup,
  occupiedGroups: CvPeakGroup[],
  series: CvSeries[],
  cycles: NormalizedCvCycle[],
  order: Array<{ scanRate: number; seriesIndex: number }>
) {
  for (const { scanRate, seriesIndex } of order) {
    const cycle = cycles[seriesIndex]!;
    const points = group.branch === "forward" ? cycle.forward.points : cycle.reverse.points;
    const span = branchSpan(cycle, group.branch);
    const currentSpan = Math.max(Number.EPSILON,
      Math.max(...points.map((point) => point.current)) - Math.min(...points.map((point) => point.current)));
    const minimumProminence = Math.max(Number.EPSILON, currentSpan * 1e-4);
    const predicted = predictPeakPotentialAtRate(group, scanRate);
    const occupied = occupiedSourceIndices(occupiedGroups, seriesIndex);
    const selected = findOriginalPeakExtrema(points, group.kind, 0.1 * span)
      .filter((candidate) => candidate.prominence >= minimumProminence)
      .filter((candidate) => Math.abs(candidate.point.potential - predicted) <= 0.25 * span)
      .filter((candidate) => !occupied.has(candidate.point.sourceIndex))
      .sort((left, right) => Math.abs(left.point.potential - predicted) - Math.abs(right.point.potential - predicted)
        || right.prominence - left.prominence
        || left.point.sourceIndex - right.point.sourceIndex)[0];
    if (!selected) continue;
    group.candidates.set(seriesIndex, {
      ...candidateFromSource(series[seriesIndex]!, seriesIndex, group.branch, selected.point.sourceIndex, span),
      prominence: selected.prominence,
      normalizedProminence: selected.prominence / currentSpan,
      confidence: 0.5
    });
  }
}

function occupiedSourceIndices(groups: CvPeakGroup[], seriesIndex: number): Set<number> {
  return new Set(groups.flatMap((group) => {
    const candidate = group.candidates.get(seriesIndex);
    return candidate ? [candidate.sourceIndex] : [];
  }));
}

function validateManualAnchor(
  active: CvPeakAnalysisResult,
  series: CvSeries[],
  cycles: NormalizedCvCycle[],
  anchor: Omit<CvManualPeakAnchor, "manualPeakId" | "labelIndex">
) {
  const cycle = cycles[anchor.anchorSeriesIndex]!;
  const points = anchor.branch === "forward" ? cycle.forward.points : cycle.reverse.points;
  const span = branchSpan(cycle, anchor.branch);
  const kind = anchor.branch === "forward" ? "oxidation" : "reduction";
  const localExtrema = findOriginalPeakExtrema(points, kind, 0.1 * span);
  if (!localExtrema.some((candidate) => candidate.point.sourceIndex === anchor.sourceIndex)) {
    throw new CvPeakOverrideError("invalidSourceIndex");
  }
  const occupied = active.fits.some((fit) => fit.points.some((point) =>
    point.seriesIndex === anchor.anchorSeriesIndex
      && point.status !== "excluded"
      && point.candidate?.sourceIndex === anchor.sourceIndex));
  if (occupied) throw new CvPeakOverrideError("invalidSourceIndex");
  if (!series[anchor.anchorSeriesIndex]!.points[anchor.sourceIndex]) {
    throw new CvPeakOverrideError("invalidSourceIndex");
  }
}

function candidateFromSource(
  series: CvSeries,
  seriesIndex: number,
  branch: CvBranchKind,
  sourceIndex: number,
  span: number
): CvPeakCandidate {
  const point = series.points[sourceIndex];
  if (!point) throw new CvPeakOverrideError("invalidSourceIndex");
  return {
    seriesIndex,
    scanRate: series.scanRate,
    branch,
    kind: branch === "forward" ? "oxidation" : "reduction",
    sourceIndex,
    potential: point.potential,
    current: point.current,
    branchSpan: span,
    prominence: 0,
    normalizedProminence: 0,
    confidence: 0
  };
}

function validateSourceOnBranch(
  series: CvSeries[],
  cycles: NormalizedCvCycle[],
  seriesIndex: number,
  branch: CvBranchKind,
  sourceIndex: number
) {
  if (!series[seriesIndex] || !cycles[seriesIndex] || !series[seriesIndex]!.points[sourceIndex]) {
    throw new CvPeakOverrideError("invalidSourceIndex");
  }
  const points = branch === "forward" ? cycles[seriesIndex]!.forward.points : cycles[seriesIndex]!.reverse.points;
  if (!points.some((point) => point.sourceIndex === sourceIndex)) throw new CvPeakOverrideError("invalidBranch");
}

function branchSpan(cycle: NormalizedCvCycle, branch: CvBranchKind): number {
  const points = branch === "forward" ? cycle.forward.points : cycle.reverse.points;
  return Math.max(...points.map((point) => point.potential)) - Math.min(...points.map((point) => point.potential));
}

function pointKey(peakId: string, seriesIndex: number): string {
  return `${peakId}:${seriesIndex}`;
}
