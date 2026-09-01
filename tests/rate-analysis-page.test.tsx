import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { SiteHeader } from "../src/components/SiteHeader";
import type { RateFitResult } from "../src/tools/rate-performance/analysis/fitRatePerformance";
import RatePerformanceAnalysisPage from "../src/tools/rate-performance/pages/RatePerformanceAnalysisPage";

const { fitRatePerformance } = vi.hoisted(() => ({
  fitRatePerformance: vi.fn(),
}));

vi.mock("../src/tools/rate-performance/analysis/fitRatePerformance", () => ({
  fitRatePerformance,
  MAX_SYNC_RATE_FIT_POINTS: 20_000,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

beforeEach(() => {
  fitRatePerformance.mockReset();
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
});

async function renderPage(language: "en" | "zh" = "en") {
  localStorage.setItem("tmcc-language", language);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<I18nProvider><SiteHeader /><RatePerformanceAnalysisPage /></I18nProvider>));
  return container;
}

function button(view: HTMLElement, label: string) {
  const match = [...view.querySelectorAll("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
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

async function change(target: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype = target instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, value);
    target.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

const convergedResult: RateFitResult = {
  status: "converged",
  modelId: "tian-characteristic-time",
  parameters: { qM: 320, tau: 2, n: 0.5 },
  predictions: [300, 292, 280, 250, 205, 160],
  residuals: [2, 4, 4, 2, 6, 2],
  statistics: {
    sse: 76,
    rmse: 3.559026,
    rSquared: 0.9912,
    adjustedRSquared: 0.9824,
    aic: 21.2,
    aicc: 45.2,
    bic: 20.6,
  },
  uncertainty: {
    covariance: [[4, 0, 0], [0, 0.04, 0], [0, 0, 0.0025]],
    parameters: {
      qM: { standardError: 2, confidenceInterval95: { lower: 314.9, upper: 325.1 } },
      tau: { standardError: 0.2, confidenceInterval95: { lower: 1.49, upper: 2.51 } },
      n: { standardError: 0.05, confidenceInterval95: { lower: 0.371, upper: 0.629 } },
    },
    warnings: [],
  },
  iterations: 37,
  iterationCountExact: true,
  usedPointCount: 6,
  warnings: [],
};

describe("RatePerformanceAnalysisPage", () => {
  it("renders a complete understandable empty state without placeholder user parameters", async () => {
    const view = await renderPage();

    for (const heading of [
      "Data Input",
      "Example Dataset",
      "What You Will Get",
      "Example Results Preview",
      "Quick Explanation",
      "Model Equation",
      "Parameter Meaning",
      "References",
    ]) expect(view.textContent).toContain(heading);

    expect(button(view, "Try Example Dataset")).toBeTruthy();
    expect(view.textContent).toContain("EXAMPLE RESULTS");
    expect(view.querySelector(".rate-results-user")).toBeNull();
    expect(view.textContent).not.toContain("Q_M = --");
    expect(view.textContent).not.toContain("NaN");
  });

  it("blocks invalid input, then fits every normalized example point and renders results, charts, and exports", async () => {
    fitRatePerformance.mockResolvedValue(convergedResult);
    const view = await renderPage();

    await click(button(view, "Analyze Data"));
    expect(fitRatePerformance).not.toHaveBeenCalled();
    expect(view.textContent).toContain("Enter at least four complete data points");

    await click(button(view, "Try Example Dataset"));
    await change(view.querySelector<HTMLInputElement>('input[name="rate-rate-example-1"]')!, "25");
    await click(button(view, "Analyze Data"));

    expect(fitRatePerformance).toHaveBeenCalledTimes(1);
    const [points, options] = fitRatePerformance.mock.calls[0];
    expect(points).toHaveLength(6);
    expect(points[0]).toEqual({ rate: 25 / 302, capacity: 302 });
    expect(options).toMatchObject({ modelId: "tian-characteristic-time" });
    expect(options.signal).toBeInstanceOf(AbortSignal);

    expect(view.textContent).toContain("USER RESULTS");
    for (const label of ["τ", "n", "R²", "RMSE"]) {
      expect(view.querySelector(".rate-results-user")?.textContent).toContain(label);
    }
    for (const label of ["Q_M", "R_T"]) {
      expect(view.querySelector(`.rate-results-user [aria-label="${label}"]`)).not.toBeNull();
    }
    expect(view.querySelector(".rate-results-user")?.textContent).toContain("0.125");
    for (const label of ["Adjusted R²", "SSE", "AIC", "AICc", "BIC", "95% CI", "Standard error", "Iterations"]) {
      expect(view.textContent).toContain(label);
    }

    for (const tab of ["Capacity — linear", "Capacity — log rate", "log Q — log R", "Residuals"]) {
      expect(button(view, tab)).toBeTruthy();
    }
    expect(view.querySelectorAll('[data-point-series-id="rate-observed"]')).toHaveLength(6);
    expect(Number(view.querySelector('[data-series-id="rate-fit"]')?.getAttribute("data-render-point-count"))).toBeGreaterThan(50);

    await click(button(view, "Capacity — log rate"));
    expect(view.querySelector('svg[data-export-id="rate-analysis-chart"] title')?.textContent).toBe("Capacity vs rate (log x-axis)");
    await click(button(view, "log Q — log R"));
    expect(view.querySelector('svg[data-export-id="rate-analysis-chart"] title')?.textContent).toBe("Log capacity vs log rate");
    await click(button(view, "Residuals"));
    expect(view.querySelectorAll('[data-point-series-id="rate-residuals"]')).toHaveLength(6);

    const created: Blob[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => { created.push(blob); return `blob:rate-${created.length}`; }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    for (const label of ["Original data", "Processed data", "Fitted data", "Parameters", "Residuals CSV"]) {
      await click(button(view, label));
    }
    expect(created).toHaveLength(5);
    const exports = await Promise.all(created.map(readBlob));
    expect(exports[0].split("\r\n")[0]).toBe("point_id,rate,rate_unit,capacity,capacity_unit,model_id,rate_definition,original_rate_units,original_capacity_units,analysis_rate_unit,analysis_capacity_unit,normalization_basis,settings");
    expect(exports[1].split("\r\n")[0]).toBe("point_id,analysis_rate,analysis_rate_unit,analysis_capacity,analysis_capacity_unit,original_rate,original_rate_unit,original_capacity,original_capacity_unit,normalization_method,measured_rate_confirmed,theoretical_capacity,theoretical_capacity_unit,model_id,rate_definition,original_rate_units,original_capacity_units,analysis_rate_unit,analysis_capacity_unit,normalization_basis,settings");
    expect(exports[2].split("\r\n")[0]).toBe("rate,fitted_capacity,rate_unit,capacity_unit,model_id,rate_definition,original_rate_units,original_capacity_units,analysis_rate_unit,analysis_capacity_unit,normalization_basis,settings");
    expect(exports[3].split("\r\n")[0]).toBe("parameter,value,unit,parameter_type,standard_error,ci95_lower,ci95_upper,sse,rmse,r_squared,adjusted_r_squared,aic,aicc,bic,convergence_status,iterations,iteration_count_exact,warnings,model_id,rate_definition,original_rate_units,original_capacity_units,analysis_rate_unit,analysis_capacity_unit,normalization_basis,settings");
    expect(exports[4].split("\r\n")[0]).toBe("rate,observed_capacity,predicted_capacity,residual,rate_unit,capacity_unit,model_id,rate_definition,original_rate_units,original_capacity_units,analysis_rate_unit,analysis_capacity_unit,normalization_basis,settings");
    expect(exports[2].split("\r\n")).toHaveLength(162);
    expect(exports[4].split("\r\n")).toHaveLength(7);
    expect(exports[2]).not.toBe(exports[4]);
    expect(exports[3]).toContain("Q_M,320,mAh g^-1,fitted,2,314.9,325.1");
    expect(exports[3]).toContain("R_T,0.12500000000000003,h^-1,derived");
    expect(exports[3]).toContain(",76,3.559026,0.9912,0.9824,21.2,45.2,20.6,converged,37,true,");
    const uncertaintyTable = view.querySelector(".rate-analysis-advanced table")!;
    for (const unit of ["mAh g⁻¹", "h", "dimensionless"]) expect(uncertaintyTable.textContent).toContain(unit);
    expect(button(view, "Export SVG")).toBeTruthy();
    expect(button(view, "Export PNG")).toBeTruthy();
  });

  it("reports failed fits explicitly and never renders failed user parameters", async () => {
    fitRatePerformance.mockResolvedValue({
      status: "failed",
      modelId: "tian-characteristic-time",
      failure: { code: "maximum-iterations", message: "budget exhausted" },
      iterations: 240,
      iterationCountExact: true,
      warnings: [],
    } satisfies RateFitResult);
    const view = await renderPage();

    await click(button(view, "Try Example Dataset"));
    await click(button(view, "Analyze Data"));

    expect(view.textContent).toContain("Fit failed");
    expect(view.textContent).toContain("maximum iteration limit");
    expect(view.querySelector(".rate-results-user")).toBeNull();
    expect(view.querySelector(".rate-export-toolbar")).toBeNull();
  });

  it("cancels a pending fit explicitly without displaying parameters", async () => {
    const pending = deferred<RateFitResult>();
    fitRatePerformance.mockReturnValue(pending.promise);
    const view = await renderPage();
    await click(button(view, "Try Example Dataset"));
    await click(button(view, "Analyze Data"));

    const signal = fitRatePerformance.mock.calls[0][1].signal as AbortSignal;
    expect(view.textContent).toContain("Fitting in progress");
    await click(button(view, "Cancel Fit"));

    expect(signal.aborted).toBe(true);
    expect(view.textContent).toContain("Fit cancelled");
    expect(view.querySelector(".rate-results-user")).toBeNull();
  });

  it("aborts and ignores a stale fit when the input changes", async () => {
    const older = deferred<RateFitResult>();
    fitRatePerformance.mockReturnValueOnce(older.promise).mockResolvedValueOnce(convergedResult);
    const view = await renderPage();
    await click(button(view, "Try Example Dataset"));
    await click(button(view, "Analyze Data"));
    const oldSignal = fitRatePerformance.mock.calls[0][1].signal as AbortSignal;

    await change(view.querySelector<HTMLInputElement>('input[name="capacity-rate-example-1"]')!, "301");
    expect(oldSignal.aborted).toBe(true);
    older.resolve(convergedResult);
    await act(async () => { await older.promise; await Promise.resolve(); });
    expect(view.querySelector(".rate-results-user")).toBeNull();

    await click(button(view, "Analyze Data"));
    expect(fitRatePerformance).toHaveBeenCalledTimes(2);
    expect(view.textContent).toContain("USER RESULTS");
  });

  it("does not fit when normalization units are not confirmed", async () => {
    const view = await renderPage();
    await click(button(view, "Try Example Dataset"));
    await change(view.querySelector<HTMLSelectElement>('[aria-label="Rate unit"]')!, "h-1");
    await click(button(view, "Analyze Data"));

    expect(fitRatePerformance).not.toHaveBeenCalled();
    expect(view.textContent).toContain("Confirm that h⁻¹ values use the measured-discharge-time rate definition");
  });

  it("aborts stale fits when the unit or input mode changes", async () => {
    const first = deferred<RateFitResult>();
    const second = deferred<RateFitResult>();
    fitRatePerformance.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = await renderPage();
    await click(button(view, "Try Example Dataset"));
    await click(button(view, "Analyze Data"));
    const unitSignal = fitRatePerformance.mock.calls[0][1].signal as AbortSignal;
    await change(view.querySelector<HTMLSelectElement>('[aria-label="Rate unit"]')!, "A-g-1");
    expect(unitSignal.aborted).toBe(true);

    await click(button(view, "Analyze Data"));
    const modeSignal = fitRatePerformance.mock.calls[1][1].signal as AbortSignal;
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    expect(modeSignal.aborted).toBe(true);

    first.resolve(convergedResult);
    second.resolve(convergedResult);
    await act(async () => { await Promise.all([first.promise, second.promise]); });
    expect(view.querySelector(".rate-results-user")).toBeNull();
  });

  it("reports a rejected fit promise and aborts a pending fit on unmount", async () => {
    fitRatePerformance.mockRejectedValueOnce(new Error("worker failed"));
    const view = await renderPage();
    await click(button(view, "Try Example Dataset"));
    await click(button(view, "Analyze Data"));
    expect(view.textContent).toContain("unexpected fitting error");
    expect(view.querySelector(".rate-results-user")).toBeNull();

    const pending = deferred<RateFitResult>();
    fitRatePerformance.mockReturnValueOnce(pending.promise);
    await click(button(view, "Analyze Data"));
    const signal = fitRatePerformance.mock.calls.at(-1)?.[1].signal as AbortSignal;
    const root = roots.pop()!;
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    pending.resolve(convergedResult);
    await act(async () => { await pending.promise; });
  });

  it("blocks oversized synchronous fits explicitly without discarding imported data", async () => {
    const view = await renderPage();
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await click(view.querySelector<HTMLInputElement>('[aria-label="Confirm measured-rate definition"]')!);
    const fileInput = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    const rows = ["rate,capacity", ...Array.from({ length: 20_001 }, (_, index) => `${index + 1},100`)].join("\n");
    const file = new File([rows], "large.csv", { type: "text/csv" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(view.textContent).toContain("Rows20001");
    await click(button(view, "Analyze Data"));

    expect(fitRatePerformance).not.toHaveBeenCalled();
    expect(view.textContent).toContain("20,000");
    expect(view.textContent).toMatch(/select or filter/i);
    expect(view.textContent).toContain("Rows20001");
  }, 30_000);

  it("switches all primary workflow copy and result labels between English and Chinese", async () => {
    fitRatePerformance.mockResolvedValue(convergedResult);
    const view = await renderPage();
    await click(button(view, "中文"));

    for (const text of ["数据输入", "示例数据集", "您将获得", "示例结果预览", "快速说明", "模型方程", "参数含义"]) {
      expect(view.textContent).toContain(text);
    }
    await click(button(view, "试用示例数据集"));
    await click(button(view, "分析数据"));
    for (const text of ["用户结果", "高级统计", "残差"]) expect(view.textContent).toContain(text);
    expect(view.textContent).not.toContain("rate.analysis.");
  });
});
