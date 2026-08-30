import { describe, expect, it } from "vitest";
import { reconstructCaRate } from "../src/tools/rate-performance/analysis/reconstructCaRate";

describe("CA rate reconstruction", () => {
  it("integrates constant current and derives the literature effective rate", () => {
    const result = reconstructCaRate([
      { id: "p0", time: 0, current: 2 },
      { id: "p1", time: 1, current: 2 },
    ], {
      timeUnit: "h",
      currentUnit: "mA",
      activeMassG: 1,
      sign: "positive",
      baseline: { mode: "off" },
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.capacity.at(-1)).toBeCloseTo(2);
    expect(result.ratePoints).toEqual([
      expect.objectContaining({ id: "p1", rate: 1, capacity: 2 }),
    ]);
    expect(result.points[0]).toEqual(expect.objectContaining({
      effectiveRateH1: null,
      exclusionReason: "zero-accumulated-capacity",
    }));
  });

  it("sorts non-monotonic input while retaining original row provenance", () => {
    const result = reconstructCaRate([
      { id: "late", time: 2, current: 1 },
      { id: "start", time: 0, current: 1 },
      { id: "middle", time: 1, current: 1 },
    ], {
      timeUnit: "h", currentUnit: "mA", activeMassG: 1,
      sign: "positive", baseline: { mode: "off" },
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.inputOrder).toBe("sorted-for-analysis");
    expect(result.points.map((point) => [point.id, point.originalIndex])).toEqual([
      ["start", 1], ["middle", 2], ["late", 0],
    ]);
  });

  it("rejects duplicate times rather than silently changing the trace", () => {
    const result = reconstructCaRate([
      { id: "a", time: 1, current: 1 },
      { id: "b", time: 1, current: 2 },
    ], {
      timeUnit: "s", currentUnit: "mA", activeMassG: 1,
      sign: "positive", baseline: { mode: "off" },
    });

    expect(result).toEqual(expect.objectContaining({
      status: "failure",
      code: "duplicate-time",
      pointIds: ["a", "b"],
    }));
  });

  it("applies the selected integration range, negative-current convention and constant baseline", () => {
    const result = reconstructCaRate([
      { id: "outside-before", time: 0, current: -4 },
      { id: "start", time: 1, current: -3 },
      { id: "end", time: 2, current: -3 },
      { id: "outside-after", time: 3, current: -4 },
    ], {
      timeUnit: "h", currentUnit: "mA", activeMassG: 1,
      sign: "negative",
      baseline: { mode: "constant", value: 1 },
      integrationRange: { start: 1, end: 2 },
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.capacity).toEqual([0, 2]);
    expect(result.ratePoints).toEqual([
      expect.objectContaining({ id: "end", rate: 1, capacity: 2 }),
    ]);
    expect(result.excludedInputPointIds).toEqual(["outside-before", "outside-after"]);
  });

  it("fails explicitly when no positive accumulated-capacity rate point exists", () => {
    const result = reconstructCaRate([
      { id: "a", time: 0, current: 0 },
      { id: "b", time: 1, current: 0 },
    ], {
      timeUnit: "h", currentUnit: "mA", activeMassG: 1,
      sign: "positive", baseline: { mode: "off" },
    });

    expect(result).toEqual(expect.objectContaining({
      status: "failure",
      code: "no-valid-rate-points",
    }));
  });

  it("keeps smoothing disabled in the reconstruction contract", () => {
    const result = reconstructCaRate([
      { id: "a", time: 0, current: 1 },
      { id: "b", time: 3600, current: 1 },
    ], {
      timeUnit: "s", currentUnit: "mA", activeMassG: 1,
      sign: "positive", baseline: { mode: "off" },
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.processing.smoothing).toBe("off");
    expect(result.capacity.at(-1)).toBeCloseTo(1);
  });
});
