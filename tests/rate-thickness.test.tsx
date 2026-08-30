import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "../src/components/SiteHeader";
import { I18nProvider } from "../src/i18n/I18nProvider";
import {
  fitThicknessScaling,
  normalizeThickness,
  selectLowestDescriptiveRmse,
  type ThicknessScalingSample,
} from "../src/tools/rate-performance/analysis/thicknessScaling";
import type {
  RateFitConverged,
  RateFitResult,
} from "../src/tools/rate-performance/analysis/fitRatePerformance";
import { fitThicknessSeries } from "../src/tools/rate-performance/analysis/fitThicknessSeries";
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

function sample(id: string, thickness: number, tau: number, tauStandardError?: number, modelId = "tian-characteristic-time"): ThicknessScalingSample {
  return { id, sampleName: id, thickness, thicknessUnit: "um", tau, tauStandardError, modelId };
}

function converged(tau: number, tauStandardError: number | null = 0.02, modelId = "tian-characteristic-time"): RateFitConverged {
  return {
    status: "converged",
    modelId,
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
      { ...sample("a", 40, 1), sampleName: "Forty micrometres" },
      { ...sample("b", 0.04, 2), sampleName: "Point zero four millimetres", thicknessUnit: "mm" },
      sample("c", 80, 3),
    ])).toMatchObject({
      status: "failed",
      failure: {
        code: "duplicate-thickness",
        sampleIds: ["a", "b"],
        conflicts: [{
          thicknessMetres: 40e-6,
          samples: [
            { id: "a", sampleName: "Forty micrometres", thickness: 40, thicknessUnit: "um" },
            { id: "b", sampleName: "Point zero four millimetres", thickness: 0.04, thicknessUnit: "mm" },
          ],
        }],
      },
    });
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
      expect(power.criterion).toMatchObject({ name: "RMSE", comparisonScale: "tau-seconds", lowerIsBetter: true, purpose: "descriptive" });
      expect(power.samples.map(({ id }) => id)).toEqual(powerInput.map(({ id }) => id));
    }
  });

  it("does not claim a unique descriptive RMSE winner for scale-relative ties or unavailable values", () => {
    expect(selectLowestDescriptiveRmse([
      { modelId: "linear", rmse: 1 },
      { modelId: "quadratic", rmse: 1 + 5e-10 },
      { modelId: "power", rmse: 3 },
    ])).toBeNull();
    expect(selectLowestDescriptiveRmse([
      { modelId: "linear", rmse: null },
      { modelId: "quadratic", rmse: null },
      { modelId: "power", rmse: null },
    ])).toBeNull();
    expect(selectLowestDescriptiveRmse([
      { modelId: "linear", rmse: 1 },
      { modelId: "quadratic", rmse: 1.01 },
      { modelId: "power", rmse: 3 },
    ])).toBe("linear");
  });

  it("rejects mixed characteristic-time models before cross-sample scaling", () => {
    const result = fitThicknessScaling([
      sample("tian-a", 20, 1, 0.1, "tian-characteristic-time"),
      sample("tian-b", 40, 2, 0.1, "tian-characteristic-time"),
      sample("rational", 80, 4, 0.1, "rational-characteristic-time"),
    ]);
    expect(result).toMatchObject({
      status: "failed",
      failure: {
        code: "mixed-models",
        sampleIds: ["tian-a", "tian-b", "rational"],
        modelGroups: {
          "tian-characteristic-time": ["tian-a", "tian-b"],
          "rational-characteristic-time": ["rational"],
        },
      },
    });
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
      id: "a", sampleName: "=injected", thickness: -20, thicknessUnit: "um" as const, massLoading: 2,
      rateInput: {
        mode: "manual" as const,
        points: [{ id: "a-point", rate: 0.1, rateUnit: "h-1" as const, capacity: 300, capacityUnit: "mAh-g-1" as const }],
        normalizationContext: { confirmHInverseMeasuredRate: true },
      },
      modelId: "tian-characteristic-time",
    }, {
      id: "failed", sampleName: "@failed", thickness: 80, thicknessUnit: "um" as const, massLoading: null,
      rateInput: { mode: "upload" as const, points: [], normalizationContext: {} },
      modelId: "rational-characteristic-time",
    }];
    const exportContext = {
      resultKind: "example" as const,
      exampleId: "=thickness-example",
      sources: sourceSamples,
      outcomes: [{
        status: "converged" as const,
        sampleId: "a",
        sampleName: "=injected",
        modelId: "tian-characteristic-time",
        modelEquation: "Q(R) = Q_M […]",
        referenceIds: ["tian-2019-rate-performance"],
        normalizedPoints: [{
          id: "a-point", analysisRate: 0.1, analysisRateUnit: "h-1" as const,
          analysisCapacity: 300, analysisCapacityUnit: "mAh-g-1" as const,
          originalRate: 0.1, originalRateUnit: "h-1" as const,
          originalCapacity: 300, originalCapacityUnit: "mAh-g-1" as const,
          normalization: { method: "measured-rate-direct" as const, measuredRateConfirmed: true },
        }],
        fit: converged(1, 0.1),
      }, {
        status: "failed" as const,
        sampleId: "failed",
        sampleName: "@failed",
        modelId: "rational-characteristic-time",
        modelEquation: "Q(R) = Q_M / [1 + 2 (R tau)^n]",
        referenceIds: ["tian-2020-chronoamperometry"],
        normalizedPoints: [],
        failureCode: "maximum-iterations",
        failureMessage: "+optimizer failed",
      }],
      scalingFailure: null,
    };
    const samplesCsv = serializeThicknessSamplesCsv(result, exportContext);
    const fitsCsv = serializeThicknessFitsCsv(result, exportContext);
    const scalingCsv = serializeThicknessScalingCsv(result, exportContext);
    const residualsCsv = serializeThicknessResidualsCsv(result, exportContext);
    const provenanceCsv = serializeThicknessProvenanceCsv(result, exportContext);
    expect(samplesCsv).toContain("original_thickness_unit");
    expect(samplesCsv).toContain("excluded_from_scaling");
    expect(samplesCsv).toContain("maximum-iterations");
    expect(samplesCsv).toContain("a-point,0.1,h-1,300,mAh-g-1,0.1,h-1,300,mAh-g-1,measured-rate-direct");
    expect(fitsCsv).toContain("tau_standard_error_seconds");
    expect(fitsCsv).toContain("q_m,tau_hours,tau_seconds,n");
    expect(fitsCsv).toContain("maximum-iterations");
    expect(fitsCsv).toContain("'+optimizer failed");
    expect(scalingCsv).toContain("amplitude_unit");
    expect(scalingCsv).toContain("s·m^-alpha");
    expect(scalingCsv).not.toContain("aicc");
    expect(residualsCsv).toContain("residual_seconds");
    expect(residualsCsv).toContain(",-20,");
    expect(provenanceCsv).toContain("result_kind,example");
    expect(provenanceCsv).toContain("example_id,'=thickness-example");
    expect(provenanceCsv).toContain("failed,model_id,rational-characteristic-time");
    expect(provenanceCsv).toContain("failed,failure_code,maximum-iterations");
    expect(provenanceCsv).toContain("failed_sample_ids,failed");
    expect(provenanceCsv).toContain("power_amplitude_unit,s·m^-alpha");
    expect(provenanceCsv).toContain("a,reference_ids,tian-2019-rate-performance");
    for (const csv of [samplesCsv, fitsCsv, scalingCsv, residualsCsv, provenanceCsv]) {
      expect(csv).not.toContain("NaN");
      expect(csv).toContain("'=thickness-example");
    }

    const failedContext = {
      ...exportContext,
      scalingFailure: {
        code: "duplicate-thickness" as const,
        sampleIds: ["a"],
        message: "Duplicate physical thicknesses are excluded.",
      },
    };
    expect(serializeThicknessSamplesCsv(null, failedContext)).toContain("duplicate-thickness");
    expect(serializeThicknessProvenanceCsv(null, failedContext)).toContain("scaling_failure_code,duplicate-thickness");
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

function seriesSource(id: string, pointCount = 6, modelId = "tian-characteristic-time") {
  return {
    id,
    sampleName: id,
    thickness: 20,
    thicknessUnit: "um" as const,
    massLoading: null,
    modelId,
    points: Array.from({ length: pointCount }, (_, index) => ({
      id: `${id}-${index}`,
      rate: index + 1,
      rateUnit: "h-1" as const,
      capacity: 300 - index / Math.max(1, pointCount),
      capacityUnit: "mAh-g-1" as const,
    })),
    normalizationContext: { confirmHInverseMeasuredRate: true },
  };
}

describe("fitThicknessSeries", () => {
  it("fits serially, waits before starting the second sample, and continues after a failed fit", async () => {
    const first = deferred<RateFitResult>();
    const second = deferred<RateFitResult>();
    const fit = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const pending = fitThicknessSeries([seriesSource("first"), seriesSource("second")], { fit });
    expect(fit).toHaveBeenCalledTimes(1);

    first.resolve(failed());
    await act(async () => { await first.promise; await Promise.resolve(); });
    expect(fit).toHaveBeenCalledTimes(2);
    second.resolve(converged(2));
    const outcomes = await pending;
    expect(outcomes.map(({ status }) => status)).toEqual(["failed", "converged"]);
    expect(outcomes[0]).toMatchObject({ status: "failed", failureCode: "maximum-iterations" });
  });

  it("accepts exactly 20,000 points and rejects 20,001 without calling the fitter", async () => {
    const fit = vi.fn(async () => converged(1));
    const outcomes = await fitThicknessSeries([
      seriesSource("limit", 20_000),
      seriesSource("over-limit", 20_001),
    ], { fit });
    expect(fit).toHaveBeenCalledOnce();
    expect(fit.mock.calls[0][0]).toHaveLength(20_000);
    expect(outcomes[0].status).toBe("converged");
    expect(outcomes[1]).toMatchObject({ status: "failed", failureCode: "too-many-points" });
  });
});

describe("ThicknessKineticsPage", () => {
  it("supports stable add, deep duplicate, delete, and independent manual/upload inputs", async () => {
    const view = await render();
    expect(view.querySelectorAll("[data-thickness-sample-id]")).toHaveLength(1);
    await click(button(view, "Load Thickness Example"));
    expect(view.querySelectorAll("[data-thickness-sample-id]")).toHaveLength(3);
    expect(view.querySelectorAll<HTMLInputElement>('input[value="manual"]:checked')).toHaveLength(3);
    expect(view.querySelectorAll<HTMLInputElement>('input[value="upload"]')).toHaveLength(3);
    const modelSelectors = view.querySelectorAll<HTMLSelectElement>('select[aria-label="Rate model"]');
    expect(modelSelectors).toHaveLength(3);
    expect([...modelSelectors[0].options].map(({ value }) => value)).toEqual([
      "tian-characteristic-time",
      "rational-characteristic-time",
    ]);
    await change(modelSelectors[0], "rational-characteristic-time");

    const first = view.querySelector<HTMLElement>("[data-thickness-sample-id]")!;
    const originalId = first.dataset.thicknessSampleId;
    expect(first.getAttribute("aria-labelledby")).toBe(first.querySelector("h3")?.id);
    expect(first.querySelector('button[aria-label="Duplicate Thin electrode"]')).not.toBeNull();
    expect(first.querySelector('button[aria-label="Delete Thin electrode"]')).not.toBeNull();
    await click([...first.querySelectorAll("button")].find(({ textContent }) => textContent === "Duplicate")!);
    const cards = view.querySelectorAll<HTMLElement>("[data-thickness-sample-id]");
    expect(cards).toHaveLength(4);
    expect(new Set([...cards].map(({ dataset }) => dataset.thicknessSampleId)).size).toBe(4);
    expect(cards[0].dataset.thicknessSampleId).toBe(originalId);
    expect(cards[1].querySelector<HTMLSelectElement>('select[aria-label="Rate model"]')?.value)
      .toBe("rational-characteristic-time");

    const originalName = cards[0].querySelector<HTMLInputElement>('input[aria-label="Sample name"]')!;
    const duplicateName = cards[1].querySelector<HTMLInputElement>('input[aria-label="Sample name"]')!;
    await change(originalName, "Edited original");
    expect(duplicateName.value).not.toBe("Edited original");

    await click([...cards[1].querySelectorAll("button")].find(({ textContent }) => textContent === "Delete")!);
    expect(view.querySelectorAll("[data-thickness-sample-id]")).toHaveLength(3);
  });

  it("lists duplicate-thickness identities and retains failure input/provenance exports", async () => {
    fitRatePerformance.mockResolvedValue(converged(1));
    const view = await render();
    await click(button(view, "Load Thickness Example"));
    const first = view.querySelector<HTMLElement>("[data-thickness-sample-id]")!;
    await click([...first.querySelectorAll("button")].find(({ textContent }) => textContent === "Duplicate")!);
    await click(button(view, "Analyze Thickness Scaling"));

    expect(view.textContent).toContain("Duplicate physical thickness");
    expect(view.textContent).toContain("Thin electrode");
    expect(view.textContent).toContain("Thin electrode copy");
    expect(view.textContent).toContain("30 µm");
    expect(button(view, "Samples CSV")).toBeTruthy();
    expect(button(view, "Provenance CSV")).toBeTruthy();
  });

  it("blocks cross-scaling when successful samples use different validated models", async () => {
    fitRatePerformance.mockImplementation(async (_points, options: { modelId: string }) => converged(1, 0.1, options.modelId));
    const view = await render();
    await click(button(view, "Load Thickness Example"));
    await change(view.querySelectorAll<HTMLSelectElement>('select[aria-label="Rate model"]')[2], "rational-characteristic-time");
    await click(button(view, "Analyze Thickness Scaling"));

    expect(fitRatePerformance.mock.calls.map((call) => call[1].modelId)).toEqual([
      "tian-characteristic-time", "tian-characteristic-time", "rational-characteristic-time",
    ]);
    expect(view.textContent).toContain("different rate models");
    expect(view.querySelector(".rate-thickness-results")).toBeNull();
    expect(button(view, "Provenance CSV")).toBeTruthy();
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

  it("aborts and ignores an in-flight fit when sample input changes", async () => {
    const pending = deferred<RateFitResult>();
    fitRatePerformance.mockReturnValue(pending.promise);
    const view = await render();
    await click(button(view, "Load Thickness Example"));
    await click(button(view, "Analyze Thickness Scaling"));
    const signal = fitRatePerformance.mock.calls[0][1].signal as AbortSignal;
    await change(view.querySelector<HTMLInputElement>('input[aria-label="Sample name"]')!, "Changed while fitting");
    expect(signal.aborted).toBe(true);
    pending.resolve(converged(1));
    await act(async () => { await pending.promise; await Promise.resolve(); });
    expect(view.querySelector(".rate-thickness-results")).toBeNull();
    expect(view.textContent).not.toContain("Thickness Scaling Results");
  });

  it("aborts the active sample fit when unmounted", async () => {
    const pending = deferred<RateFitResult>();
    fitRatePerformance.mockReturnValue(pending.promise);
    const view = await render();
    await click(button(view, "Load Thickness Example"));
    await click(button(view, "Analyze Thickness Scaling"));
    const signal = fitRatePerformance.mock.calls[0][1].signal as AbortSignal;
    await act(async () => roots.at(-1)?.unmount());
    expect(signal.aborted).toBe(true);
    pending.resolve(converged(1));
    await pending.promise;
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
