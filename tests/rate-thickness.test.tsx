import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "../src/components/SiteHeader";
import { I18nProvider } from "../src/i18n/I18nProvider";
import {
  fitThicknessScaling,
  normalizeThickness,
  type ThicknessScalingSample,
} from "../src/tools/rate-performance/analysis/thicknessScaling";
import type {
  RateFitConverged,
  RateFitResult,
} from "../src/tools/rate-performance/analysis/fitRatePerformance";
import ThicknessKineticsPage from "../src/tools/rate-performance/pages/ThicknessKineticsPage";
import { ThicknessScalingResults } from "../src/tools/rate-performance/components/ThicknessScalingResults";
import {
  serializeThicknessFitsCsv,
  serializeThicknessProvenanceCsv,
  serializeThicknessResidualsCsv,
  serializeThicknessSamplesCsv,
  serializeThicknessScalingCsv,
} from "../src/tools/rate-performance/utils/thicknessExports";

const { fitRatePerformance } = vi.hoisted(() => ({ fitRatePerformance: vi.fn() }));

vi.mock("../src/tools/rate-performance/analysis/fitRatePerformance", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/tools/rate-performance/analysis/fitRatePerformance")>();
  return { ...original, fitRatePerformance };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

beforeEach(() => fitRatePerformance.mockReset());

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

function sample(id: string, thickness: number, tau: number, tauStandardError?: number): ThicknessScalingSample {
  return { id, sampleName: id, thickness, thicknessUnit: "um", tau, tauStandardError };
}

function converged(tau: number, tauStandardError: number | null = 0.02): RateFitConverged {
  return {
    status: "converged",
    modelId: "tian-characteristic-time",
    parameters: { qM: 310, tau, n: 0.62 },
    predictions: [300, 280, 220, 140, 80, 42],
    residuals: [0, 0, 0, 0, 0, 0],
    statistics: { sse: 0, rmse: 0, rSquared: 1, adjustedRSquared: 1, aic: null, aicc: null, bic: null },
    uncertainty: {
      covariance: null,
      parameters: {
        qM: { standardError: null, confidenceInterval95: null },
        tau: { standardError: tauStandardError, confidenceInterval95: tauStandardError === null ? null : { lower: tau - 0.05, upper: tau + 0.05 } },
        n: { standardError: null, confidenceInterval95: null },
      },
      warnings: [],
    },
    iterations: 12,
    iterationCountExact: true,
    usedPointCount: 6,
    warnings: [],
  };
}

function failed(): RateFitResult {
  return {
    status: "failed",
    modelId: "tian-characteristic-time",
    failure: { code: "maximum-iterations", message: "not converged" },
    iterations: 240,
    iterationCountExact: true,
    warnings: [],
  };
}

describe("fitThicknessScaling", () => {
  it("normalizes thickness to metres while retaining original values and units", () => {
    expect(normalizeThickness(40, "um")).toBeCloseTo(40e-6, 15);
    expect(normalizeThickness(0.04, "mm")).toBeCloseTo(40e-6, 15);
    expect(normalizeThickness(40e-6, "m")).toBeCloseTo(40e-6, 15);

    const result = fitThicknessScaling([
      { ...sample("a", 20, 2), thicknessUnit: "um" },
      { ...sample("b", 0.04, 4), thicknessUnit: "mm" },
      { ...sample("c", 80e-6, 8), thicknessUnit: "m" },
    ]);
    expect(result.status).toBe("converged");
    if (result.status === "converged") {
      result.samples.forEach(({ thicknessMetres }, index) => expect(thicknessMetres).toBeCloseTo([20e-6, 40e-6, 80e-6][index], 15));
      expect(result.samples.map(({ originalThickness, originalThicknessUnit }) => [originalThickness, originalThicknessUnit]))
        .toEqual([[20, "um"], [0.04, "mm"], [80e-6, "m"]]);
    }
  });

  it("rejects nonpositive and physically duplicate thicknesses explicitly", () => {
    expect(fitThicknessScaling([sample("a", 0, 1), sample("b", 40, 2), sample("c", 80, 3)]))
      .toMatchObject({ status: "failed", failure: { code: "invalid-thickness", sampleIds: ["a"] } });
    expect(fitThicknessScaling([
      sample("a", 40, 1),
      { ...sample("b", 0.04, 2), thicknessUnit: "mm" },
      sample("c", 80, 3),
    ])).toMatchObject({ status: "failed", failure: { code: "duplicate-thickness", sampleIds: ["a", "b"] } });
    expect(fitThicknessScaling([sample("a", 20, 1), sample("b", 40, 2)]))
      .toMatchObject({ status: "failed", failure: { code: "insufficient-distinct-thicknesses" } });
  });

  it("recovers exact linear, quadratic, and power-law scaling without changing fit points", () => {
    const thicknesses = [20, 35, 55, 80, 120];
    const linearInput = thicknesses.map((thickness, index) => sample(`l${index}`, thickness, 0.4 + 0.03 * thickness));
    const quadraticInput = thicknesses.map((thickness, index) => sample(`q${index}`, thickness, 0.7 + 0.0009 * thickness ** 2));
    const powerInput = thicknesses.map((thickness, index) => sample(`p${index}`, thickness, 0.002 * thickness ** 1.6));

    const linear = fitThicknessScaling(linearInput);
    const quadratic = fitThicknessScaling(quadraticInput);
    const power = fitThicknessScaling(powerInput);
    expect(linear).toMatchObject({ status: "converged", bestModelId: "linear" });
    expect(quadratic).toMatchObject({ status: "converged", bestModelId: "quadratic" });
    expect(power).toMatchObject({ status: "converged", bestModelId: "power" });
    if (power.status === "converged") {
      expect(power.fits.power.parameters.alpha).toBeCloseTo(1.6, 10);
      expect(power.fits.power.parameters.amplitude).toBeGreaterThan(0);
      expect(power.fits.power.residuals).toHaveLength(powerInput.length);
      expect(power.fits.power.statistics.rSquared).toBeCloseTo(1, 12);
      expect(power.fits.power.statistics.rmse).toBeLessThan(1e-9);
      expect(power.criterion).toMatchObject({ comparisonScale: "tau-seconds", lowerIsBetter: true });
      expect(power.samples.map(({ id }) => id)).toEqual(powerInput.map(({ id }) => id));
    }
  });

  it("uses tau uncertainty in weighted regressions and returns an alpha CI only with residual DOF", () => {
    const weighted = fitThicknessScaling([
      sample("a", 20, 0.002 * 20 ** 1.5, 0.01),
      sample("b", 35, 0.002 * 35 ** 1.5, 0.02),
      sample("c", 55, 0.002 * 55 ** 1.5, 0.03),
      sample("d", 80, 0.002 * 80 ** 1.5, 0.04),
    ]);
    expect(weighted.status).toBe("converged");
    if (weighted.status === "converged") {
      expect(weighted.weighting).toBe("tau-standard-error");
      expect(weighted.fits.power.parameters.alpha).toBeCloseTo(1.5, 10);
      expect(weighted.fits.power.parameters.alphaStandardError).not.toBeNull();
      expect(weighted.fits.power.parameters.alphaConfidenceInterval95).toEqual(expect.objectContaining({ lower: expect.any(Number), upper: expect.any(Number) }));
    }

    const noDof = fitThicknessScaling([sample("a", 20, 1), sample("b", 40, 2)]);
    expect(noDof).toMatchObject({ status: "failed", failure: { code: "insufficient-distinct-thicknesses" } });
  });

  it("exports samples, fits, scaling diagnostics, residuals, and provenance without NaN", () => {
    const input = [sample("a", 20, 1, 0.1), sample("b", 40, 2.1, 0.15), sample("c", 80, 4.2, 0.2), sample("d", 120, 6.4, 0.25)];
    const result = fitThicknessScaling(input);
    expect(result.status).toBe("converged");
    if (result.status !== "converged") return;
    const sourceSamples = [{
      id: "a", sampleName: "a", thickness: 20, thicknessUnit: "um" as const, massLoading: 2,
      rateInput: {
        mode: "manual" as const,
        points: [{ id: "a-point", rate: 0.1, rateUnit: "h-1" as const, capacity: 300, capacityUnit: "mAh-g-1" as const }],
        normalizationContext: { confirmHInverseMeasuredRate: true },
      },
    }];
    const fitRecords = [{ sampleId: "a", sampleName: "a", fit: converged(1, 0.1) }];
    expect(serializeThicknessSamplesCsv(result, sourceSamples)).toContain("original_thickness_unit");
    expect(serializeThicknessSamplesCsv(result, sourceSamples)).toContain("a-point,0.1,h-1,300,mAh-g-1");
    expect(serializeThicknessFitsCsv(result, fitRecords)).toContain("tau_standard_error_seconds");
    expect(serializeThicknessFitsCsv(result, fitRecords)).toContain("q_m,tau_hours,tau_seconds,n");
    expect(serializeThicknessScalingCsv(result)).toContain("criterion_value");
    expect(serializeThicknessResidualsCsv(result)).toContain("residual_seconds");
    expect(serializeThicknessProvenanceCsv(result, sourceSamples)).toContain("fit_uses_all_valid_points,true");
    expect(serializeThicknessProvenanceCsv(result, sourceSamples)).toContain("a,measured_rate_confirmed,true");
    for (const csv of [serializeThicknessSamplesCsv(result), serializeThicknessFitsCsv(result), serializeThicknessScalingCsv(result), serializeThicknessResidualsCsv(result), serializeThicknessProvenanceCsv(result)]) {
      expect(csv).not.toContain("NaN");
    }
  });
});

async function render(language: "en" | "zh" = "en") {
  localStorage.setItem("tmcc-language", language);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<I18nProvider><SiteHeader /><ThicknessKineticsPage /></I18nProvider>));
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

async function change(target: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), "value")?.set;
    setter?.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe("ThicknessKineticsPage", () => {
  it("supports stable add, deep duplicate, delete, and independent manual/upload inputs", async () => {
    const view = await render();
    expect(view.querySelectorAll("[data-thickness-sample-id]")).toHaveLength(1);
    await click(button(view, "Load Thickness Example"));
    expect(view.querySelectorAll("[data-thickness-sample-id]")).toHaveLength(3);
    expect(view.querySelectorAll<HTMLInputElement>('input[value="manual"]:checked')).toHaveLength(3);
    expect(view.querySelectorAll<HTMLInputElement>('input[value="upload"]')).toHaveLength(3);

    const first = view.querySelector<HTMLElement>("[data-thickness-sample-id]")!;
    const originalId = first.dataset.thicknessSampleId;
    await click([...first.querySelectorAll("button")].find(({ textContent }) => textContent === "Duplicate")!);
    const cards = view.querySelectorAll<HTMLElement>("[data-thickness-sample-id]");
    expect(cards).toHaveLength(4);
    expect(new Set([...cards].map(({ dataset }) => dataset.thicknessSampleId)).size).toBe(4);
    expect(cards[0].dataset.thicknessSampleId).toBe(originalId);

    const originalName = cards[0].querySelector<HTMLInputElement>('input[aria-label="Sample name"]')!;
    const duplicateName = cards[1].querySelector<HTMLInputElement>('input[aria-label="Sample name"]')!;
    await change(originalName, "Edited original");
    expect(duplicateName.value).not.toBe("Edited original");

    await click([...cards[1].querySelectorAll("button")].find(({ textContent }) => textContent === "Delete")!);
    expect(view.querySelectorAll("[data-thickness-sample-id]")).toHaveLength(3);
  });

  it("fits every valid sample, reports progress/failures, scales successes, renders three charts, and exports", async () => {
    fitRatePerformance
      .mockResolvedValueOnce(converged(0.9, 0.05))
      .mockResolvedValueOnce(converged(2.8, 0.12))
      .mockResolvedValueOnce(converged(7.1, 0.2));
    const view = await render();
    await click(button(view, "Load Thickness Example"));
    await click(button(view, "Add Electrode"));
    await change(view.querySelectorAll<HTMLInputElement>('input[aria-label="Sample name"]')[3], "Invalid blank sample");
    await change(view.querySelectorAll<HTMLInputElement>('input[aria-label="Thickness"]')[3], "150");
    await click(button(view, "Analyze Thickness Scaling"));

    expect(fitRatePerformance).toHaveBeenCalledTimes(3);
    expect(fitRatePerformance.mock.calls.every(([points]) => points.length === 6)).toBe(true);
    expect(view.textContent).toContain("3 of 4 samples processed");
    expect(view.textContent).toContain("Invalid blank sample");
    expect(view.textContent).toContain("No complete rate-capacity data");
    expect(view.textContent).toContain("α");
    expect(view.textContent).toContain("τ vs L");
    expect(view.textContent).toContain("τ vs L²");
    expect(view.textContent).toContain("log τ vs log L");
    expect(view.querySelectorAll(".rate-thickness-results .rate-chart-panel")).toHaveLength(3);
    for (const label of ["Samples CSV", "Per-sample Fits CSV", "Scaling CSV", "Residuals CSV", "Provenance CSV", "Export SVG", "Export PNG"]) {
      expect(button(view, label)).toBeTruthy();
    }
    expect(view.textContent).toContain("cannot identify a unique physical mechanism");
  });

  it("marks unmodified example analyses as example results", async () => {
    fitRatePerformance
      .mockResolvedValueOnce(converged(0.9))
      .mockResolvedValueOnce(converged(2.8))
      .mockResolvedValueOnce(converged(7.1));
    const view = await render();
    await click(button(view, "Load Thickness Example"));
    await click(button(view, "Analyze Thickness Scaling"));
    expect(view.textContent).toContain("EXAMPLE RESULTS");
    expect(view.textContent).not.toContain("USER RESULTS");
  });

  it("cancels in-flight fitting and ignores stale completion after an input change", async () => {
    const pending = deferred<RateFitResult>();
    fitRatePerformance.mockReturnValue(pending.promise);
    const view = await render();
    await click(button(view, "Load Thickness Example"));
    await click(button(view, "Analyze Thickness Scaling"));
    const signal = fitRatePerformance.mock.calls[0][1].signal as AbortSignal;
    expect(view.textContent).toContain("Fitting sample 1 of 3");
    await click(button(view, "Cancel Thickness Analysis"));
    expect(signal.aborted).toBe(true);
    expect(view.textContent).toContain("Thickness analysis cancelled");

    pending.resolve(converged(1));
    await act(async () => { await pending.promise; await Promise.resolve(); });
    expect(view.querySelector(".rate-thickness-results")).toBeNull();
  });

  it("renders typed Chinese workflow copy with no raw keys", async () => {
    const view = await render("zh");
    for (const text of ["厚度动力学", "添加电极", "样品名称", "厚度", "分析厚度标度"]) expect(view.textContent).toContain(text);
    expect(view.textContent).not.toContain("rate.thickness.");
  });
});

describe("ThicknessScalingResults display sampling", () => {
  it("samples chart markers without reducing the scaling fit input", async () => {
    const input = Array.from({ length: 2_001 }, (_, index) => sample(`large-${index}`, index + 1, 0.4 + (index + 1) * 0.002));
    const result = fitThicknessScaling(input);
    expect(result.status).toBe("converged");
    if (result.status !== "converged") return;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => root.render(<I18nProvider><ThicknessScalingResults
      result={result}
      failures={[]}
      totalSampleCount={input.length}
      onExportError={() => undefined}
    /></I18nProvider>));

    expect(result.samples).toHaveLength(2_001);
    expect(container.querySelectorAll('[data-point-series-id="thickness-observed-l"]')).toHaveLength(2_000);
    expect(container.textContent).toContain("2,001 raw points; 2,000 displayed");
  });
});
