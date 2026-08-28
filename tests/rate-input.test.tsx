import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider";
import {
  RateDataInput,
  createInitialRateDataInputValue,
  type RateDataInputValue,
} from "../src/tools/rate-performance/components/RateDataInput";
import { ResultCards } from "../src/tools/rate-performance/components/ResultCards";
import { FitStatus } from "../src/tools/rate-performance/components/FitStatus";
import { ModelTheoryPanel } from "../src/tools/rate-performance/components/ModelTheoryPanel";
import { ReferenceList } from "../src/tools/rate-performance/components/ReferenceList";
import { RateChartPanel } from "../src/tools/rate-performance/components/RateChartPanel";
import { ExportToolbar } from "../src/tools/rate-performance/components/ExportToolbar";
import { sampleRateChartPoints } from "../src/tools/rate-performance/utils/chartSampling";
import {
  serializeNormalizedRateCsv,
  serializeOriginalRateCsv,
  serializeRateParametersCsv,
  serializeRateFitCsv,
} from "../src/tools/rate-performance/utils/rateExports";
import type { TabularSheet } from "../src/lib/tabularParsing";
import type { NormalizedRatePoint, RatePoint } from "../src/tools/rate-performance/models/types";
import { rateReferences } from "../src/tools/rate-performance/references/rateReferences";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  localStorage.clear();
});

function InputHarness({
  initial = createInitialRateDataInputValue(),
  parseFile,
}: {
  initial?: RateDataInputValue;
  parseFile?: (file: File) => Promise<TabularSheet[]>;
}) {
  const [value, setValue] = useState(initial);
  return <>
    <RateDataInput value={value} onChange={setValue} parseFile={parseFile} />
    <output data-testid="rate-input-value">{JSON.stringify(value)}</output>
  </>;
}

async function render(ui: React.ReactNode, language: "en" | "zh" = "en") {
  localStorage.setItem("tmcc-language", language);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<I18nProvider>{ui}</I18nProvider>));
  return container;
}

function button(view: HTMLElement, label: string) {
  const match = [...view.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === label);
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

async function click(target: Element) {
  await act(async () => target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

async function change(target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype = target instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : target instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, value);
    target.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function readValue(view: HTMLElement): RateDataInputValue {
  return JSON.parse(view.querySelector('[data-testid="rate-input-value"]')?.textContent ?? "null") as RateDataInputValue;
}

async function upload(view: HTMLElement, file: File) {
  const input = view.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("File input unavailable");
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("RateDataInput", () => {
  it("starts with six stable controlled rows and supports add, delete, clear, and example actions", async () => {
    const view = await render(<InputHarness />);
    const viewport = view.querySelector('[data-rate-table-viewport="true"]');

    expect(viewport?.getAttribute("data-visible-rows")).toBe("6");
    expect(view.querySelectorAll('input[type="number"][name^="rate-"]')).toHaveLength(6);
    expect(view.querySelectorAll('input[type="number"][name^="capacity-"]')).toHaveLength(6);
    expect(view.querySelector('input[name="rate-rate-row-1"]')?.getAttribute("aria-label")).toContain("row 1");
    expect(new Set(readValue(view).points.map(({ id }) => id)).size).toBe(6);

    await click(button(view, "Add row"));
    expect(readValue(view).points).toHaveLength(7);

    const retainedId = readValue(view).points[1].id;
    await click(button(view, "Delete row 1"));
    expect(readValue(view).points).toHaveLength(6);
    expect(readValue(view).points[0].id).toBe(retainedId);

    await click(button(view, "Load example"));
    expect(readValue(view).points.map(({ rate }) => rate)).toEqual([20, 50, 100, 250, 500, 1000]);
    expect(readValue(view).points.every(({ rateUnit }) => rateUnit === "mA-g-1")).toBe(true);

    await click(button(view, "Clear"));
    expect(readValue(view).points).toHaveLength(6);
    expect(readValue(view).points.every(({ rate, capacity }) => rate === null && capacity === null)).toBe(true);
  });

  it("accepts direct Excel-compatible two-column paste without losing raw units", async () => {
    const view = await render(<InputHarness />);
    const pasteArea = view.querySelector<HTMLTextAreaElement>('textarea[aria-label="Paste two columns of rate and capacity data"]')!;
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "0.1\t310\n1\t245\n10\t120" },
    });

    await act(async () => pasteArea.dispatchEvent(event));

    expect(readValue(view).points).toEqual([
      { id: "rate-row-1", rate: 0.1, rateUnit: "h-1", capacity: 310, capacityUnit: "mAh-g-1" },
      { id: "rate-row-2", rate: 1, rateUnit: "h-1", capacity: 245, capacityUnit: "mAh-g-1" },
      { id: "rate-row-3", rate: 10, rateUnit: "h-1", capacity: 120, capacityUnit: "mAh-g-1" },
    ]);
  });

  it("returns normalization context explicitly and never converts raw values when units change", async () => {
    const initial = createInitialRateDataInputValue();
    const firstPoint = { ...initial.points[0], rate: 2, capacity: 250 };
    const view = await render(<InputHarness initial={{ ...initial, points: [firstPoint, ...initial.points.slice(1)] }} />);

    await change(view.querySelector<HTMLSelectElement>('select[aria-label="Rate unit"]')!, "C-rate");
    expect(readValue(view).points[0]).toMatchObject({ rate: 2, capacity: 250, rateUnit: "C-rate" });
    expect(view.textContent).toContain("Theoretical capacity");

    await change(view.querySelector<HTMLInputElement>('input[aria-label="Theoretical capacity"]')!, "320");
    expect(readValue(view).normalizationContext).toEqual({
      theoreticalCapacity: { value: 320, unit: "mAh-g-1" },
    });

    await change(view.querySelector<HTMLSelectElement>('select[aria-label="Rate unit"]')!, "h-1");
    const confirmation = view.querySelector<HTMLInputElement>('input[aria-label="Confirm measured-rate definition"]')!;
    await click(confirmation);
    expect(readValue(view).normalizationContext.confirmHInverseMeasuredRate).toBe(true);
    expect(readValue(view).points[0].rate).toBe(2);
  });

  it("uses the generic parser for CSV, TXT, and XLSX and exposes explicit mapping plus a complete import summary", async () => {
    const rows = [
      ["Capacity", "Notes", "Rate"],
      [300, "ok", 0.1],
      [250, "bad", "oops"],
      [null, "missing", 1],
      [200, "ok", 2],
    ] satisfies TabularSheet["rows"];
    const parseFile = vi.fn(async (file: File) => [{ name: `Sheet for ${file.name}`, rows }]);
    const view = await render(<InputHarness parseFile={parseFile} />);

    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    const fileInput = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(fileInput.accept).toBe(".csv,.txt,.xlsx");

    for (const fileName of ["rates.csv", "rates.txt", "rates.xlsx"]) {
      await upload(view, new File(["placeholder"], fileName));
      expect(view.textContent).toContain(fileName);
    }
    expect(parseFile).toHaveBeenCalledTimes(3);

    expect(view.textContent).toContain("Detected columns");
    expect(view.textContent).toContain("Capacity, Notes, Rate");
    expect(view.textContent).toContain("Mapped rate column");
    expect(view.textContent).toContain("Rate");
    expect(view.textContent).toContain("Mapped capacity column");
    expect(view.textContent).toContain("Rows");
    expect(view.textContent).toContain("4");
    expect(view.textContent).toContain("Valid points");
    expect(view.textContent).toContain("2");
    expect(view.textContent).toContain("Invalid rows");
    expect(view.textContent).toContain("Missing values");
    expect(view.textContent).toContain("1");
    expect(view.textContent).toContain("0.1–2");
    expect(view.textContent).toContain("200–300");

    const imported = readValue(view).points;
    expect(imported[0]).toMatchObject({
      id: "rate-import-Sheet-for-rates-xlsx-row-2",
      rate: 0.1,
      capacity: 300,
      rateUnit: "h-1",
      capacityUnit: "mAh-g-1",
    });
    const stableIds = imported.map(({ id }) => id);

    await change(view.querySelector<HTMLSelectElement>('select[aria-label="Rate column"]')!, "1");
    expect(readValue(view).points.map(({ id }) => id)).toEqual(stableIds);
    expect(view.textContent).toContain("0 valid points");
    expect(view.textContent).toContain("4 invalid rows");
  });

  it("renders fully labeled Chinese manual and upload controls", async () => {
    const view = await render(<InputHarness />, "zh");
    expect(view.textContent).toContain("手动输入");
    expect(view.textContent).toContain("上传文件");
    expect(view.textContent).toContain("添加行");
    expect(view.textContent).toContain("载入示例");
    expect(view.querySelector('select[aria-label="倍率单位"]')).not.toBeNull();
    expect(view.querySelector('textarea[aria-label="粘贴倍率和容量两列数据"]')).not.toBeNull();
  });
});

describe("shared Rate Performance presentation", () => {
  it("keeps display sampling immutable and preserves endpoints", () => {
    const raw = Object.freeze(Array.from({ length: 9 }, (_, index) => Object.freeze({ x: index + 1, y: 100 - index })));
    const snapshot = JSON.stringify(raw);
    const sampled = sampleRateChartPoints(raw, 4);

    expect(sampled).toHaveLength(4);
    expect(sampled[0]).toBe(raw[0]);
    expect(sampled.at(-1)).toBe(raw.at(-1));
    expect(JSON.stringify(raw)).toBe(snapshot);
    expect(sampled).not.toBe(raw);
  });

  it("serializes original, normalized, and fitted values in physical units", () => {
    const raw: RatePoint[] = [{ id: "p1", rate: 10, rateUnit: "mA-g-1", capacity: 200, capacityUnit: "mAh-g-1" }];
    const normalized: NormalizedRatePoint[] = [{
      id: "p1",
      analysisRate: 0.05,
      analysisRateUnit: "h-1",
      analysisCapacity: 200,
      analysisCapacityUnit: "mAh-g-1",
      originalRate: 10,
      originalRateUnit: "mA-g-1",
      originalCapacity: 200,
      originalCapacityUnit: "mAh-g-1",
      normalization: { method: "specific-current" },
    }];
    const metadata = { modelId: "tian-characteristic-time", rateDefinition: "measured-rate", normalizationBasis: "active-material" };

    expect(serializeOriginalRateCsv(raw, metadata)).toContain("p1,10,mA-g-1,200,mAh-g-1");
    expect(serializeNormalizedRateCsv(normalized, metadata)).toContain("p1,0.05,h-1,200,mAh-g-1,10,mA-g-1");
    expect(serializeRateFitCsv([{ rate: 0.05, observedCapacity: 200, fittedCapacity: 198, residual: 2 }], metadata))
      .toContain("0.05,200,198,2,h-1,mAh-g-1");
    expect(serializeRateFitCsv([{ rate: 0.05, observedCapacity: 200, fittedCapacity: 198, residual: 2 }], metadata))
      .not.toContain("-1.301");
    expect(serializeRateParametersCsv([{ name: "tau", value: 2.5, unit: "h", type: "fitted" }], metadata))
      .toContain("tau,2.5,h,fitted");
  });

  it("renders modular result, status, theory, reference, chart, and export components", async () => {
    const onCsv = vi.fn();
    const view = await render(<>
      <ResultCards kind="example" items={[{ id: "tau", label: "τ", value: "2.5", unit: "h", type: "fitted" }]} />
      <ResultCards kind="user" items={[{ id: "n", label: "n", value: "0.7" }]} />
      <FitStatus status="loading" />
      <ModelTheoryPanel content={{
        title: "Characteristic-time rate model",
        equation: "Q(R) = Q_M […]",
        equationDescription: "Capacity as a function of measured rate.",
        parameters: [{ symbol: "τ", name: "characteristic time", meaning: "Effective timescale", unit: "h", type: "fitted" }],
        physicalMeaning: "Effective rate limitation.",
        limitingBehavior: "Q approaches Q_M at low rate.",
        applicability: "Positive measured-rate data.",
        assumptions: ["Positive finite values."],
        limitations: ["Model-dependent timescale."],
        citationGuidance: "Cite the primary source.",
      }} />
      <ReferenceList references={[rateReferences[0]]} />
      <RateChartPanel
        title="Rate chart"
        xLabel="Rate (h^-1)"
        yLabel="Capacity (mAh g^-1)"
        series={[{ id: "data", label: "Data", color: "#16697a", points: [{ x: 1, y: 200 }] }]}
        rawPointCount={10}
        displayedPointCount={1}
      />
      <ExportToolbar csvItems={[{ id: "original", label: "Original data", filename: "original.csv", csv: "x,y\r\n1,2" }]} onCsvExport={onCsv} />
    </>);

    expect(view.textContent).toContain("EXAMPLE RESULTS");
    expect(view.textContent).toContain("USER RESULTS");
    expect(view.querySelector('[role="status"]')?.textContent).toContain("Fitting in progress");
    expect(view.textContent).toContain("Governing equation");
    expect(view.textContent).toContain("Parameter definitions");
    expect(view.textContent).toContain("References");
    expect(view.textContent).toContain("10 raw points; 1 displayed");
    await click(button(view, "Original data"));
    expect(onCsv).toHaveBeenCalledWith("original.csv", "x,y\r\n1,2");
  });

  it("localizes example and user result labels distinctly in Chinese", async () => {
    const view = await render(<>
      <ResultCards kind="example" items={[]} />
      <ResultCards kind="user" items={[]} />
      <FitStatus status="failed" message="拟合未收敛" />
    </>, "zh");

    expect(view.textContent).toContain("示例结果");
    expect(view.textContent).toContain("用户结果");
    expect(view.textContent).toContain("拟合失败");
  });
});
