import { describe, expect, it } from "vitest";
import type { RateNormalizationContext, RatePoint } from "../src/tools/rate-performance/models/types";
import { CA_RATE_EXAMPLE } from "../src/tools/rate-performance/data/caExamples";
import { ENERGY_POWER_EXAMPLE } from "../src/tools/rate-performance/data/energyExamples";
import { RATE_PERFORMANCE_EXAMPLE } from "../src/tools/rate-performance/data/rateExamples";
import { THICKNESS_KINETICS_EXAMPLE } from "../src/tools/rate-performance/data/thicknessExamples";
import { normalizeRatePoints } from "../src/tools/rate-performance/utils/rateUnits";
import { validateRatePoints } from "../src/tools/rate-performance/utils/rateValidation";

const point = (overrides: Partial<RatePoint> = {}): RatePoint => ({
  id: "p1",
  rate: 1,
  rateUnit: "h-1",
  capacity: 250,
  capacityUnit: "mAh-g-1",
  ...overrides,
});

describe("rate validation", () => {
  it("reports zero and negative rates as row-level errors", () => {
    const report = validateRatePoints([
      point({ id: "zero", rate: 0 }),
      point({ id: "negative", rate: -1 }),
    ]);

    expect(report.validPoints).toHaveLength(0);
    expect(report.invalidPoints).toHaveLength(2);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "nonPositiveRate", pointId: "zero", severity: "error" }),
      expect.objectContaining({ code: "nonPositiveRate", pointId: "negative", severity: "error" }),
    ]));
  });

  it("reports negative capacity without rejecting a measured zero capacity", () => {
    const report = validateRatePoints([
      point({ id: "negative", capacity: -1 }),
      point({ id: "zero", capacity: 0 }),
    ]);

    expect(report.invalidPoints.map(({ id }) => id)).toEqual(["negative"]);
    expect(report.validPoints.map(({ id }) => id)).toEqual(["zero"]);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "negativeCapacity",
      pointId: "negative",
      field: "capacity",
    }));
  });

  it("distinguishes missing values from non-finite values", () => {
    const report = validateRatePoints([
      point({ id: "missing-rate", rate: null }),
      point({ id: "missing-capacity", capacity: null }),
      point({ id: "infinite-rate", rate: Number.POSITIVE_INFINITY }),
      point({ id: "nan-capacity", capacity: Number.NaN }),
    ]);

    expect(report.validPoints).toHaveLength(0);
    expect(report.invalidPoints).toHaveLength(4);
    expect(report.issues.map(({ code }) => code)).toEqual([
      "missingRate",
      "missingCapacity",
      "nonFiniteRate",
      "nonFiniteCapacity",
    ]);
  });

  it("keeps duplicate positive rates as independent observations and warns", () => {
    const points = [point({ id: "first", rate: 2 }), point({ id: "second", rate: 2 })];
    const report = validateRatePoints(points);

    expect(report.hasErrors).toBe(false);
    expect(report.validPoints.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(report.invalidPoints).toHaveLength(0);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "duplicateRate",
      pointId: "second",
      duplicateOfPointId: "first",
      severity: "warning",
    }));
  });

  it("does not silently treat numerically equal values in different rate units as duplicates", () => {
    const report = validateRatePoints([
      point({ id: "measured-rate", rate: 1, rateUnit: "h-1" }),
      point({ id: "specific-current", rate: 1, rateUnit: "A-g-1" }),
    ]);

    expect(report.issues).toEqual([]);
    expect(report.validPoints).toHaveLength(2);
  });
});

describe("rate normalization", () => {
  it("converts mA g^-1 to measured rate using the capacity at the same point", () => {
    const [normalized] = normalizeRatePoints([
      point({ rate: 1000, rateUnit: "mA-g-1", capacity: 250 }),
    ], {} as RateNormalizationContext);

    expect(normalized.analysisRate).toBe(4);
    expect(normalized.normalization.method).toBe("specific-current");
  });

  it("converts A g^-1 to measured rate using the capacity at the same point", () => {
    const [normalized] = normalizeRatePoints([
      point({ rate: 1, rateUnit: "A-g-1", capacity: 250 }),
    ], {} as RateNormalizationContext);

    expect(normalized.analysisRate).toBe(4);
  });

  it("uses h^-1 directly only after explicit measured-discharge-time confirmation", () => {
    const [normalized] = normalizeRatePoints([
      point({ rate: 2.5, rateUnit: "h-1" }),
    ], { confirmHInverseMeasuredRate: true });

    expect(normalized.analysisRate).toBe(2.5);
    expect(normalized.normalization).toMatchObject({
      method: "measured-rate-direct",
      measuredRateConfirmed: true,
    });
  });

  it("blocks unconfirmed h^-1 input", () => {
    expect(() => normalizeRatePoints([
      point({ rate: 2.5, rateUnit: "h-1" }),
    ], {})).toThrowError(expect.objectContaining({ code: "measuredRateConfirmationRequired" }));
  });

  it("converts C-rate only with an explicit theoretical specific capacity", () => {
    const [normalized] = normalizeRatePoints([
      point({ rate: 2, rateUnit: "C-rate", capacity: 200 }),
    ], {
      theoreticalCapacity: { value: 300, unit: "mAh-g-1" },
    });

    expect(normalized.analysisRate).toBe(3);
    expect(normalized.normalization).toMatchObject({
      method: "c-rate",
      theoreticalCapacity: 300,
      theoreticalCapacityUnit: "mAh-g-1",
    });
  });

  it("blocks C-rate conversion when theoretical capacity is missing", () => {
    expect(() => normalizeRatePoints([
      point({ rate: 2, rateUnit: "C-rate", capacity: 200 }),
    ], {})).toThrowError(expect.objectContaining({ code: "theoreticalCapacityRequired" }));
  });

  it("normalizes Ah kg^-1 capacity without changing its numerical magnitude", () => {
    const [normalized] = normalizeRatePoints([
      point({ rate: 1, rateUnit: "A-g-1", capacity: 250, capacityUnit: "Ah-kg-1" }),
    ], {});

    expect(normalized.analysisCapacity).toBe(250);
    expect(normalized.analysisCapacityUnit).toBe("mAh-g-1");
  });

  it("preserves stable original rate and capacity metadata", () => {
    const input = point({
      id: "stable-id",
      rate: 1.25,
      rateUnit: "A-g-1",
      capacity: 240,
      capacityUnit: "Ah-kg-1",
    });
    const [normalized] = normalizeRatePoints([input], {});

    expect(normalized).toMatchObject({
      id: "stable-id",
      originalRate: 1.25,
      originalRateUnit: "A-g-1",
      originalCapacity: 240,
      originalCapacityUnit: "Ah-kg-1",
      analysisCapacity: 240,
      analysisCapacityUnit: "mAh-g-1",
    });
    expect(input).toEqual(point({
      id: "stable-id",
      rate: 1.25,
      rateUnit: "A-g-1",
      capacity: 240,
      capacityUnit: "Ah-kg-1",
    }));
  });

  it("rejects invalid points instead of silently dropping them", () => {
    expect(() => normalizeRatePoints([
      point({ id: "valid", rate: 1, rateUnit: "A-g-1" }),
      point({ id: "invalid", rate: 0, rateUnit: "A-g-1" }),
    ], {})).toThrowError(expect.objectContaining({
      code: "invalidRatePoints",
      detail: expect.objectContaining({ invalidPointIds: ["invalid"] }),
    }));
  });

  it("rejects zero measured capacity when division is required", () => {
    expect(() => normalizeRatePoints([
      point({ rate: 1, rateUnit: "A-g-1", capacity: 0 }),
    ], {})).toThrowError(expect.objectContaining({ code: "positiveMeasuredCapacityRequired" }));
  });
});

describe("structured example data", () => {
  it("exports centralized, typed, immutable, explicitly marked examples", () => {
    const examples = [
      RATE_PERFORMANCE_EXAMPLE,
      THICKNESS_KINETICS_EXAMPLE,
      CA_RATE_EXAMPLE,
      ENERGY_POWER_EXAMPLE,
    ];

    for (const example of examples) {
      expect(example.isExample).toBe(true);
      expect(Object.isFrozen(example)).toBe(true);
    }
    expect(Object.isFrozen(RATE_PERFORMANCE_EXAMPLE.points)).toBe(true);
    expect(Object.isFrozen(RATE_PERFORMANCE_EXAMPLE.points[0])).toBe(true);
    expect(Object.isFrozen(THICKNESS_KINETICS_EXAMPLE.samples)).toBe(true);
    expect(Object.isFrozen(CA_RATE_EXAMPLE.points)).toBe(true);
    expect(Object.isFrozen(ENERGY_POWER_EXAMPLE.samples)).toBe(true);
  });
});
