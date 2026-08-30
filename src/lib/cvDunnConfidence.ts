import type {
  DunnBranchFitRecord,
  DunnConfidenceMode,
  DunnFitGrid,
  DunnFractionGrid,
  DunnFractionPoint
} from "./cvTypes";

export type {
  DunnConfidenceMode,
  DunnFractionGrid,
  DunnFractionPoint
} from "./cvTypes";

const EPSILON_CONFIDENCE = 0.02;

export function localCapacitiveFraction(k1: number, k2: number, scanRate: number): number | null {
  if (!Number.isFinite(k1) || !Number.isFinite(k2) || !Number.isFinite(scanRate) || scanRate < 0) {
    return null;
  }
  const squareRootRate = Math.sqrt(scanRate);
  const capacitiveMagnitude = Math.abs(k1 * scanRate);
  const diffusionMagnitude = Math.abs(k2 * squareRootRate);
  const totalMagnitude = capacitiveMagnitude + diffusionMagnitude;
  if (!Number.isFinite(totalMagnitude) || totalMagnitude === 0) return null;
  return Math.min(1, Math.max(0, capacitiveMagnitude / totalMagnitude));
}

export function rSquaredConfidence(
  rSquared: number,
  mode: DunnConfidenceMode,
  threshold: number
): number {
  const r = Math.min(1, Math.max(0, rSquared));
  if (mode === "weighted") return EPSILON_CONFIDENCE + (1 - EPSILON_CONFIDENCE) * r * r;
  if (threshold === 0 || r >= threshold) {
    const normalized = threshold >= 1 ? 0 : (r - threshold) / (1 - threshold);
    return 1 + 4 * normalized * normalized;
  }
  const normalized = threshold === 0 ? r : r / threshold;
  return EPSILON_CONFIDENCE * normalized * normalized;
}

export function makeDunnFractionGrid(
  fits: DunnFitGrid,
  scanRate: number,
  mode: DunnConfidenceMode,
  threshold: number
): DunnFractionGrid {
  return {
    forward: fits.forward.map((record) => makeDunnFractionPoint(record, scanRate, mode, threshold)),
    reverse: fits.reverse.map((record) => makeDunnFractionPoint(record, scanRate, mode, threshold))
  };
}

function makeDunnFractionPoint(
  record: DunnBranchFitRecord,
  scanRate: number,
  mode: DunnConfidenceMode,
  threshold: number
): DunnFractionPoint {
  if (record.trimmed || isFailedStatus(record.status) || !record.fit) {
    return { fraction: null, confidence: 0, rSquared: null, trustedAnchor: false };
  }

  const { k1, k2, rSquared } = record.fit;
  const finiteRSquared = Number.isFinite(rSquared);
  const fraction = localCapacitiveFraction(k1, k2, scanRate);
  const confidence = finiteRSquared ? rSquaredConfidence(rSquared, mode, threshold) : 0;
  const trustedAnchor = mode === "threshold" && finiteRSquared && rSquared >= threshold;
  return {
    fraction,
    confidence,
    rSquared: finiteRSquared ? rSquared : null,
    trustedAnchor
  };
}

function isFailedStatus(status: DunnBranchFitRecord["status"]): boolean {
  return status === "insufficientData"
    || status === "zeroCurrentLogUnavailable"
    || status === "regressionFailed";
}
