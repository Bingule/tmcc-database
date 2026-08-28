import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "../src/components/SiteHeader";
import { I18nProvider } from "../src/i18n/I18nProvider";
import {
  compareRateModels,
  createRateModelComparator,
  ModelComparisonError,
  type ModelComparisonResult,
} from "../src/tools/rate-performance/analysis/compareRateModels";
import type {
  RateFitConverged,
  RateFitResult,
} from "../src/tools/rate-performance/analysis/fitRatePerformance";
import { getRateModel } from "../src/tools/rate-performance/models/registry";
import EmpiricalModelsPage from "../src/tools/rate-performance/pages/EmpiricalModelsPage";
import ModelComparisonPage from "../src/tools/rate-performance/pages/ModelComparisonPage";
import { ModelComparisonResults, type ComparisonChart } from "../src/tools/rate-performance/components/ModelComparisonResults";
import type { NormalizedRatePoint } from "../src/tools/rate-performance/models/types";
import {
  serializeModelComparisonCsv,
  serializeModelComparisonResidualsCsv,
} from "../src/tools/rate-performance/utils/rateComparisonExports";

const { fitRatePerformance } = vi.hoisted(() => ({
  fitRatePerformance: vi.fn(),
}));

vi.mock("../src/tools/rate-performance/analysis/fitRatePerformance", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/tools/rate-performance/analysis/fitRatePerformance")>();
  return { ...original, fitRatePerformance };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const data = [
  { rate: 0.1, capacity: 300 },
  { rate: 0.3, capacity: 284 },
  { rate: 1, capacity: 250 },
  { rate: 3, capacity: 193 },
  { rate: 10, capacity: 118 },
  { rate: 30, capacity: 64 },
] as const;

beforeEach(() => fitRatePerformance.mockReset());

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

function converged(
  modelId: string,
  statistics: Partial<RateFitConverged["statistics"]> = {},
): RateFitConverged {
  return {
    status: "converged",
    modelId,
    parameters: { qM: modelId.startsWith("tian") ? 310 : 305, tau: 0.8, n: 0.62 },
    predictions: [298, 286, 249, 194, 117, 65],
    residuals: [2, -2, 1, -1, 1, -1],
    statistics: {
      sse: 12,
      rmse: 1.414,
      rSquared: 0.998,
      adjustedRSquared: 0.996,
      aic: 10,
      aicc: 34,
      bic: 9.4,
      ...statistics,
    },
    uncertainty: {
      covariance: null,
      parameters: {
        qM: { standardError: null, confidenceInterval95: null },
        tau: { standardError: null, confidenceInterval95: null },
        n: { standardError: null, confidenceInterval95: null },
      },
      warnings: [],
    },
    iterations: 24,
    iterationCountExact: true,
    usedPointCount: data.length,
    warnings: [],
  };
}

function failed(modelId: string): RateFitResult {
  return {
    status: "failed",
    modelId,
    failure: { code: "maximum-iterations", message: "not converged" },
    iterations: 240,
    iterationCountExact: true,
    warnings: [],
  };
}

describe("compareRateModels", () => {
  it("rejects pending and unknown IDs before executing any fit", async () => {
    const fit = vi.fn();
    const compare = createRateModelComparator({ fit, resolveModel: getRateModel });

    await expect(compare(data, ["tian-characteristic-time", "peukert-type"]))
      .rejects.toEqual(expect.objectContaining({ code: "modelPendingValidation", modelId: "peukert-type" }));
    await expect(compare(data, ["unknown-rate-model"]))
      .rejects.toEqual(expect.objectContaining({ code: "modelUnknown", modelId: "unknown-rate-model" }));
    expect(fit).not.toHaveBeenCalled();
    expect(new ModelComparisonError("noModelsSelected")).toBeInstanceOf(Error);
  });

  it("uses AICc uniformly when every converged candidate has a finite AICc", async () => {
    const fit = vi.fn(async (_points, options: { modelId: string }) => options.modelId.startsWith("tian")
      ? converged(options.modelId, { aic: -100, aicc: 21, rSquared: 0.91 })
      : converged(options.modelId, { aic: -90, aicc: 24.5, rSquared: 0.9999 }));
    const result = await createRateModelComparator({ fit, resolveModel: getRateModel })(data, [
      "rational-characteristic-time",
      "tian-characteristic-time",
    ]);

    expect(fit).toHaveBeenCalledTimes(2);
    expect(fit.mock.calls.every(([points]) => points === data)).toBe(true);
    expect(result.criterion).toBe("AICc");
    expect(result.rows.map(({ modelId }) => modelId)).toEqual([
      "tian-characteristic-time",
      "rational-characteristic-time",
    ]);
    expect(result.rows[0]).toMatchObject({ rank: 1, deltaCriterion: 0, parameterCount: 3 });
    expect(result.rows[1]).toMatchObject({ rank: 2, deltaCriterion: 3.5, parameterCount: 3 });
    expect(result.recommendation).toBe("tian-characteristic-time");
    expect(result.recommendationReason).toBe("recommended");
  });

  it("falls back to AIC for every row and does not recommend weak or single-model evidence", async () => {
    const fit = vi.fn(async (_points, options: { modelId: string }) => options.modelId.startsWith("tian")
      ? converged(options.modelId, { aic: 5, aicc: 500, rSquared: 0.8 })
      : converged(options.modelId, { aic: 6.5, aicc: null, rSquared: 0.999 }));
    const compare = createRateModelComparator({ fit, resolveModel: getRateModel });
    const result = await compare(data, ["rational-characteristic-time", "tian-characteristic-time"]);

    expect(result.criterion).toBe("AIC");
    expect(result.rows[0]).toMatchObject({ modelId: "tian-characteristic-time", rank: 1, deltaCriterion: 0 });
    expect(result.rows[1]).toMatchObject({ modelId: "rational-characteristic-time", rank: 2, deltaCriterion: 1.5 });
    expect(result.recommendation).toBeNull();
    expect(result.recommendationReason).toBe("insufficientEvidence");

    const single = await compare(data, ["tian-characteristic-time"]);
    expect(single.recommendation).toBeNull();
    expect(single.recommendationReason).toBe("singleModel");
  });

  it("keeps failed fits parameter/statistic-free and unranked", async () => {
    const fit = vi.fn(async (_points, options: { modelId: string }) => options.modelId.startsWith("tian")
      ? converged(options.modelId, { aic: 5, aicc: 20 })
      : failed(options.modelId));
    const result = await createRateModelComparator({ fit, resolveModel: getRateModel })(data, [
      "rational-characteristic-time",
      "tian-characteristic-time",
    ]);
    const failedRow = result.rows.find(({ modelId }) => modelId === "rational-characteristic-time")!;

    expect(failedRow).toMatchObject({ convergence: "failed", parameters: null, statistics: null, rank: null, deltaCriterion: null });
    expect(result.recommendation).toBeNull();
    expect(result.recommendationReason).toBe("incompleteFits");
  });

  it("isolates a thrown fitter as a typed failed row while preserving successful models", async () => {
    const fit = vi.fn((_points, options: { modelId: string }) => {
      if (options.modelId.startsWith("rational")) throw new Error("optimizer exploded");
      return Promise.resolve(converged(options.modelId, { aicc: 20 }));
    });
    const result = await createRateModelComparator({ fit, resolveModel: getRateModel })(data, [
      "rational-characteristic-time",
      "tian-characteristic-time",
    ]);

    expect(result.rows.find(({ modelId }) => modelId === "tian-characteristic-time"))
      .toMatchObject({ convergence: "converged", rank: 1 });
    expect(result.rows.find(({ modelId }) => modelId === "rational-characteristic-time"))
      .toMatchObject({ convergence: "failed", failureCode: "optimizer-error", parameters: null, statistics: null, rank: null });
    expect(result.recommendation).toBeNull();
    expect(result.recommendationReason).toBe("incompleteFits");
  });

  it("returns typed unranked failures when every fitter throws", async () => {
    const fit = vi.fn(async () => { throw new TypeError("bad optimizer state"); });
    const result = await createRateModelComparator({ fit, resolveModel: getRateModel })(data, [
      "tian-characteristic-time",
      "rational-characteristic-time",
    ]);

    expect(result.criterion).toBeNull();
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.convergence === "failed"
      && row.failureCode === "optimizer-error"
      && row.parameters === null
      && row.statistics === null
      && row.rank === null)).toBe(true);
  });

  it("preserves shared cancellation when rejected fitters observe an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const fit = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); });
    const result = await createRateModelComparator({ fit, resolveModel: getRateModel })(data, [
      "tian-characteristic-time",
      "rational-characteristic-time",
    ], { signal: controller.signal });

    expect(result.rows.every((row) => row.failureCode === "cancelled")).toBe(true);
  });

  it("uses tolerant competition ranking for exact and near criterion ties", async () => {
    const thirdModel = { ...getRateModel("tian-characteristic-time")!, id: "third-validated-model" };
    const models = new Map([
      ["tian-characteristic-time", getRateModel("tian-characteristic-time")!],
      ["rational-characteristic-time", getRateModel("rational-characteristic-time")!],
      [thirdModel.id, thirdModel],
    ]);
    const scores = new Map([
      ["tian-characteristic-time", 10],
      ["rational-characteristic-time", 10 + 5e-10],
      [thirdModel.id, 13],
    ]);
    const fit = vi.fn(async (_points, options: { modelId: string }) => converged(options.modelId, {
      aic: scores.get(options.modelId),
      aicc: scores.get(options.modelId),
    }));
    const compare = createRateModelComparator({ fit, resolveModel: (id) => models.get(id) });
    const result = await compare(data, [
      "rational-characteristic-time",
      thirdModel.id,
      "tian-characteristic-time",
    ]);

    expect(result.rows.map(({ rank }) => rank)).toEqual([1, 1, 3]);
    expect(result.rows.slice(0, 2).map(({ modelId }) => modelId)).toEqual([
      "tian-characteristic-time",
      "rational-characteristic-time",
    ]);
    expect(result.recommendation).toBeNull();
    expect(result.recommendationReason).toBe("insufficientEvidence");

    scores.set("rational-characteristic-time", 10);
    const exact = await compare(data, [
      "rational-characteristic-time",
      thirdModel.id,
      "tian-characteristic-time",
    ]);
    expect(exact.rows.map(({ rank }) => rank)).toEqual([1, 1, 3]);
    expect(exact.recommendation).toBeNull();
  });

  it("serializes comparison statistics and observation-aligned residuals without inventing failed values", async () => {
    const fit = vi.fn(async (_points, options: { modelId: string }) => options.modelId.startsWith("tian")
      ? converged(options.modelId, { aic: 5, aicc: 29 })
      : failed(options.modelId));
    const result = await createRateModelComparator({ fit, resolveModel: getRateModel })(data, [
      "tian-characteristic-time",
      "rational-characteristic-time",
    ]);
    const metadata = {
      modelId: "model-comparison",
      rateDefinition: "measured discharge rate",
      originalRateUnits: "C-rate|mA-g-1",
      originalCapacityUnits: "mAh-g-1",
      analysisRateUnit: "h-1",
      analysisCapacityUnit: "mAh-g-1",
      normalizationBasis: "active material",
      settings: { criterion: "AICc", weighting: "unweighted", usedPointCount: 6 },
    } as const;
    const comparison = serializeModelComparisonCsv(result, metadata);
    const residuals = serializeModelComparisonResidualsCsv(data, result, metadata);

    expect(comparison.split("\r\n")[0]).toBe("model_id,equation_type,parameters,parameter_count,r_squared,adjusted_r_squared,rmse,aic,aicc,bic,criterion,delta_criterion,convergence,rank,failure_code,rate_definition,original_rate_units,original_capacity_units,analysis_rate_unit,analysis_capacity_unit,normalization_basis,settings");
    expect(comparison).toContain("Q_M=310 [mAh-g-1];tau=0.8 [h];n=0.62 [dimensionless]");
    expect(comparison).toContain("rational-characteristic-time,characteristic time,,3,,,,,,,");
    expect(comparison).toContain("measured discharge rate,C-rate|mA-g-1,mAh-g-1,h-1,mAh-g-1,active material,criterion=AICc;usedPointCount=6;weighting=unweighted");
    expect(comparison).not.toContain("NaN");
    expect(residuals.split("\r\n")).toHaveLength(data.length + 1);
    expect(residuals.split("\r\n")[0]).toBe("model_id,criterion,rate,observed_capacity,predicted_capacity,residual,rate_unit,capacity_unit,rate_definition,original_rate_units,original_capacity_units,analysis_rate_unit,analysis_capacity_unit,normalization_basis,settings");
    expect(residuals).toContain("tian-characteristic-time,AICc,0.1,300,298,2,h-1,mAh-g-1,measured discharge rate,C-rate|mA-g-1,mAh-g-1,h-1,mAh-g-1,active material,criterion=AICc;usedPointCount=6;weighting=unweighted");
    expect(residuals).not.toContain("rational-characteristic-time");
  });
});

async function render(element: React.ReactNode, language: "en" | "zh" = "en") {
  localStorage.setItem("tmcc-language", language);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<I18nProvider><SiteHeader />{element}</I18nProvider>));
  return container;
}

function button(view: HTMLElement, label: string) {
  const match = [...view.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

async function click(target: Element) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("ModelComparisonPage", () => {
  it("reuses input/normalization, compares validated models, and renders complete ranked diagnostics", async () => {
    fitRatePerformance.mockImplementation(async (_points, options: { modelId: string }) => options.modelId.startsWith("tian")
      ? converged(options.modelId, { aic: 4, aicc: 28, bic: 4.4 })
      : converged(options.modelId, { aic: 7, aicc: 31, bic: 7.4 }));
    const view = await render(<ModelComparisonPage />);

    expect(view.textContent).toContain("Data Input");
    expect(view.querySelectorAll<HTMLInputElement>('.rate-model-selection input[type="checkbox"]:not(:disabled)')).toHaveLength(2);
    expect(view.querySelectorAll<HTMLInputElement>('.rate-model-selection input[type="checkbox"]:disabled').length).toBeGreaterThan(0);
    await click(button(view, "Load example"));
    await click(button(view, "Compare Models"));

    expect(fitRatePerformance).toHaveBeenCalledTimes(2);
    expect(view.textContent).toContain("Comparison Results");
    for (const heading of ["Model", "Equation type", "Parameters", "Count", "R²", "Adjusted R²", "RMSE", "AIC", "AICc", "BIC", "ΔAICc", "Convergence", "Rank"]) {
      expect(view.textContent).toContain(heading);
    }
    expect(view.textContent).toContain("Recommended model");
    expect(view.querySelectorAll('.rate-comparison-curve-toggles input[type="checkbox"]')).toHaveLength(2);
    await click(button(view, "Residual comparison"));
    expect(view.querySelectorAll('[data-point-series-id^="comparison-residual-"]')).toHaveLength(12);
    for (const label of ["Original data", "Processed data", "Comparison table", "Residuals CSV", "Export SVG", "Export PNG"]) {
      expect(button(view, label)).toBeTruthy();
    }
  });

  it("cancels and ignores stale comparisons when the input changes", async () => {
    const pending = deferred<RateFitResult>();
    fitRatePerformance.mockReturnValue(pending.promise);
    const view = await render(<ModelComparisonPage />);
    await click(button(view, "Load example"));
    await click(button(view, "Compare Models"));

    const signals = fitRatePerformance.mock.calls.map((call) => call[1].signal as AbortSignal);
    expect(view.textContent).toContain("Comparison in progress");
    await click(button(view, "Cancel Comparison"));
    expect(signals.every(({ aborted }) => aborted)).toBe(true);
    expect(view.textContent).toContain("Comparison cancelled");

    pending.resolve(converged("tian-characteristic-time"));
    await act(async () => { await pending.promise; await Promise.resolve(); });
    expect(view.querySelector(".rate-comparison-results")).toBeNull();
  });

  it("keeps failed model rows numeric-free and translates their failure reason", async () => {
    fitRatePerformance.mockImplementation(async (_points, options: { modelId: string }) => options.modelId.startsWith("tian")
      ? converged(options.modelId)
      : failed(options.modelId));
    const view = await render(<ModelComparisonPage />);
    await click(button(view, "Load example"));
    await click(button(view, "Compare Models"));

    const failedRow = [...view.querySelectorAll(".rate-comparison-table tbody tr")]
      .find((row) => row.textContent?.includes("Rational characteristic-time rate model"));
    expect(failedRow?.textContent).toContain("maximum iteration limit");
    expect(failedRow?.textContent).not.toContain("maximum-iterations");
    expect(failedRow?.textContent).not.toContain("NaN");
    expect(view.querySelector(".rate-fit-status-partial")).not.toBeNull();
    expect(view.textContent).toContain("Partial results");
    expect(view.textContent).not.toContain("Comparison completed");
  });

  it("uses pressed buttons instead of incomplete tabs for chart selection", async () => {
    fitRatePerformance.mockImplementation(async (_points, options: { modelId: string }) => converged(options.modelId));
    const view = await render(<ModelComparisonPage />);
    await click(button(view, "Load example"));
    await click(button(view, "Compare Models"));

    const capacity = button(view, "Capacity comparison");
    const residuals = button(view, "Residual comparison");
    expect(view.querySelector('[role="tablist"], [role="tab"]')).toBeNull();
    expect(capacity.getAttribute("aria-pressed")).toBe("true");
    expect(residuals.getAttribute("aria-pressed")).toBe("false");
    await click(residuals);
    expect(capacity.getAttribute("aria-pressed")).toBe("false");
    expect(residuals.getAttribute("aria-pressed")).toBe("true");
  });

  it("switches comparison workflow copy to typed Chinese resources", async () => {
    const view = await render(<ModelComparisonPage />, "zh");
    for (const text of ["模型比较", "数据输入", "选择经验证的模型", "比较模型"]) expect(view.textContent).toContain(text);
    expect(view.textContent).not.toContain("rate.modelComparison.");
  });
});

describe("ModelComparisonResults display sampling", () => {
  it("samples observed and each residual display series to 2,000 while reporting raw/display counts", async () => {
    const normalized: NormalizedRatePoint[] = Array.from({ length: 2_501 }, (_, index) => ({
      id: `large-${index}`,
      analysisRate: index + 1,
      analysisRateUnit: "h-1",
      analysisCapacity: 300 - index / 20,
      analysisCapacityUnit: "mAh-g-1",
      originalRate: index + 1,
      originalRateUnit: "h-1",
      originalCapacity: 300 - index / 20,
      originalCapacityUnit: "mAh-g-1",
      normalization: { method: "measured-rate-direct", measuredRateConfirmed: true },
    }));
    const fitData = normalized.map(({ analysisRate: rate, analysisCapacity: capacity }) => ({ rate, capacity }));
    const result = await createRateModelComparator({
      resolveModel: getRateModel,
      fit: async (_points, options) => ({
        ...converged(options.modelId),
        predictions: normalized.map(({ analysisCapacity }) => analysisCapacity - 1),
        residuals: normalized.map(() => 1),
        usedPointCount: normalized.length,
      }),
    })(fitData, ["tian-characteristic-time", "rational-characteristic-time"]);
    const input = {
      mode: "manual" as const,
      points: normalized.map((point) => ({
        id: point.id, rate: point.originalRate, rateUnit: point.originalRateUnit,
        capacity: point.originalCapacity, capacityUnit: point.originalCapacityUnit,
      })),
      normalizationContext: { confirmHInverseMeasuredRate: true },
    };

    const view = await render(<ComparisonResultsHarness input={input} normalized={normalized} result={result} />);
    expect(view.querySelectorAll('[data-point-series-id="comparison-observed"]')).toHaveLength(2_000);
    expect(view.textContent).toContain("Displaying 2,000 of 2,501 points per observed or residual series");
    await click(button(view, "Residual comparison"));
    expect(view.querySelectorAll('[data-point-series-id="comparison-residual-tian-characteristic-time"]')).toHaveLength(2_000);
    expect(view.querySelectorAll('[data-point-series-id="comparison-residual-rational-characteristic-time"]')).toHaveLength(2_000);
  });
});

function ComparisonResultsHarness({ input, normalized, result }: {
  input: Parameters<typeof ModelComparisonResults>[0]["input"];
  normalized: Parameters<typeof ModelComparisonResults>[0]["normalized"];
  result: Parameters<typeof ModelComparisonResults>[0]["result"];
}) {
  const [chart, setChart] = useState<ComparisonChart>("capacity");
  return <ModelComparisonResults input={input} normalized={normalized} result={result} chart={chart}
    onChartChange={setChart} visibleModels={result.rows.map(({ modelId }) => modelId)}
    onToggleModel={() => undefined} onExportError={() => undefined} />;
}

describe("EmpiricalModelsPage", () => {
  it("renders registry-driven validated and pending cards without executable pending claims", async () => {
    const view = await render(<EmpiricalModelsPage />);
    const cards = view.querySelectorAll(".rate-model-card");
    expect(cards).toHaveLength(7);
    expect(view.querySelectorAll(".rate-model-card-validated")).toHaveLength(2);
    expect(view.querySelectorAll(".rate-model-card-pending-validation")).toHaveLength(5);
    expect(view.querySelectorAll(".rate-model-card-validated .rate-model-card-actions a")).toHaveLength(4);
    expect(view.querySelectorAll(".rate-model-card-pending-validation a, .rate-model-card-pending-validation button")).toHaveLength(0);
    for (const label of ["Equation", "Parameters", "Required input", "Useful regime", "Assumptions", "Limitations", "Primary reference"]) {
      expect(view.textContent).toContain(label);
    }
    const validatedCard = view.querySelector(".rate-model-card-validated")!;
    expect(validatedCard.textContent).toContain("Capacity approached in the low-rate limit.");
    expect(validatedCard.textContent).toContain("Fitted");
    expect(validatedCard.textContent).toContain("positive finite measured rate");
    expect(validatedCard.textContent).toContain("Positive measured-rate capacity data spanning the low-rate plateau");
    const primary = validatedCard.querySelector<HTMLAnchorElement>('a[href="https://doi.org/10.1038/s41467-019-09792-9"]');
    expect(validatedCard.textContent).toContain("Quantifying the factors limiting rate performance in battery electrodes");
    expect(primary?.textContent).toContain("10.1038/s41467-019-09792-9");
    expect(view.textContent).toContain("Scientific validation pending");
    expect(view.textContent).toContain("No executable equation is shown");
    expect(view.querySelector(".rate-model-card-pending-validation")?.textContent).not.toContain("Heubner et al.");
  });

  it("localizes the complete library in Chinese without exposing raw keys", async () => {
    const view = await render(<EmpiricalModelsPage />, "zh");
    for (const text of ["经验模型", "科学验证待定", "适用区间", "主引用", "使用此模型", "比较模型", "低倍率极限下趋近的容量", "正且有限的实测倍率", "拟合", "模型假设", "实测倍率（R，h^-1）"]) {
      expect(view.textContent).toContain(text);
    }
    expect(view.textContent).not.toContain("Capacity approached in the low-rate limit.");
    expect(view.textContent).not.toContain("rate.empiricalModels.");
  });
});
