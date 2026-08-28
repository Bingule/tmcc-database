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
import { RateFileImport } from "../src/tools/rate-performance/components/RateFileImport";
import { sampleRateChartPoints } from "../src/tools/rate-performance/utils/chartSampling";
import {
  serializeNormalizedRateCsv,
  serializeOriginalRateCsv,
  serializeRateFittedCurveCsv,
  serializeRateParametersCsv,
  serializeRateFitCsv,
  serializeRateResidualsCsv,
} from "../src/tools/rate-performance/utils/rateExports";
import { createSmoothRateFitPoints } from "../src/tools/rate-performance/utils/rateAnalysisPresentation";
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

function ExternallyMutableInputHarness({ parseFile }: { parseFile: (file: File) => Promise<TabularSheet[]> }) {
  const [value, setValue] = useState(createInitialRateDataInputValue());
  return <>
    <RateDataInput value={value} onChange={setValue} parseFile={parseFile} />
    <button type="button" onClick={() => setValue({
      mode: "upload",
      points: [{ id: "external", rate: 9, rateUnit: "h-1", capacity: 99, capacityUnit: "mAh-g-1" }],
      normalizationContext: { confirmHInverseMeasuredRate: true },
    })}>Replace parent value</button>
    <output data-testid="rate-input-value">{JSON.stringify(value)}</output>
  </>;
}

function CloningInputHarness({ parseFile }: { parseFile: (file: File) => Promise<TabularSheet[]> }) {
  const [value, setValue] = useState(createInitialRateDataInputValue());
  return <>
    <RateDataInput value={value} onChange={(next) => setValue({
      ...next,
      points: next.points.map((point) => ({ ...point })),
      normalizationContext: { ...next.normalizationContext },
    })} parseFile={parseFile} />
    <output data-testid="rate-input-value">{JSON.stringify(value)}</output>
  </>;
}

function RerenderingInputHarness({ parseFile }: { parseFile: (file: File) => Promise<TabularSheet[]> }) {
  const [value, setValue] = useState(createInitialRateDataInputValue());
  const [, setRevision] = useState(0);
  return <>
    <RateDataInput value={value} onChange={setValue} parseFile={parseFile} />
    <button type="button" onClick={() => setRevision((revision) => revision + 1)}>Rerender parent</button>
    <output data-testid="rate-input-value">{JSON.stringify(value)}</output>
  </>;
}

function RecreatedValueInputHarness({
  parseFile,
  deep,
}: {
  parseFile: (file: File) => Promise<TabularSheet[]>;
  deep: boolean;
}) {
  const [stored, setStored] = useState(createInitialRateDataInputValue());
  const [, setRevision] = useState(0);
  const value: RateDataInputValue = {
    ...stored,
    points: deep ? stored.points.map((point) => ({ ...point })) : stored.points,
    normalizationContext: deep ? { ...stored.normalizationContext } : stored.normalizationContext,
  };
  return <>
    <RateDataInput value={value} onChange={setStored} parseFile={parseFile} />
    <button type="button" onClick={() => setRevision((revision) => revision + 1)}>Rerender parent</button>
    <output data-testid="rate-input-value">{JSON.stringify(stored)}</output>
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

function summaryValue(view: HTMLElement, label: string) {
  const term = [...view.querySelectorAll("dt")].find((candidate) => candidate.textContent === label);
  return term?.nextElementSibling?.textContent;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
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
    expect(viewport?.getAttribute("role")).toBe("region");
    expect(viewport?.getAttribute("tabindex")).toBe("0");
    expect(viewport?.getAttribute("aria-label")).toBe("Scrollable rate data table");
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

  it("scopes the radio group name to each RateDataInput instance", async () => {
    const view = await render(<><InputHarness /><InputHarness /></>);
    const radios = [...view.querySelectorAll<HTMLInputElement>('input[type="radio"][value="manual"], input[type="radio"][value="upload"]')];
    const names = new Set(radios.map(({ name }) => name));

    expect(radios).toHaveLength(4);
    expect(names.size).toBe(2);
    expect([...names].every((name) => name.startsWith("rate-input-mode-"))).toBe(true);
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
    expect(view.textContent).toContain("0.1–2 h-1");
    expect(view.textContent).toContain("200–300 mAh-g-1");

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

  it("does not swallow a mixed numeric and N/A first data row as a header", async () => {
    const parseFile = vi.fn(async () => [{
      name: "Data",
      rows: [[0.1, "N/A"], [1, 200]],
    } satisfies TabularSheet]);
    const view = await render(<InputHarness parseFile={parseFile} />);

    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "mixed.csv"));

    expect(summaryValue(view, "Rows")).toBe("2");
    expect(summaryValue(view, "Valid points")).toBe("1");
    expect(summaryValue(view, "Invalid rows")).toBe("1");
  });

  it("lets users explicitly classify an unrecognized first row as headers or data", async () => {
    const parseFile = vi.fn(async () => [{
      name: "Data",
      rows: [["X", "Y"], [1, 200]],
    } satisfies TabularSheet]);
    const view = await render(<InputHarness parseFile={parseFile} />);

    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "unknown.csv"));
    expect(summaryValue(view, "Rows")).toBe("2");

    const headerSelect = view.querySelector<HTMLSelectElement>('select[aria-label="Header handling"]');
    expect(headerSelect).not.toBeNull();
    await change(headerSelect!, "header");
    expect(summaryValue(view, "Rows")).toBe("1");
    expect(summaryValue(view, "Valid points")).toBe("1");
  });

  it.each([
    ["Clear", "clear"],
    ["Load example", "example"],
    ["Manual entry", "manual"],
  ] as const)("ignores a deferred upload completion after %s invalidates the import session", async (label, action) => {
    const pending = deferred<TabularSheet[]>();
    const view = await render(<InputHarness parseFile={() => pending.promise} />);
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "slow.csv"));

    if (action === "manual") await click(view.querySelector<HTMLInputElement>('input[value="manual"]')!);
    else await click(button(view, label));
    pending.resolve([{ name: "Slow", rows: [["Rate", "Capacity"], [7, 70]] }]);
    await act(async () => { await pending.promise; await Promise.resolve(); });

    if (action === "example") expect(readValue(view).points[0].id).toBe("rate-example-1");
    else expect(readValue(view).points.some(({ rate }) => rate === 7)).toBe(false);
    expect(view.textContent).not.toContain("Slow");
  });

  it("ignores an older upload when a newer file finishes first", async () => {
    const first = deferred<TabularSheet[]>();
    const second = deferred<TabularSheet[]>();
    const parseFile = vi.fn((file: File) => file.name === "first.csv" ? first.promise : second.promise);
    const view = await render(<InputHarness parseFile={parseFile} />);
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "first.csv"));
    await upload(view, new File(["ignored"], "second.csv"));

    second.resolve([{ name: "New", rows: [["Rate", "Capacity"], [2, 20]] }]);
    await act(async () => { await second.promise; await Promise.resolve(); });
    first.resolve([{ name: "Old", rows: [["Rate", "Capacity"], [1, 10]] }]);
    await act(async () => { await first.promise; await Promise.resolve(); });

    expect(readValue(view).points[0]).toMatchObject({ rate: 2, capacity: 20 });
    expect(view.textContent).toContain("New");
    expect(view.textContent).not.toContain("Old");
  });

  it("invalidates a pending upload when the rate unit changes", async () => {
    const pending = deferred<TabularSheet[]>();
    const view = await render(<InputHarness parseFile={() => pending.promise} />);
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "old-rate-unit.csv"));

    await change(view.querySelector<HTMLSelectElement>('select[aria-label="Rate unit"]')!, "C-rate");
    pending.resolve([{ name: "Old rate unit", rows: [["Rate", "Capacity"], [7, 70]] }]);
    await act(async () => { await pending.promise; await Promise.resolve(); });

    expect(readValue(view).points.every(({ rate, rateUnit }) => rate === null && rateUnit === "C-rate")).toBe(true);
    expect(view.textContent).not.toContain("Old rate unit");
  });

  it("invalidates a pending upload when the capacity unit changes", async () => {
    const pending = deferred<TabularSheet[]>();
    const view = await render(<InputHarness parseFile={() => pending.promise} />);
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "old-capacity-unit.csv"));

    await change(view.querySelector<HTMLSelectElement>('select[aria-label="Capacity unit"]')!, "Ah-kg-1");
    pending.resolve([{ name: "Old capacity unit", rows: [["Rate", "Capacity"], [7, 70]] }]);
    await act(async () => { await pending.promise; await Promise.resolve(); });

    expect(readValue(view).points.every(({ capacity, capacityUnit }) => capacity === null && capacityUnit === "Ah-kg-1")).toBe(true);
    expect(view.textContent).not.toContain("Old capacity unit");
  });

  it("does not invalidate a pending upload for an unrelated parent rerender", async () => {
    const pending = deferred<TabularSheet[]>();
    const view = await render(<RerenderingInputHarness parseFile={() => pending.promise} />);
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "current.csv"));
    await click(button(view, "Rerender parent"));

    pending.resolve([{ name: "Current", rows: [["Rate", "Capacity"], [2, 20]] }]);
    await act(async () => { await pending.promise; await Promise.resolve(); });

    expect(readValue(view).points[0]).toMatchObject({ rate: 2, capacity: 20, rateUnit: "h-1", capacityUnit: "mAh-g-1" });
    expect(view.textContent).toContain("Current");
  });

  it.each([
    ["new outer value with shared nested references", false],
    ["deep-equivalent controlled clone", true],
  ] as const)("keeps a pending upload across an unrelated rerender using a %s", async (_label, deep) => {
    const pending = deferred<TabularSheet[]>();
    const view = await render(<RecreatedValueInputHarness parseFile={() => pending.promise} deep={deep} />);
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "semantic-current.csv"));
    await click(button(view, "Rerender parent"));

    pending.resolve([{ name: "Semantic current", rows: [["Rate", "Capacity"], [3, 30]] }]);
    await act(async () => { await pending.promise; await Promise.resolve(); });

    expect(readValue(view).points[0]).toMatchObject({ rate: 3, capacity: 30 });
    expect(view.textContent).toContain("Semantic current");
  });

  it("clears stale mapping controls when the parent value is externally replaced", async () => {
    const parseFile = vi.fn(async () => [{ name: "Mapped", rows: [["Rate", "Capacity"], [1, 200]] }]);
    const view = await render(<ExternallyMutableInputHarness parseFile={parseFile} />);
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "mapped.csv"));
    expect(view.querySelector('select[aria-label="Rate column"]')).not.toBeNull();

    await click(button(view, "Replace parent value"));

    expect(readValue(view).points[0].id).toBe("external");
    expect(view.querySelector('select[aria-label="Rate column"]')).toBeNull();
  });

  it("invalidates a pending upload immediately when the parent value is externally replaced", async () => {
    const pending = deferred<TabularSheet[]>();
    const view = await render(<ExternallyMutableInputHarness parseFile={() => pending.promise} />);
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "slow.csv"));
    await click(button(view, "Replace parent value"));

    pending.resolve([{ name: "Slow", rows: [["Rate", "Capacity"], [1, 10]] }]);
    await act(async () => { await pending.promise; await Promise.resolve(); });

    expect(readValue(view).points[0].id).toBe("external");
    expect(view.textContent).not.toContain("Slow");
  });

  it("keeps an import draft when a controlled parent clones emitted values", async () => {
    const parseFile = vi.fn(async () => [{ name: "Cloned", rows: [["Rate", "Capacity"], [1, 200]] }]);
    const view = await render(<CloningInputHarness parseFile={parseFile} />);
    await click(view.querySelector<HTMLInputElement>('input[value="upload"]')!);
    await upload(view, new File(["ignored"], "cloned.csv"));

    expect(readValue(view).points[0]).toMatchObject({ rate: 1, capacity: 200 });
    expect(view.querySelector('select[aria-label="Rate column"]')).not.toBeNull();
    expect(view.textContent).toContain("Cloned");
  });

  it("inspects and summarizes 125,000 mapped rows without argument spreading or stack overflow", async () => {
    const rows = Array.from({ length: 125_000 }, (_, index) => [index + 1, index + 2]);
    const sheet = { name: "Large", rows } satisfies TabularSheet;
    const onImport = vi.fn();
    const view = await render(<RateFileImport
      rateUnit="h-1"
      capacityUnit="mAh-g-1"
      onImport={onImport}
      parseFile={async () => [sheet]}
    />);

    await upload(view, new File(["ignored"], "large.csv"));

    expect(onImport).toHaveBeenCalledOnce();
    expect(onImport.mock.calls[0][0]).toHaveLength(125_000);
    expect(summaryValue(view, "Rows")).toBe("125000");
    expect(view.textContent).toContain("1–125000 h-1");
    expect(view.textContent).toContain("2–125001 mAh-g-1");
  });

  it("renders fully labeled Chinese manual and upload controls", async () => {
    const view = await render(<InputHarness />, "zh");
    expect(view.textContent).toContain("手动输入");
    expect(view.textContent).toContain("上传文件");
    expect(view.textContent).toContain("添加行");
    expect(view.textContent).toContain("载入示例");
    expect(view.querySelector('select[aria-label="倍率单位"]')).not.toBeNull();
    expect(view.querySelector('textarea[aria-label="粘贴倍率和容量两列数据"]')).not.toBeNull();
    expect(view.querySelector('[data-rate-table-viewport="true"]')?.getAttribute("aria-label")).toBe("可滚动倍率数据表");
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

  it("keeps smooth fitted curves and observed residuals as distinct exact CSV contracts", () => {
    const metadata = { modelId: "tian-characteristic-time", rateDefinition: "measured-rate", normalizationBasis: "active-material" };
    const fitted = serializeRateFittedCurveCsv([
      { rate: 0.01, fittedCapacity: 201 },
      { rate: 0.02, fittedCapacity: 199 },
    ], metadata);
    const residuals = serializeRateResidualsCsv([
      { rate: 0.01, observedCapacity: 200, fittedCapacity: 201, residual: -1 },
    ], metadata);

    expect(fitted.split("\r\n")[0]).toBe("rate,fitted_capacity,rate_unit,capacity_unit,model_id,rate_definition,normalization_basis,settings");
    expect(residuals.split("\r\n")[0]).toBe("rate,observed_capacity,predicted_capacity,residual,rate_unit,capacity_unit,model_id,rate_definition,normalization_basis,settings");
    expect(fitted.split("\r\n")).toHaveLength(3);
    expect(residuals.split("\r\n")).toHaveLength(2);
    expect(fitted).not.toBe(residuals);
  });

  it("serializes complete normalized provenance and complete fit parameter diagnostics", () => {
    const metadata = { modelId: "tian-characteristic-time", rateDefinition: "measured-rate", normalizationBasis: "active-material" };
    const normalized: NormalizedRatePoint[] = [{
      id: "p1", analysisRate: 0.05, analysisRateUnit: "h-1", analysisCapacity: 200,
      analysisCapacityUnit: "mAh-g-1", originalRate: 10, originalRateUnit: "mA-g-1",
      originalCapacity: 200, originalCapacityUnit: "mAh-g-1",
      normalization: { method: "specific-current" },
    }];
    const processed = serializeNormalizedRateCsv(normalized, metadata);
    expect(processed.split("\r\n")[0]).toBe("point_id,analysis_rate,analysis_rate_unit,analysis_capacity,analysis_capacity_unit,original_rate,original_rate_unit,original_capacity,original_capacity_unit,normalization_method,measured_rate_confirmed,theoretical_capacity,theoretical_capacity_unit,model_id,rate_definition,normalization_basis,settings");
    expect(processed.split("\r\n")[1]).toContain("specific-current,,,,tian-characteristic-time");

    const parameters = serializeRateParametersCsv([{
      name: "Q_M", value: 320, unit: "mAh g^-1", type: "fitted",
      standardError: 2, confidenceInterval95Lower: 314.9, confidenceInterval95Upper: 325.1,
    }], metadata, {
      statistics: { sse: 76, rmse: 3.5, rSquared: 0.99, adjustedRSquared: 0.98, aic: 21, aicc: 45, bic: 20 },
      convergenceStatus: "converged", iterations: 37, iterationCountExact: true,
      warnings: [{ code: "duplicate-rate", rate: 0.05 }],
    });
    expect(parameters.split("\r\n")[0]).toBe("parameter,value,unit,parameter_type,standard_error,ci95_lower,ci95_upper,sse,rmse,r_squared,adjusted_r_squared,aic,aicc,bic,convergence_status,iterations,iteration_count_exact,warnings,model_id,rate_definition,normalization_basis,settings");
    expect(parameters).toContain("Q_M,320,mAh g^-1,fitted,2,314.9,325.1,76,3.5,0.99,0.98,21,45,20,converged,37,true,duplicate-rate:0.05");
  });

  it("handles 125,000 presentation and processed-export points without argument spreading", () => {
    const normalized: NormalizedRatePoint[] = Array.from({ length: 125_000 }, (_, index) => ({
      id: `p${index}`, analysisRate: index + 1, analysisRateUnit: "h-1",
      analysisCapacity: 200, analysisCapacityUnit: "mAh-g-1", originalRate: index + 1,
      originalRateUnit: "h-1", originalCapacity: 200, originalCapacityUnit: "mAh-g-1",
      normalization: { method: "measured-rate-direct", measuredRateConfirmed: true },
    }));
    const smooth = createSmoothRateFitPoints(normalized, { qM: 200, tau: 1, n: 1 }, (rate) => 200 / (1 + rate), 161);
    expect(smooth).toHaveLength(161);
    const csv = serializeNormalizedRateCsv(normalized, {
      modelId: "tian-characteristic-time", rateDefinition: "measured-rate", normalizationBasis: "active-material",
    });
    expect(csv.startsWith("point_id,analysis_rate")).toBe(true);
    expect(csv).toContain("p124999,125000");
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

  it("contains invalid figure selectors and rejected async exporters even without an error callback", async () => {
    const invalidSelectorError = vi.fn();
    const rejectedExport = vi.fn(() => Promise.reject(new Error("png failed")));
    const view = await render(<>
      <ExportToolbar csvItems={[]} figureExportId={'"'} onError={invalidSelectorError} />
      <svg data-export-id="chart" />
      <ExportToolbar csvItems={[]} figureExportId="chart" onFigureExport={rejectedExport} />
    </>);
    const svgButtons = [...view.querySelectorAll("button")].filter(({ textContent }) => textContent === "Export SVG");
    const pngButtons = [...view.querySelectorAll("button")].filter(({ textContent }) => textContent === "Export PNG");

    await click(svgButtons[0]);
    expect(invalidSelectorError).toHaveBeenCalledOnce();
    await click(pngButtons[1]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(rejectedExport).toHaveBeenCalledOnce();
  });

  it("reports synchronous CSV exporter failures and targets the requested SVG for both figure callbacks", async () => {
    const csvError = new Error("csv failed");
    const onError = vi.fn();
    const onFigure = vi.fn();
    const view = await render(<>
      <svg data-export-id="rate-analysis-chart" />
      <ExportToolbar
        csvItems={[{ id: "processed", label: "Processed data", filename: "processed.csv", csv: "a\r\n1" }]}
        figureExportId="rate-analysis-chart"
        figureFilename="rate-capacity"
        onCsvExport={() => { throw csvError; }}
        onFigureExport={onFigure}
        onError={onError}
      />
    </>);
    await click(button(view, "Processed data"));
    expect(onError).toHaveBeenCalledWith(csvError);
    await click(button(view, "Export SVG"));
    await click(button(view, "Export PNG"));
    const target = view.querySelector('svg[data-export-id="rate-analysis-chart"]');
    expect(onFigure).toHaveBeenNthCalledWith(1, target, "svg", "rate-capacity.svg");
    expect(onFigure).toHaveBeenNthCalledWith(2, target, "png", "rate-capacity.png");
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
