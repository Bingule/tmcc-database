import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider";
import {
  calculateSummaryEnergyPower,
  integrateDischargeCurve,
  toRagonePoints,
} from "../src/tools/rate-performance/analysis/energyPower";
import EnergyPowerPage from "../src/tools/rate-performance/pages/EnergyPowerPage";
import { EnergyCurveFileImport } from "../src/tools/rate-performance/components/EnergyCurveFileImport";
import { validateEnergyCurvePoints } from "../src/tools/rate-performance/utils/energyCurveValidation";
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
async function change(target: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(target instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")?.set?.call(target, value);
    target.dispatchEvent(new Event("change", { bubbles: true }));
  });
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
    const curve = serializeEnergyCurveCsv([{ id: "+point", x: 0, voltage: 4, current: null }, { id: "second", x: 1, voltage: 3, current: null }], {
      sampleId: "curve-1", sampleName: "Electrode A", mode: "capacity", xUnit: "mAh-g-1",
      currentUnit: null, currentSign: "positive", basis: "electrode", massG: 2,
      volumeCm3: 0.5, dischargeTimeHours: 1, integrationMethod: "trapezoidal-v-dq", integrationSucceeded: true,
      source: { kind: "upload", fileName: "=curve.csv", sheetName: "Sheet 2", headerMode: "header", hasHeader: true, mapping: { x: { index: 1, name: "capacity" }, voltage: { index: 0, name: "voltage" }, current: null }, rawRows: [{ rowNumber: 2, cells: [4, 0, "unmapped"] }, { rowNumber: 3, cells: [3, 1, "kept"] }] },
    }, metadata);
    expect(curve).toContain("sample_id,sample_name,point_id,axis_value,axis_type,axis_unit,voltage_V,current_original,current_unit,current_sign");
    expect(curve).toContain("curve-1,Electrode A,'+point,0,capacity,mAh-g-1,4,,");
    expect(curve).toContain("electrode,2,0.5,1,trapezoidal-v-dq,full-curve,valid,true");
    expect(curve).toContain("upload,'=curve.csv,Sheet 2,header,true,2,1,capacity,0,voltage");
    expect(curve).toContain('"[4,0,""unmapped""]"');
    expect(serializeEnergyResultsCsv([result], metadata)).toContain("point_count");
  });
});

describe("curve validation shared by analysis and export", () => {
  it("separates parse-valid, scientific-valid and included points for invalid values and axis order", () => {
    const validation = validateEnergyCurvePoints([
      { id: "a", x: 0, voltage: 4, current: null }, { id: "b", x: 1, voltage: -1, current: null },
      { id: "c", x: 0, voltage: 3, current: null }, { id: "d", x: null, voltage: null, current: null },
    ], "capacity", "positive");
    expect(validation.counts).toEqual({ parseValid: 3, scientificallyValid: 1, included: 0 });
    expect(validation.canIntegrate).toBe(false);
    expect(validation.points.map((point) => point.reason)).toEqual(["dataset-validation-failed", "negative-voltage", "duplicate-axis", "blank-row"]);
  });

  it("accepts negative recorded discharge current only under the selected negative sign convention", () => {
    const points = [{ id: "a", x: 0, voltage: 4, current: -2 }, { id: "b", x: 1, voltage: 3, current: -2 }];
    expect(validateEnergyCurvePoints(points, "time", "positive").canIntegrate).toBe(false);
    const negative = validateEnergyCurvePoints(points, "time", "negative");
    expect(negative.canIntegrate).toBe(true); expect(negative.counts.included).toBe(2);
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

  it("supports multiple full-curve samples and integrates every sample into Ragone data", async () => {
    const view = await renderPage(); await click(button(view, "Full Discharge Curves"));
    const table = view.querySelector(".energy-curve-table")!;
    await act(async () => { const event = new Event("paste", { bubbles: true }); Object.defineProperty(event, "clipboardData", { value: { getData: () => "0\t4\n100\t3\n200\t2" } }); table.dispatchEvent(event); });
    await change(view.querySelector<HTMLInputElement>('.energy-curve-sample input[name$="-duration"]')!, "0.5");
    await click(button(view, "Duplicate"));
    expect(view.querySelectorAll(".energy-curve-sample")).toHaveLength(2);
    await click(button(view, "Integrate Curve"));
    expect(view.querySelectorAll('[data-point-series-id="ragone-active-material"]')).toHaveLength(2);
    expect(view.textContent).toContain("Discharge curve 1"); expect(view.textContent).toContain("Discharge curve 2");
    await click(button(view, "Add Sample")); expect(view.querySelectorAll(".energy-curve-sample")).toHaveLength(3);
    await click(button(view, "Delete")); expect(view.querySelectorAll(".energy-curve-sample")).toHaveLength(2);
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
    expect(view.textContent).toContain("Detected columns"); expect(view.textContent).toContain("Rows3"); expect(view.textContent).toContain("Parse-valid points2"); expect(view.textContent).toContain("Scientifically valid points2"); expect(view.textContent).toContain("Eligible for integration0"); expect(view.textContent).toContain("Invalid points1");
  });

  it("does not silently discard an invalid first data row as a header", async () => {
    const view = await renderPage(); await click(button(view, "Full Discharge Curves"));
    await click(view.querySelectorAll<HTMLInputElement>('.energy-curve-input input[type="radio"]')[3]);
    const fileInput = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["bad,4\n100,3"], "curve.csv")] });
    await act(async () => { fileInput.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(view.textContent).toContain("Rows2"); expect(view.textContent).toContain("Invalid points1");
    const headerMode = [...view.querySelectorAll("select")].find((item) => item.getAttribute("aria-label") === "Header handling")!;
    await change(headerMode, "header"); expect(view.textContent).toContain("Rows1");
    await change(headerMode, "data"); expect(view.textContent).toContain("Rows2");
  });

  it("shows a parser failure instead of retaining a misleading upload", async () => {
    const view = await renderPage(); await click(button(view, "Full Discharge Curves"));
    await click(view.querySelectorAll<HTMLInputElement>('.energy-curve-input input[type="radio"]')[3]);
    const fileInput = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["capacity,voltage\n0,4\n100,3"], "valid.csv")] });
    await act(async () => { fileInput.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(view.textContent).toContain("Rows2");
    Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["not a workbook"], "broken.xlsx")] });
    await act(async () => { fileInput.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("could not be read");
    expect(view.textContent).not.toContain("Rows2");
    await click(button(view, "Integrate Curve")); expect(view.textContent).toContain("At least two complete curve points");
  });

  it("offers worksheet selection, explicit mapping, missing counts and scientific ranges", async () => {
    const view = document.createElement("div"); document.body.appendChild(view); const root = createRoot(view); roots.push(root);
    const fake = new File(["unused"], "curves.xlsx");
    const parseFile = vi.fn().mockResolvedValueOnce([
      { name: "First", rows: [["voltage", "capacity"], [4, 0], [3, 100], [null, 200]] },
      { name: "Second", rows: [["capacity", "voltage"], [0, 4], [50, 3.5]] },
    ]); const onImport = vi.fn();
    await act(async () => root.render(<I18nProvider><EnergyCurveFileImport sampleId="curve-a" mode="capacity" currentSign="positive" parseFile={parseFile} onImport={onImport} /></I18nProvider>));
    const fileInput = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { configurable: true, value: [fake] });
    await act(async () => { fileInput.dispatchEvent(new Event("change", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(parseFile).toHaveBeenCalled();
    for (const text of ["Worksheet", "Column mapping", "Mapped capacity column", "Mapped voltage column", "Missing values1", "Capacity range0–100", "Voltage range3–4"]) expect(view.textContent).toContain(text);
    const sheet = [...view.querySelectorAll("select")].find((item) => item.parentElement?.textContent?.includes("Worksheet"))!;
    await change(sheet, "1"); expect(view.textContent).toContain("Second"); expect(view.textContent).toContain("Rows2");
  });

  it("requires distinct mapped columns and clears integration points for a duplicate mapping", async () => {
    const view = document.createElement("div"); document.body.appendChild(view); const root = createRoot(view); roots.push(root); const onImport = vi.fn();
    const parseFile = vi.fn().mockResolvedValue([{ name: "Only", rows: [["capacity", "voltage"], [0, 4], [1, 3]] }]);
    await act(async () => root.render(<I18nProvider><EnergyCurveFileImport sampleId="mapping" mode="capacity" currentSign="positive" parseFile={parseFile} onImport={onImport} /></I18nProvider>));
    const input = view.querySelector<HTMLInputElement>('input[type="file"]')!; Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "map.csv")] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
    const selects = view.querySelectorAll<HTMLSelectElement>('.rate-column-mapping select');
    await change(selects[1], selects[0].value);
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("different columns");
    expect(onImport).toHaveBeenLastCalledWith(expect.objectContaining({ points: [] }));
  });

  it("uses the latest callback and invalidates an older parse when curve mode changes", async () => {
    let resolve!: (sheets: Array<{ name: string; rows: Array<Array<string | number>> }>) => void;
    const parseFile = vi.fn(() => new Promise<Array<{ name: string; rows: Array<Array<string | number>> }>>((next) => { resolve = next; }));
    const first = vi.fn(); const latest = vi.fn(); const view = document.createElement("div"); document.body.appendChild(view); const root = createRoot(view); roots.push(root);
    await act(async () => root.render(<I18nProvider><EnergyCurveFileImport sampleId="race" mode="capacity" currentSign="positive" parseFile={parseFile} onImport={first} /></I18nProvider>)); first.mockClear();
    const fileInput = view.querySelector<HTMLInputElement>('input[type="file"]')!; Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["x"], "slow.csv")] });
    await act(async () => { fileInput.dispatchEvent(new Event("change", { bubbles: true })); await Promise.resolve(); });
    await act(async () => root.render(<I18nProvider><EnergyCurveFileImport sampleId="race" mode="time" currentSign="positive" parseFile={parseFile} onImport={latest} /></I18nProvider>));
    resolve([{ name: "late", rows: [["capacity", "voltage"], [0, 4], [1, 3]] }]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(latest).toHaveBeenCalledWith(null); expect(latest).not.toHaveBeenCalledWith(expect.objectContaining({ points: expect.arrayContaining([expect.objectContaining({ x: 0 })]) }));
    expect(first).not.toHaveBeenCalledWith(expect.objectContaining({ points: expect.arrayContaining([expect.objectContaining({ x: 0 })]) }));
  });

  it("renders the workflow in Chinese without leaking keys", async () => {
    const view = await renderPage("zh");
    for (const text of ["能量与功率", "数据输入", "示例数据集", "完整放电曲线", "假设", "限制"]) expect(view.textContent).toContain(text);
    await click(button(view, "完整放电曲线")); expect(view.textContent).toContain("放电曲线 1");
    expect(view.textContent).not.toContain("rate.energy.");
  });
});
