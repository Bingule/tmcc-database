import { describe, expect, it } from "vitest";
import {
  formatSelectedPotential,
  selectRepresentativeBRecord,
  snapBRecordToPotential
} from "../src/lib/cvBValueSelection";
import type { BValuePoint, CvFitRecord, CvFitStatus } from "../src/lib/cvTypes";

function record(options: {
  sequenceIndex: number;
  branchIndex?: number;
  potential: number;
  status?: CvFitStatus;
  rSquared?: number;
  stabilityRatio?: number;
}): CvFitRecord<BValuePoint> {
  const rSquared = options.rSquared ?? 0.99;
  return {
    sequenceIndex: options.sequenceIndex,
    branchIndex: options.branchIndex ?? 0,
    potential: options.potential,
    status: options.status ?? "valid",
    fit: {
      potential: options.potential,
      b: 0.75,
      intercept: 1,
      rSquared,
      pointCount: 5,
      fitPoints: [],
      minimumCurrentMagnitude: options.stabilityRatio ?? 0.1,
      currentStabilityFloor: 1e-6,
      currentStabilityRatio: options.stabilityRatio ?? 0.1
    }
  };
}

describe("b-value selection", () => {
  it("chooses a stable interior record rather than the first valid endpoint", () => {
    const records = [
      record({ sequenceIndex: 0, potential: -1, rSquared: 1 }),
      record({ sequenceIndex: 1, potential: -0.5, status: "nearZeroCurrentUnstable", stabilityRatio: 1e-8 }),
      record({ sequenceIndex: 2, potential: 0, rSquared: 0.98 }),
      record({ sequenceIndex: 3, potential: 0.5, rSquared: 0.97 }),
      record({ sequenceIndex: 4, potential: 1, rSquared: 1 })
    ];

    expect(selectRepresentativeBRecord(records)?.sequenceIndex).toBe(2);
  });

  it("snaps only within the selected branch range and keeps equal potentials branch-addressable", () => {
    const records = [
      record({ sequenceIndex: 1, branchIndex: 0, potential: 0.123456789 }),
      record({ sequenceIndex: 2, branchIndex: 0, potential: 0.223456789 }),
      record({ sequenceIndex: 4, branchIndex: 1, potential: 0.123456789 })
    ];

    expect(snapBRecordToPotential(records, 0, 0.2)?.sequenceIndex).toBe(2);
    expect(snapBRecordToPotential(records, 1, 0.1235)?.sequenceIndex).toBe(4);
    expect(snapBRecordToPotential(records, 0, -1)).toBeNull();
  });

  it("formats four decimals without changing the underlying value", () => {
    const potential = 0.123456789;
    expect(formatSelectedPotential(potential)).toBe("0.1235");
    expect(potential).toBe(0.123456789);
  });
});
