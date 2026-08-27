import type { BValuePoint, CvFitRecord } from "./cvTypes";

type BRecord = CvFitRecord<BValuePoint>;

export function isSelectableBRecord(record: BRecord): boolean {
  return record.fit !== null
    && record.status !== "nearZeroCurrentUnstable"
    && record.status !== "zeroCurrentLogUnavailable"
    && record.status !== "insufficientData"
    && record.status !== "regressionFailed";
}

export function selectRepresentativeBRecord(records: BRecord[]): BRecord | null {
  const valid = records.filter((record) => record.status === "valid" && record.fit !== null);
  if (valid.length === 0) return null;
  const branchBounds = makeBranchBounds(records);
  const interior = valid.filter((record) => endpointDistance(record, branchBounds) >= 0.1);
  const candidates = interior.length > 0 ? interior : valid;
  return [...candidates].sort((left, right) => {
    const scoreDifference = selectionScore(right, branchBounds) - selectionScore(left, branchBounds);
    return scoreDifference !== 0 ? scoreDifference : left.sequenceIndex - right.sequenceIndex;
  })[0] ?? null;
}

export function snapBRecordToPotential(
  records: BRecord[],
  branchIndex: number,
  requestedPotential: number
): BRecord | null {
  if (!Number.isFinite(requestedPotential)) return null;
  const candidates = records.filter((record) => record.branchIndex === branchIndex && isSelectableBRecord(record));
  if (candidates.length === 0) return null;
  const minimum = Math.min(...candidates.map((record) => record.potential));
  const maximum = Math.max(...candidates.map((record) => record.potential));
  const displayRoundingTolerance = 5e-5 + Number.EPSILON * Math.max(1, Math.abs(requestedPotential));
  if (requestedPotential < minimum - displayRoundingTolerance
    || requestedPotential > maximum + displayRoundingTolerance) return null;
  return [...candidates].sort((left, right) => {
    const distance = Math.abs(left.potential - requestedPotential) - Math.abs(right.potential - requestedPotential);
    return distance !== 0 ? distance : left.sequenceIndex - right.sequenceIndex;
  })[0] ?? null;
}

export function formatSelectedPotential(potential: number): string {
  if (!Number.isFinite(potential)) return "";
  const rounded = Number(potential.toFixed(4));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

type BranchBounds = Map<number, { minimumSequence: number; maximumSequence: number; minimumPotential: number; maximumPotential: number }>;

function makeBranchBounds(records: BRecord[]): BranchBounds {
  const bounds: BranchBounds = new Map();
  for (const record of records) {
    const current = bounds.get(record.branchIndex);
    if (!current) {
      bounds.set(record.branchIndex, {
        minimumSequence: record.sequenceIndex,
        maximumSequence: record.sequenceIndex,
        minimumPotential: record.potential,
        maximumPotential: record.potential
      });
      continue;
    }
    current.minimumSequence = Math.min(current.minimumSequence, record.sequenceIndex);
    current.maximumSequence = Math.max(current.maximumSequence, record.sequenceIndex);
    current.minimumPotential = Math.min(current.minimumPotential, record.potential);
    current.maximumPotential = Math.max(current.maximumPotential, record.potential);
  }
  return bounds;
}

function endpointDistance(record: BRecord, bounds: BranchBounds): number {
  const bound = bounds.get(record.branchIndex);
  if (!bound || bound.maximumSequence === bound.minimumSequence) return 1;
  const position = (record.sequenceIndex - bound.minimumSequence) / (bound.maximumSequence - bound.minimumSequence);
  return 2 * Math.min(position, 1 - position);
}

function selectionScore(record: BRecord, bounds: BranchBounds): number {
  const fit = record.fit!;
  const stability = Math.max(0, Math.min(1, (Math.log10(Math.max(fit.currentStabilityRatio, 1e-12)) + 6) / 6));
  const bound = bounds.get(record.branchIndex);
  const center = bound && bound.maximumPotential > bound.minimumPotential
    ? 1 - 2 * Math.abs(record.potential - (bound.minimumPotential + bound.maximumPotential) / 2)
      / (bound.maximumPotential - bound.minimumPotential)
    : 1;
  return 0.45 * fit.rSquared
    + 0.3 * stability
    + 0.15 * endpointDistance(record, bounds)
    + 0.1 * Math.max(0, center);
}
