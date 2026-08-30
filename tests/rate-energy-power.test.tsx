import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider";
import {
  calculateSummaryEnergyPower,
  integrateDischargeCurve,
  toRagonePoints,
} from "../src/tools/rate-performance/analysis/energyPower";
import EnergyPowerPage from "../src/tools/rate-performance/pages/EnergyPowerPage";
import {
  serializeEnergyOriginalCsv,
  serializeEnergyResultsCsv,
  serializeEnergyCurveCsv,
  serializeRagoneCsv,
} from "../src/tools/rate-performance/utils/energyExports";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren(); localStorage.clear();
});

async function renderPage(language: "en" | "zh" = "en") {
  localStorage.setItem("tmcc-language", language);
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container); roots.push(root);
  await act(async () => root.render(<I18nProvider><EnergyPowerPage /></I18nProvider>));
  return container;
}
function button(view: HTMLElement, label: string) {
  const match = [...view.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!match) throw new Error(`Button not found: ${label}`); return match;
}
async function click(target: Element) {
  await act(async () => { target.dispatchEvent(new MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
}

describe("energy and power calculations", () => {
  it("calculates gravimetric summary values from specific capacity", () => {
    const result = calculateSummaryEnergyPower({ sampleId: "cell-a", specificCapacity: 200, capacityUnit: "mAh-g-1", averageVoltage: 3.5, dischargeTime: 0.5, dischargeTimeUnit: "h", normalizationBasis: "active-material" });
    expect(result).toEqual(expect.objectContaining({ status: "success", specificEnergyWhKg: 700, specificPowerWKg: 1400, volumetricEnergyWhL: null, normalizationBasis: "active-material" }));
  });

  it("requires mass for raw capacity and gates volumetric output on mass plus volume", () => {
    expect(calculateSummaryEnergyPower({ sampleId: "raw", specificCapacity: 100, capacityUnit: "mAh", averageVoltage: 3, dischargeTime: 1, dischargeTimeUnit: "h", normalizationBasis: "electrode" })).toEqual(expect.objectContaining({ status: "failure", code: "mass-required" }));
    const result = calculateSummaryEnergyPower({ sampleId: "raw", specificCapacity: 100, capacityUnit: "mAh", averageVoltage: 3, dischargeTime: 30, dischargeTimeUnit: "min", normalizationBasis: "electrode", massG: 2, volumeCm3: 0.5 });
    expect(result).toEqual(expect.objectContaining({ status: "success", specificEnergyWhKg: 150, specificPowerWKg: 300, volumetricEnergyWhL: 600, volumetricPowerWL: 1200 }));
  });

  it("integrates V dQ trapezoidally for a monotonic capacity curve", () => {
    const result = integrateDischargeCurve([{ id: "q0", capacity: 0, voltage: 4 }, { id: "q1", capacity: 100, voltage: 3 }, { id: "q2", capacity: 200, voltage: 2 }], { mode: "capacity", capacityUnit: "mAh-g-1", dischargeTimeHours: 0.5, normalizationBasis: "active-material" });
    expect(result).toEqual(expect.objectContaining({ status: "success", specificEnergyWhKg: 600, specificPowerWKg: 1200, integrationMethod: "trapezoidal-v-dq" }));
  });

  it("integrates V I dt for a time-current curve and rejects duplicate or reversed axes", () => {
    const result = integrateDischargeCurve([{ id: "t0", time: 0, voltage: 4, current: 2 }, { id: "t1", time: 1, voltage: 3, current: 2 }], { mode: "time", timeUnit: "h", currentUnit: "mA", massG: 1, normalizationBasis: "device" });
    expect(result).toEqual(expect.objectContaining({ status: "success", specificEnergyWhKg: 7, specificPowerWKg: 7, integrationMethod: "trapezoidal-v-i-dt" }));
    expect(integrateDischargeCurve([{ id: "a", time: 0, voltage: 4, current: 1 }, { id: "b", time: 0, voltage: 3, current: 1 }], { mode: "time", timeUnit: "s", currentUnit: "mA", massG: 1, normalizationBasis: "device" })).toEqual(expect.objectContaining({ status: "failure", code: "duplicate-axis" }));
    expect(integrateDischargeCurve([{ id: "a", capacity: 1, voltage: 4 }, { id: "b", capacity: 0, voltage: 3 }], { mode: "capacity", capacityUnit: "mAh-g-1", normalizationBasis: "active-material" })).toEqual(expect.objectContaining({ status: "failure", code: "non-monotonic-axis" }));
  });

  it("creates Ragone points without hiding normalization basis differences", () => {
    const summaries = [calculateSummaryEnergyPower({ sampleId: "active", specificCapacity: 100, capacityUnit: "Ah-kg-1", averageVoltage: 3, dischargeTime: 1, dischargeTimeUnit: "h", normalizationBasis: "active-material" }), calculateSummaryEnergyPower({ sampleId: "device", specificCapacity: 80, capacityUnit: "Ah-kg-1", averageVoltage: 3, dischargeTime: 0.5, dischargeTimeUnit: "h", normalizationBasis: "device" })];
    expect(toRagonePoints(summaries)).toEqual([{ sampleId: "active", energyWhKg: 300, powerWKg: 300, normalizationBasis: "active-material" }, { sampleId: "device", energyWhKg: 240, powerWKg: 480, normalizationBasis: "device" }]);
  });
});

describe("energy and power exports", () => {
  it("exports formula-safe inputs, methods, units, basis and example provenance", () => {
    const metadata = { resultKind: "example" as const, exampleId: "energy-power-example" };
    const input = [{ sampleId: "=unsafe", specificCapacity: 100, capacityUnit: "mAh-g-1" as const, averageVoltage: 3, dischargeTime: 1, dischargeTimeUnit: "h" as const, normalizationBasis: "active-material" as const }];
    const result = calculateSummaryEnergyPower(input[0]);
    expect(serializeEnergyOriginalCsv(input, metadata)).toContain("'=unsafe");
    const results = serializeEnergyResultsCsv([result], metadata);
    expect(results).toContain("average-voltage,active-material,Wh kg^-1,W kg^-1");
    expect(results).toContain("example,energy-power-example");
    expect(serializeRagoneCsv(toRagonePoints([result]), metadata)).toContain("sample_id,specific_energy_Wh_kg-1,specific_power_W_kg-1,normalization_basis,result_kind,example_id");
    expect(serializeEnergyCurveCsv([{ id: "+point", x: 0, voltage: 4, current: null }], { mode: "capacity", xUnit: "mAh-g-1", currentUnit: null, basis: "electrode" }, metadata)).toContain("'+point,0,capacity,mAh-g-1,4,,");
  });
});

describe("EnergyPowerPage", () => {
  it("explains example outputs, equations, assumptions and limitations before analysis", async () => {
    const view = await renderPage();
    for (const text of ["Data Input", "Example Dataset", "What You Will Get", "Example Results Preview", "E = ∫ V dQ", "Assumptions", "Limitations"]) expect(view.textContent).toContain(text);
    expect(view.textContent).toContain("EXAMPLE RESULTS"); expect(view.textContent).not.toContain("rate.energy.");
  });

  it("loads multiple summary examples, labels their basis, draws log-log Ragone series and exposes three exports", async () => {
    const view = await renderPage(); await click(button(view, "Load Example")); await click(button(view, "Calculate"));
    expect(view.textContent).toContain("EXAMPLE RESULTS"); expect(view.textContent).toContain("Active material basis");
    const chart = view.querySelector('[data-export-id="energy-ragone-chart"]');
    expect(chart).toBeTruthy(); expect(chart?.querySelectorAll('[data-point-series-id="ragone-active-material"]')).toHaveLength(2);
    expect(chart?.textContent).toContain("Specific power (W kg^-1)");
    for (const label of ["Export Original Data", "Export Results", "Export Ragone Data"]) expect(button(view, label)).toBeTruthy();
  });

  it("supports add, duplicate, delete and clear for summary samples", async () => {
    const view = await renderPage();
    expect(view.querySelectorAll(".energy-summary-sample")).toHaveLength(1);
    await click(button(view, "Add Sample")); expect(view.querySelectorAll(".energy-summary-sample")).toHaveLength(2);
    await click(button(view, "Duplicate")); expect(view.querySelectorAll(".energy-summary-sample")).toHaveLength(3);
    await click(button(view, "Delete")); expect(view.querySelectorAll(".energy-summary-sample")).toHaveLength(2);
    await click(button(view, "Clear")); expect(view.querySelectorAll(".energy-summary-sample")).toHaveLength(1);
  });

  it("integrates both explicit full-curve modes and reports strict-axis failures", async () => {
    const view = await renderPage(); await click(button(view, "Full Discharge Curves"));
    expect(view.textContent).toContain("Capacity–voltage"); expect(view.textContent).toContain("Time–voltage–current");
    const table = view.querySelector(".energy-curve-table")!;
    await act(async () => { const event = new Event("paste", { bubbles: true }); Object.defineProperty(event, "clipboardData", { value: { getData: () => "1\t4\n0\t3" } }); table.dispatchEvent(event); });
    await click(button(view, "Integrate Curve")); expect(view.textContent).toContain("strictly increasing");
  });

  it("imports a capacity-voltage CSV through the shared parser and reports counts", async () => {
    const view = await renderPage(); await click(button(view, "Full Discharge Curves"));
    await click(view.querySelectorAll<HTMLInputElement>('.energy-curve-input input[type="radio"]')[3]);
    const fileInput = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["capacity,voltage\n0,4\n100,3\n200,bad"], "curve.csv")] });
    await act(async () => { fileInput.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(view.textContent).toContain("Detected columns"); expect(view.textContent).toContain("Rows3"); expect(view.textContent).toContain("Valid points2"); expect(view.textContent).toContain("Invalid points1");
  });

  it("shows a parser failure instead of retaining a misleading upload", async () => {
    const view = await renderPage(); await click(button(view, "Full Discharge Curves"));
    await click(view.querySelectorAll<HTMLInputElement>('.energy-curve-input input[type="radio"]')[3]);
    const fileInput = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["not a workbook"], "broken.xlsx")] });
    await act(async () => { fileInput.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("could not be read");
  });

  it("renders the workflow in Chinese without leaking keys", async () => {
    const view = await renderPage("zh");
    for (const text of ["能量与功率", "数据输入", "示例数据集", "完整放电曲线", "假设", "限制"]) expect(view.textContent).toContain(text);
    expect(view.textContent).not.toContain("rate.energy.");
  });
});
