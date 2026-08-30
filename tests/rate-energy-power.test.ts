import { describe, expect, it } from "vitest";
import {
  calculateSummaryEnergyPower,
  integrateDischargeCurve,
  toRagonePoints,
} from "../src/tools/rate-performance/analysis/energyPower";

describe("energy and power calculations", () => {
  it("calculates gravimetric summary values from specific capacity", () => {
    const result = calculateSummaryEnergyPower({
      sampleId: "cell-a", specificCapacity: 200, capacityUnit: "mAh-g-1",
      averageVoltage: 3.5, dischargeTime: 0.5, dischargeTimeUnit: "h",
      normalizationBasis: "active-material",
    });
    expect(result).toEqual(expect.objectContaining({
      status: "success", specificEnergyWhKg: 700, specificPowerWKg: 1400,
      volumetricEnergyWhL: null, normalizationBasis: "active-material",
    }));
  });

  it("requires mass for raw capacity and gates volumetric output on mass plus volume", () => {
    expect(calculateSummaryEnergyPower({
      sampleId: "raw", specificCapacity: 100, capacityUnit: "mAh",
      averageVoltage: 3, dischargeTime: 1, dischargeTimeUnit: "h",
      normalizationBasis: "electrode",
    })).toEqual(expect.objectContaining({ status: "failure", code: "mass-required" }));

    const result = calculateSummaryEnergyPower({
      sampleId: "raw", specificCapacity: 100, capacityUnit: "mAh",
      averageVoltage: 3, dischargeTime: 30, dischargeTimeUnit: "min",
      normalizationBasis: "electrode", massG: 2, volumeCm3: 0.5,
    });
    expect(result).toEqual(expect.objectContaining({
      status: "success", specificEnergyWhKg: 150, specificPowerWKg: 300,
      volumetricEnergyWhL: 600, volumetricPowerWL: 1200,
    }));
  });

  it("integrates V dQ trapezoidally for a monotonic capacity curve", () => {
    const result = integrateDischargeCurve([
      { id: "q0", capacity: 0, voltage: 4 },
      { id: "q1", capacity: 100, voltage: 3 },
      { id: "q2", capacity: 200, voltage: 2 },
    ], {
      mode: "capacity", capacityUnit: "mAh-g-1", dischargeTimeHours: 0.5,
      normalizationBasis: "active-material",
    });
    expect(result).toEqual(expect.objectContaining({
      status: "success", specificEnergyWhKg: 600, specificPowerWKg: 1200,
      integrationMethod: "trapezoidal-v-dq",
    }));
  });

  it("integrates V I dt for a time-current curve and rejects duplicate or reversed axes", () => {
    const result = integrateDischargeCurve([
      { id: "t0", time: 0, voltage: 4, current: 2 },
      { id: "t1", time: 1, voltage: 3, current: 2 },
    ], {
      mode: "time", timeUnit: "h", currentUnit: "mA", massG: 1,
      normalizationBasis: "device",
    });
    expect(result).toEqual(expect.objectContaining({
      status: "success", specificEnergyWhKg: 7, specificPowerWKg: 7,
      integrationMethod: "trapezoidal-v-i-dt",
    }));
    expect(integrateDischargeCurve([
      { id: "a", time: 0, voltage: 4, current: 1 },
      { id: "b", time: 0, voltage: 3, current: 1 },
    ], { mode: "time", timeUnit: "s", currentUnit: "mA", massG: 1, normalizationBasis: "device" }))
      .toEqual(expect.objectContaining({ status: "failure", code: "duplicate-axis" }));
    expect(integrateDischargeCurve([
      { id: "a", capacity: 1, voltage: 4 },
      { id: "b", capacity: 0, voltage: 3 },
    ], { mode: "capacity", capacityUnit: "mAh-g-1", normalizationBasis: "active-material" }))
      .toEqual(expect.objectContaining({ status: "failure", code: "non-monotonic-axis" }));
  });

  it("creates Ragone points without hiding normalization basis differences", () => {
    const summaries = [
      calculateSummaryEnergyPower({ sampleId: "active", specificCapacity: 100, capacityUnit: "Ah-kg-1", averageVoltage: 3, dischargeTime: 1, dischargeTimeUnit: "h", normalizationBasis: "active-material" }),
      calculateSummaryEnergyPower({ sampleId: "device", specificCapacity: 80, capacityUnit: "Ah-kg-1", averageVoltage: 3, dischargeTime: 0.5, dischargeTimeUnit: "h", normalizationBasis: "device" }),
    ];
    expect(toRagonePoints(summaries)).toEqual([
      { sampleId: "active", energyWhKg: 300, powerWKg: 300, normalizationBasis: "active-material" },
      { sampleId: "device", energyWhKg: 240, powerWKg: 480, normalizationBasis: "device" },
    ]);
  });
});
