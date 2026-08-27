import { fitPeakGroups, type CvPeakGroup } from "./cvPeakAnalysis";
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
  anchorSeriesIndex: number;
  branch: CvBranchKind;
  sourceIndex: number;
};

export type CvPeakOverrideState = {
  pointOverrides: CvPeakPointOverride[];
  manualPeaks: CvManualPeakAnchor[];
  removedPeakIds: string[];
};

export class CvPeakOverrideError extends Error {
  constructor(readonly code: "invalidPeak" | "invalidBranch" | "invalidSourceIndex" | "peakLimit") {
    super(code);
  }
}

export function createPeakOverrideState(): CvPeakOverrideState {
  return { pointOverrides: [], manualPeaks: [], removedPeakIds: [] };
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
    removedPeakIds: [...state.removedPeakIds]
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
    removedPeakIds: [...state.removedPeakIds]
  };
}

export function removePeakOverride(state: CvPeakOverrideState, peakId: string): CvPeakOverrideState {
  const manual = state.manualPeaks.some((item) => item.manualPeakId === peakId);
  return {
    pointOverrides: state.pointOverrides.filter((item) => item.peakId !== peakId).map((item) => ({ ...item })),
    manualPeaks: state.manualPeaks.filter((item) => item.manualPeakId !== peakId).map((item) => ({ ...item })),
    removedPeakIds: manual || state.removedPeakIds.includes(peakId)
      ? [...state.removedPeakIds]
      : [...state.removedPeakIds, peakId]
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
  anchor: Omit<CvManualPeakAnchor, "manualPeakId">
): CvPeakOverrideState {
  const activeAutomatic = automatic.fits.filter((fit) => !state.removedPeakIds.includes(fit.peakId)).length;
  if (activeAutomatic + state.manualPeaks.length >= 10) throw new CvPeakOverrideError("peakLimit");
  validateSourceOnBranch(series, cycles, anchor.anchorSeriesIndex, anchor.branch, anchor.sourceIndex);
  let suffix = 1;
  const used = new Set(state.manualPeaks.map((item) => item.manualPeakId));
  while (used.has(`manual-${suffix}`)) suffix += 1;
  return {
    pointOverrides: state.pointOverrides.map((item) => ({ ...item })),
    manualPeaks: [...state.manualPeaks.map((item) => ({ ...item })), {
      ...anchor,
      manualPeakId: `manual-${suffix}`
    }],
    removedPeakIds: [...state.removedPeakIds]
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
  for (const manual of state.manualPeaks) groups.push(makeManualGroup(manual, automatic, series, cycles));
  const excluded = new Map<string, CvPeakCandidate>();
  for (const override of state.pointOverrides) {
    const group = groups.find((item) => item.peakId === override.peakId);
    if (!group) throw new CvPeakOverrideError("invalidPeak");
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
  automatic: CvPeakAnalysisResult,
  series: CvSeries[],
  cycles: NormalizedCvCycle[]
): CvPeakGroup {
  const span = branchSpan(cycles[manual.anchorSeriesIndex]!, manual.branch);
  const anchor = candidateFromSource(series[manual.anchorSeriesIndex]!, manual.anchorSeriesIndex, manual.branch, manual.sourceIndex, span);
  const candidates = new Map<number, CvPeakCandidate>([[manual.anchorSeriesIndex, anchor]]);
  for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex += 1) {
    if (seriesIndex === manual.anchorSeriesIndex) continue;
    const local = automatic.candidates.filter((candidate) => candidate.seriesIndex === seriesIndex && candidate.branch === manual.branch);
    const nearest = local.sort((left, right) => Math.abs(left.potential - anchor.potential) - Math.abs(right.potential - anchor.potential))[0];
    if (nearest && Math.abs(nearest.potential - anchor.potential) <= 0.25 * span) candidates.set(seriesIndex, { ...nearest });
  }
  return {
    peakId: manual.manualPeakId,
    labelIndex: 1 + Math.max(0, ...automatic.fits.map((fit) => fit.labelIndex)),
    branch: manual.branch,
    kind: manual.branch === "forward" ? "oxidation" : "reduction",
    candidates
  };
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
