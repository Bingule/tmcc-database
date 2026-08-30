import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider";
import type { RateFitResult } from "../src/tools/rate-performance/analysis/fitRatePerformance";
import { reconstructCaRate } from "../src/tools/rate-performance/analysis/reconstructCaRate";
import { serializeCaFailureCsv, serializeCaFitCurveCsv, serializeCaFitParametersCsv, serializeCaOriginalCsv, serializeCaRateCsv, serializeCaReconstructedCsv } from "../src/tools/rate-performance/utils/caExports";
import CaRateAnalysisPage from "../src/tools/rate-performance/pages/CaRateAnalysisPage";
import { CaFileImport } from "../src/tools/rate-performance/components/CaDataInput";

const { fitRatePerformance } = vi.hoisted(() => ({ fitRatePerformance: vi.fn() }));
vi.mock("../src/tools/rate-performance/analysis/fitRatePerformance", async (original) => ({
  ...await original<typeof import("../src/tools/rate-performance/analysis/fitRatePerformance")>(),
  fitRatePerformance,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

beforeEach(() => fitRatePerformance.mockReset());
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderPage(language: "en" | "zh" = "en") {
  localStorage.setItem("tmcc-language", language);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<I18nProvider><CaRateAnalysisPage /></I18nProvider>));
  return container;
}

async function renderImport(parseFile: (file: File) => Promise<Array<{ name: string; rows: Array<Array<string | number | null>> }>>, onChange = vi.fn()) {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(<I18nProvider><CaFileImport onChange={onChange} parseFile={parseFile} /></I18nProvider>));
  return { container, onChange };
}

function button(view: HTMLElement, label: string) {
  const match = [...view.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

async function click(target: Element) {
  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve(); await Promise.resolve();
  });
}

const convergedResult: RateFitResult = {
  status: "converged", modelId: "rational-characteristic-time",
  parameters: { qM: 300, tau: 0.4, n: 0.7 },
  predictions: [1, 2, 3, 4], residuals: [0, 0, 0, 0],
  statistics: { sse: 0, rmse: 0, rSquared: 1, adjustedRSquared: 1, aic: -10, aicc: -5, bic: -9 },
  uncertainty: { covariance: null, parameters: {
    qM: { standardError: null, confidenceInterval95: null },
    tau: { standardError: null, confidenceInterval95: null },
    n: { standardError: null, confidenceInterval95: null },
  }, warnings: [] },
  iterations: 8, iterationCountExact: true, usedPointCount: 4, warnings: [],
};

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

  it("integrates from physical t=0 and applies an independent fit range without resetting capacity", () => {
    const result = reconstructCaRate([
      { id: "outside-before", time: 0, current: -4 },
      { id: "start", time: 1, current: -3 },
      { id: "end", time: 2, current: -3 },
      { id: "outside-after", time: 3, current: -4 },
    ], {
      timeUnit: "h", currentUnit: "mA", activeMassG: 1,
      sign: "negative",
      baseline: { mode: "constant", value: 1 },
      fitRange: { timeStart: 1, timeEnd: 2 },
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.capacity).toEqual([0, 2.5, 4.5, 7]);
    expect(result.ratePoints).toEqual([
      expect.objectContaining({ id: "start", rate: 0.8, capacity: 2.5 }),
      expect.objectContaining({ id: "end", rate: 2 / 4.5, capacity: 4.5 }),
    ]);
    expect(result.points[0]).toEqual(expect.objectContaining({ includedInFit: false, fitExclusionReason: "before-fit-time-range" }));
    expect(result.points[3]).toEqual(expect.objectContaining({ includedInFit: false, fitExclusionReason: "after-fit-time-range" }));
  });

  it("requires a physical zero-time origin before integrating Eq. 5", () => {
    const result = reconstructCaRate([{ id: "a", time: 1, current: 2 }, { id: "b", time: 2, current: 2 }], {
      timeUnit: "s", currentUnit: "mA", activeMassG: 1, sign: "positive", baseline: { mode: "off" },
    });
    expect(result).toEqual(expect.objectContaining({ status: "failure", code: "nonzero-start-time", pointIds: ["a"] }));
  });

  it("retains a processed reconstruction when no positive rate point exists", () => {
    const result = reconstructCaRate([
      { id: "a", time: 0, current: 0 },
      { id: "b", time: 1, current: 0 },
    ], {
      timeUnit: "h", currentUnit: "mA", activeMassG: 1,
      sign: "positive", baseline: { mode: "off" },
    });

    expect(result).toEqual(expect.objectContaining({ status: "success", ratePoints: [] }));
    if (result.status === "success") expect(result.points).toHaveLength(2);
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

  it("exports raw and reconstructed data with processing provenance and formula-safe IDs", () => {
    const input = [
      { id: "=unsafe", time: 0, current: 2 },
      { id: "safe", time: 1, current: 2 },
    ];
    const options = {
      timeUnit: "h" as const, currentUnit: "mA" as const, activeMassG: 1,
      sign: "positive" as const, baseline: { mode: "off" as const },
    };
    const result = reconstructCaRate(input, options);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    const metadata = { resultKind: "example" as const, exampleId: "ca-rate-example" };
    const originalCsv = serializeCaOriginalCsv(input, options, metadata);
    const reconstructedCsv = serializeCaReconstructedCsv(result, metadata);

    expect(originalCsv).toContain("'=unsafe");
    expect(originalCsv).toContain("result_kind,example_id");
    expect(originalCsv).toContain("example,ca-rate-example");
    expect(serializeCaOriginalCsv([{ id: "partial", time: 1, current: null }], options, metadata)).toContain("invalid,missing-current");
    expect(reconstructedCsv).toContain("integration_method,smoothing,effective_rate_definition");
    expect(reconstructedCsv).toContain("trapezoidal,off,specific-current-over-accumulated-specific-capacity");
    expect(reconstructedCsv).toContain("zero-accumulated-capacity");
    expect(reconstructedCsv).toContain("included_in_fit,fit_exclusion_reason");
  });

  it("exports fitted curves and parameters with model and source provenance", () => {
    const metadata = { resultKind: "example" as const, exampleId: "ca-rate-example" };
    const reconstruction = reconstructCaRate([{ id: "a", time: 0, current: 2 }, { id: "b", time: 1, current: 2 }], { timeUnit: "h", currentUnit: "mA", activeMassG: 1, sign: "positive", baseline: { mode: "off" } });
    expect(reconstruction.status).toBe("success"); if (reconstruction.status !== "success") return;
    const curve = serializeCaFitCurveCsv([{ x: 1, y: 2 }], reconstruction, convergedResult as Extract<RateFitResult, { status: "converged" }>, metadata);
    const parameters = serializeCaFitParametersCsv(convergedResult as Extract<RateFitResult, { status: "converged" }>, reconstruction, metadata);
    expect(curve).toContain("rational-characteristic-time,converged,4"); expect(curve).toContain(",example,ca-rate-example");
    expect(curve).toContain("active_mass_g"); expect(curve).toContain("physical-zero-time");
    expect(parameters).toContain("used_point_count"); expect(parameters).toContain(",4,");
    expect(curve).toContain("source_file_name"); expect(parameters).toContain("dataset_id");
    expect(serializeCaRateCsv(reconstruction, { modelId: "rational-characteristic-time", status: "not-run", attemptedPointCount: 0 }, metadata)).toContain("rational-characteristic-time,not-run,,0,0");
    expect(serializeCaRateCsv(reconstruction, { modelId: "rational-characteristic-time", status: "converged", attemptedPointCount: 4, usedPointCount: 4 }, metadata)).toContain("rational-characteristic-time,converged,,4,4");
  });

  it("exports failed and cancelled optimizer attempt provenance", () => {
    const reconstruction = reconstructCaRate([{ id: "a", time: 0, current: 4 }, { id: "b", time: 1, current: 3 }], { timeUnit: "h", currentUnit: "mA", activeMassG: 1, sign: "positive", baseline: { mode: "off" } });
    expect(reconstruction.status).toBe("success"); if (reconstruction.status !== "success") return;
    const metadata = { resultKind: "user" as const, exampleId: null };
    const failed = serializeCaRateCsv(reconstruction, { modelId: "rational-characteristic-time", status: "failed", failureCode: "maximum-iterations", attemptedPointCount: 8 }, metadata);
    const cancelled = serializeCaRateCsv(reconstruction, { modelId: "rational-characteristic-time", status: "cancelled", failureCode: "cancelled", attemptedPointCount: 8 }, metadata);
    expect(failed).toContain("fit_failure_code,attempted_point_count,used_point_count");
    expect(failed).toContain("rational-characteristic-time,failed,maximum-iterations,8,0");
    expect(cancelled).toContain("rational-characteristic-time,cancelled,cancelled,8,0");
  });

  it("exports fatal reconstruction failures with conflicting source rows", () => {
    const points = [{ id: "a", time: 0, current: 1, source: { kind: "upload" as const, fileName: "x.csv", sheetName: "S", headerMode: "header" as const, hasHeader: true, fileRowNumber: 2 } }, { id: "b", time: 0, current: 2, source: { kind: "upload" as const, fileName: "x.csv", sheetName: "S", headerMode: "header" as const, hasHeader: true, fileRowNumber: 3 } }];
    const options = { timeUnit: "s" as const, currentUnit: "mA" as const, activeMassG: 1, sign: "positive" as const, baseline: { mode: "off" as const } };
    const failure = reconstructCaRate(points, options); expect(failure.status).toBe("failure"); if (failure.status !== "failure") return;
    const csv = serializeCaFailureCsv(failure, points, options, { resultKind: "user", exampleId: null });
    expect(csv).toContain("duplicate-time"); expect(csv).toContain("x.csv,S,header,true,2"); expect(csv).toContain("x.csv,S,header,true,3");
    const summary = serializeCaFailureCsv({ status: "failure", code: "insufficient-points", pointIds: [] }, [], options, { resultKind: "user", exampleId: null });
    expect(summary.split("\r\n")).toHaveLength(2); expect(summary).toContain("insufficient-points"); expect(summary).toContain("physical-zero-time");
  });
});

describe("CaRateAnalysisPage", () => {
  it("explains the CA workflow and theory before user analysis", async () => {
    const view = await renderPage();
    for (const text of ["Data Input", "Example Dataset", "What You Will Get", "I(t)", "Q(t)", "effective rate", "Model and Theory", "References"]) {
      expect(view.textContent).toContain(text);
    }
    expect(view.textContent).toContain("EXAMPLE RESULTS");
    expect(view.textContent).not.toContain("Q_M = --");
  });

  it("loads the shared example, reconstructs all points, fits the rational model, and renders five charts plus exports", async () => {
    fitRatePerformance.mockResolvedValue(convergedResult);
    const view = await renderPage();
    await click(button(view, "Load Example"));
    await click(button(view, "Reconstruct & Fit"));

    expect(fitRatePerformance).toHaveBeenCalledTimes(1);
    const [points, options] = fitRatePerformance.mock.calls[0];
    expect(points.length).toBeGreaterThanOrEqual(4);
    expect(options).toMatchObject({ modelId: "rational-characteristic-time" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(view.textContent).toContain("EXAMPLE RESULTS");
    for (const title of ["Current vs time", "Capacity vs time", "Effective rate vs time", "Capacity vs rate", "Rate-model fit"]) {
      expect(view.querySelector(`svg title`)?.ownerDocument?.body.textContent).toContain(title);
    }
    expect(view.querySelectorAll(".rate-chart-panel")).toHaveLength(5);
    for (const label of ["Original CA data", "Reconstructed Q-R data", "Fitted curve", "Fit parameters"]) {
      expect(button(view, label)).toBeTruthy();
    }
  });

  it("keeps the manual table bounded, supports two-column paste, and exposes processing controls", async () => {
    const view = await renderPage();
    expect(view.querySelector(".ca-manual-table-scroll")).toBeTruthy();
    expect(view.querySelectorAll(".ca-manual-table tbody tr")).toHaveLength(5);
    for (const label of ["Time unit", "Current unit", "Active mass", "Current sign", "Baseline correction", "Fit time start", "Fit time end", "Smoothing (off)"]) {
      expect(view.textContent).toContain(label);
    }
    const table = view.querySelector(".ca-manual-table")!;
    await act(async () => {
      const event = new Event("paste", { bubbles: true });
      Object.defineProperty(event, "clipboardData", { value: { getData: () => "0\t1\n1\t2" } });
      table.dispatchEvent(event);
    });
    expect(view.querySelectorAll(".ca-manual-table tbody tr")).toHaveLength(2);
    expect(button(view, "Add Row")).toBeTruthy();
    expect(button(view, "Delete Row")).toBeTruthy();
    expect(button(view, "Clear")).toBeTruthy();
  });

  it("aborts a pending fit on input change and ignores stale completion", async () => {
    let resolve!: (value: RateFitResult) => void;
    fitRatePerformance.mockReturnValue(new Promise<RateFitResult>((next) => { resolve = next; }));
    const view = await renderPage();
    await click(button(view, "Load Example"));
    await click(button(view, "Reconstruct & Fit"));
    const signal = fitRatePerformance.mock.calls[0][1].signal as AbortSignal;
    const input = view.querySelector<HTMLInputElement>('input[name="ca-current-ca-rate-example-2"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "9");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(signal.aborted).toBe(true);
    resolve(convergedResult);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(view.querySelector(".rate-results-user")).toBeNull();
  });

  it("switches the CA workflow to Chinese without leaking translation keys", async () => {
    const view = await renderPage("zh");
    for (const text of ["数据输入", "示例数据集", "重建并拟合", "电流-时间", "模型与理论", "参考文献"]) {
      expect(view.textContent).toContain(text);
    }
    expect(view.textContent).not.toContain("rate.ca.");
  });

  it("imports CSV with detected mapping and reports validation counts and ranges", async () => {
    const view = await renderPage();
    const radios = view.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    await click(radios[1]);
    const fileInput = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["time,current\n0,3\n1,2\n2,\n3,bad"], "trace.csv", { type: "text/csv" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    for (const text of ["Detected columns", "time, current", "Rows4", "Valid points2", "Invalid points2", "Missing values1", "Time range0 – 1", "Current range2 – 3"]) {
      expect(view.textContent).toContain(text);
    }
    await click(button(view, "Reconstruct & Fit"));
    expect(fitRatePerformance).not.toHaveBeenCalled();
    expect(view.textContent).toContain("Complete or remove invalid rows");
  });

  it("reports fit failure and aborts a pending fit on unmount", async () => {
    fitRatePerformance.mockResolvedValueOnce({
      status: "failed", modelId: "rational-characteristic-time",
      failure: { code: "maximum-iterations", message: "budget" },
      iterations: 200, iterationCountExact: true, warnings: [],
    } satisfies RateFitResult);
    const view = await renderPage();
    await click(button(view, "Load Example"));
    await click(button(view, "Reconstruct & Fit"));
    expect(view.textContent).toContain("fit failed");
    expect(view.querySelector(".rate-results-user")).toBeNull();

    let resolve!: (value: RateFitResult) => void;
    fitRatePerformance.mockReturnValueOnce(new Promise((next) => { resolve = next; }));
    await click(button(view, "Reconstruct & Fit"));
    const signal = fitRatePerformance.mock.calls.at(-1)?.[1].signal as AbortSignal;
    const root = roots.pop()!;
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    resolve(convergedResult);
    await act(async () => { await Promise.resolve(); });
  });

  it("rejects more than 20,000 reconstructed fit points without discarding the uploaded trace", async () => {
    const view = await renderPage();
    await click(view.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]);
    const rows = ["time,current", ...Array.from({ length: 20_002 }, (_, index) => `${index},1`)].join("\n");
    const fileInput = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { configurable: true, value: [new File([rows], "large.csv", { type: "text/csv" })] });
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(view.textContent).toContain("Rows20002");
    await click(button(view, "Reconstruct & Fit"));
    expect(fitRatePerformance).not.toHaveBeenCalled();
    expect(view.textContent).toContain("20,000");
    expect(view.textContent).toContain("Rows20002");
    expect(view.querySelectorAll('[data-point-series-id="ca-rate-capacity"]').length).toBeLessThanOrEqual(1200);
  }, 30_000);

  it("blocks partially populated rows instead of silently dropping them", async () => {
    const view = await renderPage();
    await click(button(view, "Load Example"));
    const current = view.querySelector<HTMLInputElement>('input[name="ca-current-ca-rate-example-2"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(current, "");
      current.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(button(view, "Reconstruct & Fit"));
    expect(fitRatePerformance).not.toHaveBeenCalled();
    expect(view.textContent).toContain("Complete or remove invalid rows");
    expect(view.textContent).toContain("ca-rate-example-2");
    expect(button(view, "Export CA Error CSV")).toBeTruthy();
  });

  it("keeps processed charts and exports when reconstruction has zero fit points", async () => {
    const view = await renderPage();
    await click(button(view, "Load Example"));
    const currents = [...view.querySelectorAll<HTMLInputElement>('input[name^="ca-current-"]')];
    await act(async () => currents.forEach((current) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(current, "0");
      current.dispatchEvent(new Event("change", { bubbles: true }));
    }));
    await click(button(view, "Reconstruct & Fit"));
    expect(fitRatePerformance).not.toHaveBeenCalled();
    expect(view.querySelectorAll(".rate-chart-panel")).toHaveLength(4);
    expect(button(view, "Original CA data")).toBeTruthy();
    expect(button(view, "Full processed CA data")).toBeTruthy();
    expect(view.querySelector(".rate-results-user")).toBeNull();
  });

  it("clears an earlier upload when a newer file fails and ignores an older late completion", async () => {
    let resolveOld!: (value: Array<{ name: string; rows: Array<Array<string | number>> }>) => void;
    const old = new Promise<Array<{ name: string; rows: Array<Array<string | number>> }>>((resolve) => { resolveOld = resolve; });
    const parseFile = vi.fn()
      .mockResolvedValueOnce([{ name: "A", rows: [["time", "current"], [0, 1], [1, 1]] }])
      .mockRejectedValueOnce(new Error("bad B"))
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce([{ name: "new", rows: [["time", "current"], [0, 4], [1, 4]] }]);
    const { container, onChange } = await renderImport(parseFile);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    async function upload(name: string) {
      Object.defineProperty(input, "files", { configurable: true, value: [new File([name], name)] });
      await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
    }
    await upload("A.csv"); expect(container.textContent).toContain("A.csv");
    await upload("B.csv"); expect(container.textContent).not.toContain("A.csv"); expect(onChange).toHaveBeenLastCalledWith([]);
    await upload("old.csv");
    await upload("new.csv");
    resolveOld([{ name: "old", rows: [["time", "current"], [0, 9], [1, 9]] }]);
    await act(async () => { await old; await Promise.resolve(); });
    expect(container.textContent).toContain("new.csv"); expect(container.textContent).not.toContain("old.csv");
  });

  it("preserves workbook sheet, header decision and physical file row numbers", async () => {
    const { container, onChange } = await renderImport(async () => [
      { name: "first", rows: [["time", "current"], [0, 1]] },
      { name: "second", rows: [[0, 2], [1, 1]] },
    ]);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "book.xlsx")] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
    const sheet = [...container.querySelectorAll("select")].find((select) => select.textContent?.includes("second"))!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(sheet, "1"); sheet.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ source: expect.objectContaining({ kind: "upload", fileName: "book.xlsx", sheetName: "second", headerMode: "auto", hasHeader: false, fileRowNumber: 1 }) }),
      expect.objectContaining({ source: expect.objectContaining({ fileRowNumber: 2 }) }),
    ]);
  });
});
