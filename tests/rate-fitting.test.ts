import { describe, expect, it } from "vitest";
import {
  estimateConfidenceIntervals,
} from "../src/tools/rate-performance/analysis/confidenceIntervals";
import {
  calculateFitStatistics,
} from "../src/tools/rate-performance/analysis/fitStatistics";
import {
  fitRatePerformance,
  type RateFitFailure,
  type RateFitPoint,
} from "../src/tools/rate-performance/analysis/fitRatePerformance";
import { evaluateRationalRate } from "../src/tools/rate-performance/models/rationalCharacteristicTime";
import { evaluateTianRate } from "../src/tools/rate-performance/models/tianCharacteristicTime";
import type { CharacteristicTimeRateParameters } from "../src/tools/rate-performance/models/types";

const rates = [0.0125, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];

function syntheticData(
  evaluate: (rate: number, parameters: CharacteristicTimeRateParameters) => number,
  parameters: CharacteristicTimeRateParameters,
  noise: ReadonlyArray<number> = [],
  selectedRates: ReadonlyArray<number> = rates,
): RateFitPoint[] {
  return selectedRates.map((rate, index) => ({
    rate,
    capacity: evaluate(rate, parameters) + (noise[index % noise.length] ?? 0),
  }));
}

function expectFailureWithoutParameters(
  result: Awaited<ReturnType<typeof fitRatePerformance>>,
  code: RateFitFailure["failure"]["code"],
): void {
  expect(result.status).toBe("failed");
  expect(result).not.toHaveProperty("parameters");
  if (result.status === "failed") {
    expect(result.failure.code).toBe(code);
  }
}

describe("fit statistics", () => {
  it("calculates exact unweighted residual statistics", () => {
    const statistics = calculateFitStatistics([1, 2, 3], [1, 1, 4], 1);

    expect(statistics.sse).toBe(2);
    expect(statistics.rmse).toBeCloseTo(Math.sqrt(2 / 3), 14);
    expect(statistics.rSquared).toBe(0);
    expect(statistics.adjustedRSquared).toBe(-1);
    expect(statistics.aic).toBeCloseTo(3 * Math.log(2 / 3) + 2, 14);
    expect(statistics.aicc).toBeCloseTo(3 * Math.log(2 / 3) + 6, 14);
    expect(statistics.bic).toBeCloseTo(3 * Math.log(2 / 3) + Math.log(3), 14);
  });

  it("returns null instead of non-finite or undefined statistics", () => {
    const tooFewForAicc = calculateFitStatistics([1, 2, 4, 8], [1.1, 1.9, 4.2, 7.8], 3);
    const exact = calculateFitStatistics([1, 2, 3, 4], [1, 2, 3, 4], 3);
    const constant = calculateFitStatistics([2, 2, 2, 2], [2, 2, 2, 2], 1);
    const nonFinite = calculateFitStatistics([1, 2], [1, Number.POSITIVE_INFINITY], 1);

    expect(tooFewForAicc.aicc).toBeNull();
    expect(exact).toMatchObject({ aic: null, aicc: null, bic: null });
    expect(constant.rSquared).toBeNull();
    expect(Object.values(nonFinite).every((value) => value === null)).toBe(true);
  });
});

describe("bounded characteristic-time fitting", () => {
  it("recovers noiseless Tian parameters with an asynchronous fit", async () => {
    const pending = fitRatePerformance(
      syntheticData(evaluateTianRate, { qM: 325, tau: 0.8, n: 0.62 }),
      { modelId: "tian-characteristic-time" },
    );

    expect(pending).toBeInstanceOf(Promise);
    const result = await pending;
    expect(result.status).toBe("converged");
    if (result.status === "converged") {
      expect(result.parameters.qM).toBeCloseTo(325, 2);
      expect(result.parameters.tau).toBeCloseTo(0.8, 2);
      expect(result.parameters.n).toBeCloseTo(0.62, 2);
      expect(result.statistics.sse).toBeCloseTo(0, 8);
      expect(result.predictions).toHaveLength(rates.length);
      expect(result.residuals).toHaveLength(rates.length);
    }
  });

  it("recovers rational-model parameters from deterministic noisy data", async () => {
    const result = await fitRatePerformance(
      syntheticData(
        evaluateRationalRate,
        { qM: 280, tau: 1.3, n: 0.72 },
        [0.8, -0.5, 1.1, -0.9, 0.4, -0.2],
      ),
      { modelId: "rational-characteristic-time" },
    );

    expect(result.status).toBe("converged");
    if (result.status === "converged") {
      expect(Math.abs(result.parameters.qM / 280 - 1)).toBeLessThan(0.01);
      expect(result.parameters.tau).toBeCloseTo(1.3, 1);
      expect(result.parameters.n).toBeCloseTo(0.72, 1);
      expect(result.statistics.rmse).not.toBeNull();
      expect(result.iterations).toBeGreaterThan(0);
    }
  });

  it("uses every valid observation, including duplicate rates", async () => {
    const parameters = { qM: 310, tau: 0.9, n: 0.58 };
    const manyRates = Array.from({ length: 257 }, (_, index) => 10 ** (-2 + 4 * index / 256));
    manyRates[128] = manyRates[127];
    const data = syntheticData(evaluateTianRate, parameters, [], manyRates);
    const result = await fitRatePerformance(data, { modelId: "tian-characteristic-time" });

    expect(result.status).toBe("converged");
    if (result.status === "converged") {
      expect(result.usedPointCount).toBe(data.length);
      expect(result.predictions).toHaveLength(data.length);
      expect(result.warnings).toContainEqual(expect.objectContaining({ code: "duplicate-rate" }));
    }
  });

  it.each([
    [[{ rate: 1, capacity: 10 }, { rate: 2, capacity: 8 }, { rate: 3, capacity: 6 }], "insufficient-data"],
    [[{ rate: 0, capacity: 10 }, { rate: 1, capacity: 8 }, { rate: 2, capacity: 6 }, { rate: 3, capacity: 4 }], "invalid-data"],
    [[{ rate: -1, capacity: 10 }, { rate: 1, capacity: 8 }, { rate: 2, capacity: 6 }, { rate: 3, capacity: 4 }], "invalid-data"],
    [[{ rate: 1, capacity: Number.NaN }, { rate: 2, capacity: 8 }, { rate: 3, capacity: 6 }, { rate: 4, capacity: 4 }], "invalid-data"],
  ] as const)("returns a typed parameter-free failure for invalid or insufficient data", async (data, code) => {
    const result = await fitRatePerformance(data, { modelId: "tian-characteristic-time" });
    expectFailureWithoutParameters(result, code);
  });

  it("rejects pending and unknown models without executing them", async () => {
    expectFailureWithoutParameters(
      await fitRatePerformance(syntheticData(evaluateTianRate, { qM: 300, tau: 1, n: 0.6 }), {
        modelId: "heubner-type",
      }),
      "model-not-validated",
    );
    expectFailureWithoutParameters(
      await fitRatePerformance(syntheticData(evaluateTianRate, { qM: 300, tau: 1, n: 0.6 }), {
        modelId: "unknown-model",
      }),
      "model-not-found",
    );
  });

  it("reports maximum-iteration exhaustion without leaking parameters", async () => {
    const result = await fitRatePerformance(
      syntheticData(evaluateTianRate, { qM: 325, tau: 0.8, n: 0.62 }),
      { modelId: "tian-characteristic-time", maxIterations: 1 },
    );

    expectFailureWithoutParameters(result, "maximum-iterations");
  });

  it("provides timeout and cancellation gates without leaking parameters", async () => {
    const data = syntheticData(evaluateTianRate, { qM: 325, tau: 0.8, n: 0.62 });
    const controller = new AbortController();
    controller.abort();

    expectFailureWithoutParameters(
      await fitRatePerformance(data, { modelId: "tian-characteristic-time", timeoutMs: 0 }),
      "timeout",
    );
    expectFailureWithoutParameters(
      await fitRatePerformance(data, { modelId: "tian-characteristic-time", signal: controller.signal }),
      "cancelled",
    );
  });
});

describe("Jacobian covariance and confidence intervals", () => {
  const bounds = {
    qM: { minimum: 1, maximum: 1000 },
    tau: { minimum: 1e-6, maximum: 1e6 },
    n: { minimum: 0.05, maximum: 3 },
  } as const;

  it("returns not-estimable intervals when residual degrees of freedom are absent", () => {
    const data = syntheticData(
      evaluateTianRate,
      { qM: 300, tau: 1, n: 0.6 },
      [],
      [0.1, 1, 10],
    );
    const result = estimateConfidenceIntervals(
      data,
      { qM: 300, tau: 1, n: 0.6 },
      evaluateTianRate,
      bounds,
      0,
    );

    expect(result.covariance).toBeNull();
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "insufficient-degrees-of-freedom" }));
    expect(Object.values(result.parameters).every(({ confidenceInterval95 }) => confidenceInterval95 === null)).toBe(true);
  });

  it("detects singular covariance for repeated-rate observations", () => {
    const parameters = { qM: 300, tau: 1, n: 0.6 };
    const data = syntheticData(evaluateTianRate, parameters, [0.2, -0.2], [1, 1, 1, 1, 1, 1]);
    const result = estimateConfidenceIntervals(data, parameters, evaluateTianRate, bounds, 0.24);

    expect(result.covariance).toBeNull();
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "singular-covariance" }));
    expect(Object.values(result.parameters).every(({ standardError }) => standardError === null)).toBe(true);
  });

  it("warns and suppresses an interval for a boundary-locked parameter", () => {
    const parameters = { qM: bounds.qM.minimum, tau: 1, n: 0.6 };
    const data = syntheticData(evaluateTianRate, parameters);
    const result = estimateConfidenceIntervals(data, parameters, evaluateTianRate, bounds, 0.5);

    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "boundary-locked", parameter: "qM" }));
    expect(result.parameters.qM).toEqual({ standardError: null, confidenceInterval95: null });
  });

  it("rejects a non-finite numerical Jacobian instead of fabricating confidence intervals", () => {
    const parameters = { qM: 300, tau: 1, n: 0.6 };
    const data = syntheticData(evaluateTianRate, parameters);
    const result = estimateConfidenceIntervals(
      data,
      parameters,
      () => Number.POSITIVE_INFINITY,
      bounds,
      1,
    );

    expect(result.covariance).toBeNull();
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "non-finite-jacobian" }));
    expect(Object.values(result.parameters).every(({ confidenceInterval95 }) => confidenceInterval95 === null)).toBe(true);
  });
});
