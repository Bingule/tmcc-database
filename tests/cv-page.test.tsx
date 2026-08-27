import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { MAX_FILE_BYTES } from "../src/lib/cvParsing";
import { MAX_CHART_OUTPUT_POINTS, MAX_CHART_POINTS } from "../src/pages/CvKineticsPage";
import { makeXlsxFile } from "./xlsx-test-fixture";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
let restoreClipboard: (() => void) | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  restoreClipboard?.();
  restoreClipboard = undefined;
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
  localStorage.clear();
  vi.restoreAllMocks();
});

async function renderPage() {
  await import("../src/pages/CvKineticsPage");
  history.replaceState(null, "", "/tools/cv-kinetics");
  const view = document.createElement("div");
  document.body.appendChild(view);
  root = createRoot(view);
  await act(async () => {
    root!.render(<I18nProvider><App /></I18nProvider>);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

async function uploadFile(view: HTMLElement, file: File, delay = 25) {
  if (!view.querySelector('input[name="cv-layout"]:checked')) {
    await chooseRadio(view, "cv-layout", "sharedPotential");
  }
  const input = view.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, delay));
  });
}

async function upload(view: HTMLElement, contents: string) {
  await uploadFile(view, new File([contents], "cv.csv", { type: "text/csv" }));
}

async function click(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => button.click());
}

async function setValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(view: HTMLElement, label: string) {
  const result = [...view.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label);
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

async function chooseRadio(view: HTMLElement, name: string, value: string) {
  const input = view.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (!input) throw new Error(`Missing radio: ${name}=${value}`);
  await act(async () => input.click());
}

async function setSelect(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function setManualPotentialInterval(view: HTMLElement, millivolts: string) {
  await setSelect(view.querySelector<HTMLSelectElement>('select[name="cv-potential-interval-mode"]')!, "manual");
  await setValue(view.querySelector<HTMLInputElement>('input[name="cv-potential-interval-mv"]')!, millivolts);
}

async function setPotential(view: HTMLElement, value: string) {
  const input = view.querySelector<HTMLInputElement>('input[name="selectedPotential"]');
  if (!input) throw new Error("Missing exact potential input");
  await setValue(input, value);
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function encodeUtf16Le(text: string) {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes.set([0xff, 0xfe]);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    bytes[2 + index * 2] = code & 0xff;
    bytes[3 + index * 2] = code >> 8;
  }
  return bytes;
}

function expectAnalysisInvalidated(view: HTMLElement) {
  expect(view.querySelectorAll("svg")).toHaveLength(0);
  expect(view.querySelectorAll<HTMLButtonElement>(".cv-export button:not(:disabled)")).toHaveLength(0);
}

const csv = [
  "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s",
  "0,3,8,15",
  "0.5,4.5,18,40.5",
  "1,6,32,90",
  "0.5,5.5,22,49.5",
  "0,7,28,63"
].join("\n");
const csvFilenames = ["cv-interpolated-data.csv", "cv-b-value-results.csv", "cv-dunn-k1-k2.csv", "cv-capacitive-current.csv", "cv-diffusion-current.csv", "cv-contribution-summary.csv"];

const completeCycleRows = [
  ["E1", "I1", "E2", "I2", "E3", "I3"],
  [0, 1, 0, 2, 0, 3],
  [1, 2, 1, 4, 1, 6],
  [2, 3, 2, 6, 2, 9],
  [1, 10, 1, 40, 1, 90],
  [0, 10, 0, 20, 0, 30]
] as const;

function completeCycleDelimited(delimiter: string) {
  return completeCycleRows.map((row) => row.join(delimiter)).join("\n");
}

function completeSharedCsv(
  rowCount: number,
  makeCurrents: (potential: number, sourceIndex: number) => number[]
) {
  const peak = Math.floor(rowCount / 2);
  const potentials = [
    ...Array.from({ length: peak + 1 }, (_, index) => index),
    ...Array.from({ length: rowCount - peak - 1 }, (_, index) => peak - index - 1)
  ];
  return [
    "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s",
    ...potentials.map((potential, sourceIndex) =>
      [potential, ...makeCurrents(potential, sourceIndex)].join(","))
  ].join("\n");
}

function proportionalLoopCsv(rowCount: number) {
  return completeSharedCsv(rowCount, (_potential, sourceIndex) => {
    const scale = sourceIndex + 1;
    return [scale, 4 * scale, 9 * scale];
  });
}

const ncpLikeSeries = [
  { rate: 50, potentials: [0.2, 0.6, 1, 0.5, 0.2] },
  { rate: 20, potentials: [0, 0.5, 1, 0.5, 0] },
  { rate: 10, potentials: [0, 0.5, 1, 0.5, 0] },
  { rate: 5, potentials: [0.2, 0.6, 1, 0.5, 0.2] },
  { rate: 2, potentials: [0, 0.5, 1, 0.5, 0] }
] as const;

const ncpLikeRows: Array<Array<string | number | null>> = [
  ncpLikeSeries.flatMap((_, index) => [`电压V`, `电流I${index + 1}`])
];
for (let rowIndex = 0; rowIndex < Math.max(...ncpLikeSeries.map((series) => series.potentials.length)); rowIndex += 1) {
  ncpLikeRows.push(ncpLikeSeries.flatMap((series) => {
    const potential = series.potentials[rowIndex];
    return potential === undefined
      ? [null, null]
      : [potential, Math.sqrt(series.rate) * (2 + potential)];
  }));
}

function ncpLikeDelimited() {
  return ncpLikeRows.map((row) => row.map((cell) => cell ?? "").join(",")).join("\n");
}

function pathXs(path: string) {
  return [...path.matchAll(/[ML]\s+([^\s]+)/g)].map((match) => Number(match[1]));
}

function pathYs(path: string) {
  return [...path.matchAll(/[ML]\s+[^\s]+\s+([^\s]+)/g)].map((match) => Number(match[1]));
}

function qualityCsv() {
  const special = new Map<number, [number, number, number]>([
    [5, [1, 8, 2]],
    [10, [0, 4, 9]]
  ]);
  const potentials = [
    ...Array.from({ length: 21 }, (_, potential) => potential),
    ...Array.from({ length: 20 }, (_, index) => 19 - index)
  ];
  return [
    "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s",
    ...potentials.map((potential) => {
      const currents = special.get(potential) ?? [potential + 1, 4 * (potential + 1), 9 * (potential + 1)];
      return `${potential},${currents.join(",")}`;
    })
  ].join("\n");
}

function lowQualityWorkflowCsv() {
  const scanRates = [1, 4, 9, 16];
  const amplitudes = [1, 10, 2, 20];
  const potentials = [-1, -0.5, 0, -0.5, -1];
  return [
    "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s,Current 16 mV/s",
    ...potentials.map((potential, pointIndex) => [
      potential,
      ...scanRates.map((_, seriesIndex) => amplitudes[seriesIndex]! * (1.5 + potential) + 0.1 * pointIndex)
    ].join(","))
  ].join("\n");
}

describe("CV kinetics page", () => {
  it("renders the advanced Dunn introduction below the unchanged title and above Import Data", async () => {
    const view = await renderPage();
    const title = view.querySelector<HTMLHeadingElement>(".tool-page-header h1")!;
    const subtitle = view.querySelector<HTMLHeadingElement>(".cv-intro-subtitle")!;
    const description = view.querySelector<HTMLElement>(".cv-intro-description")!;
    const benefits = view.querySelector<HTMLElement>(".cv-intro-benefits")!;
    const importSection = view.querySelector<HTMLElement>(".cv-import")!;

    expect(title.textContent).toBe("CV Kinetics Analysis");
    expect(title.closest(".cv-page-header")).not.toBeNull();
    expect(subtitle.textContent).toBe("Advanced R²-Guided Regularized Dunn Analysis");
    expect(description.textContent).toContain("0 <= g(V) <= 1");
    expect(description.querySelector("math, .katex")).toBeNull();
    expect(benefits.textContent).toContain("R²-aware confidence weighting");
    expect(subtitle.compareDocumentPosition(importSection) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

    await click(view, "中文");
    expect(view.querySelector(".cv-intro-subtitle")?.textContent).toBe("高级 R² 引导正则化 Dunn 分析");
    expect(view.querySelector(".cv-intro-benefits")?.textContent).toContain("优势：稳健重构");
  });
  it("requires an explicit layout and parses both upload and Excel paste with selected header handling", async () => {
    const view = await renderPage();
    expect(view.querySelectorAll<HTMLInputElement>('input[name="cv-layout"]:checked')).toHaveLength(0);
    expect(view.querySelector<HTMLInputElement>('input[name="cv-header-mode"][value="header"]')?.checked).toBe(true);
    expect(view.querySelector<HTMLButtonElement>('button[name="cv-analyze"]')?.disabled).toBe(true);

    const input = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File([csv], "cv.csv")] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("Choose a data format");
    expect(view.querySelector(".cv-file-name")?.textContent).toBe("cv.csv");

    await chooseRadio(view, "cv-layout", "sharedPotential");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
    expect(view.textContent).toContain("Current 1 mV/s → 1 mV/s");

    await chooseRadio(view, "cv-header-mode", "data");
    expect(view.querySelector(".cv-file-name")?.textContent).toBe("cv.csv");
    await chooseRadio(view, "cv-header-mode", "header");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
    expect(view.textContent).toContain("Current 1 mV/s → 1 mV/s");

    await chooseRadio(view, "cv-source", "paste");
    await chooseRadio(view, "cv-layout", "pairedPotentialCurrent");
    await chooseRadio(view, "cv-header-mode", "data");
    const textarea = view.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        textarea,
        "0\t1\t0.1\t2\t0.2\t3\n1\t2\t1.1\t3\t1.2\t4"
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(view, "Parse pasted data");
    expect(view.textContent).toContain("X1 / Y1");
    expect(view.textContent).toContain("X3 / Y3");
  });

  it("retains the uploaded file while switching source and reparses it when returning to file mode", async () => {
    const view = await renderPage();
    await chooseRadio(view, "cv-layout", "sharedPotential");
    await uploadFile(view, new File([csv], "retained.csv"));
    expect(view.querySelector(".cv-file-name")?.textContent).toBe("retained.csv");

    await chooseRadio(view, "cv-source", "paste");
    await chooseRadio(view, "cv-source", "file");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));

    expect(view.querySelector(".cv-file-name")?.textContent).toBe("retained.csv");
    expect(view.textContent).toContain("Current 1 mV/s → 1 mV/s");
  });

  it.each([
    ["layout", async (view: HTMLElement) => chooseRadio(view, "cv-layout", "pairedPotentialCurrent")],
    ["header mode", async (view: HTMLElement) => chooseRadio(view, "cv-header-mode", "data")],
    ["scan rates", async (view: HTMLElement) => setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "1, 4, 16")],
    ["potential interval", async (view: HTMLElement) => setManualPotentialInterval(view, "2")],
    ["Dunn confidence mode", async (view: HTMLElement) => chooseRadio(view, "cv-dunn-method", "weighted")],
    ["turning-point trim", async (view: HTMLElement) => setSelect(view.querySelector<HTMLSelectElement>('select[name="cv-turning-trim-mode"]')!, "manual")],
    ["R-squared threshold", async (view: HTMLElement) => setValue(view.querySelector<HTMLInputElement>('input[name="cv-r-squared-threshold"]')!, "0.9")]
  ])("invalidates completed results immediately when %s changes", async (_field, change) => {
    const view = await renderPage();
    await chooseRadio(view, "cv-layout", "sharedPotential");
    await uploadFile(view, new File([csv], "cv.csv"));
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "1, 4, 9");
    await click(view, "Run analysis");
    expect(view.querySelectorAll("svg")).toHaveLength(4);
    expect(view.querySelectorAll<HTMLButtonElement>(".cv-export button:disabled")).toHaveLength(0);

    await change(view);
    expectAnalysisInvalidated(view);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe("");
  });

  it("invalidates completed results when pasted source text changes", async () => {
    const view = await renderPage();
    await chooseRadio(view, "cv-layout", "sharedPotential");
    await chooseRadio(view, "cv-source", "paste");
    const textarea = view.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, csv);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(view, "Parse pasted data");
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "1, 4, 9");
    await click(view, "Run analysis");
    expect(view.querySelectorAll("svg")).toHaveLength(4);

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, `${csv}\n2,9,36,81`);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expectAnalysisInvalidated(view);
    expect(view.textContent).toContain("Parse pasted data");
  });

  it("prevents an older asynchronous file import from overwriting newer settings", async () => {
    const view = await renderPage();
    await chooseRadio(view, "cv-layout", "sharedPotential");
    const resolvers: Array<(value: ArrayBuffer) => void> = [];
    const oldFile = new File(["ignored"], "old.csv");
    Object.defineProperty(oldFile, "arrayBuffer", {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolvers.push(resolve); })
    });
    await uploadFile(view, oldFile, 0);
    await chooseRadio(view, "cv-header-mode", "data");
    await act(async () => {
      resolvers[1](new TextEncoder().encode("0,3,8,15\n0.5,4.5,18,40.5\n1,6,32,90").buffer);
      await Promise.resolve();
    });
    await act(async () => {
      resolvers[0](new TextEncoder().encode(csv).buffer);
      await Promise.resolve();
    });
    expect(view.textContent).toContain("Y1 →");
    expect(view.textContent).not.toContain("Current 1 mV/s →");
  });

  it("imports once, confirms rates, and produces both analyses with exports", async () => {
    const view = await renderPage();
    expect(view.textContent).toContain("CV Kinetics Analysis");
    expect(view.textContent).toContain("Import Data");
    expect(view.querySelector("#cv-point-interval")).toBeNull();
    expect(view.querySelector("#cv-potential-interval-mode")).not.toBeNull();
    expect(view.querySelector("#cv-dunn-method-threshold")).not.toBeNull();
    expect(view.querySelector("#cv-dunn-method-weighted")).not.toBeNull();
    expect(view.querySelector("#cv-turning-trim-mode")).not.toBeNull();
    expect(view.textContent).toContain("Smoothing: Auto");
    expect(view.textContent).toContain(`target up to ${MAX_CHART_POINTS} points per series`);
    expect(view.textContent).toContain(`up to ${MAX_CHART_OUTPUT_POINTS} points per series`);
    await upload(view, csv);
    expect(view.textContent).toContain("Data Preview");
    const rateInput = view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!;
    expect(rateInput.value).toBe("1, 4, 9");
    await setValue(rateInput, "1, 4, 9");
    await click(view, "Run analysis");
    expect(view.textContent).toContain("b-value Analysis");
    expect(view.textContent).toContain("Dunn Analysis");
    expect(view.querySelectorAll("svg")).toHaveLength(4);
    expect(view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')?.value).toBe("1");
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe("0.5");
    expect(view.textContent).toContain("Contribution percentage by scan rate");
    const contributionChart = view.querySelector('[data-export-id="cv-contribution-chart"]')!;
    expect(contributionChart.classList.contains("scientific-stacked-bar-chart-svg")).toBe(true);
    expect([...contributionChart.querySelectorAll('[data-stacked-bar]')].map((bar) => bar.getAttribute("data-x")))
      .toEqual(["1", "4", "9"]);
    expect(contributionChart.querySelectorAll('[data-bar-segment="capacitive"]')).toHaveLength(3);
    expect(contributionChart.querySelectorAll('[data-bar-segment="diffusion"]')).toHaveLength(3);
    expect(contributionChart.querySelector('[data-series-id="capacitive-percent"]')).toBeNull();
    expect(contributionChart.textContent).toMatch(/\d+\.\d{2}%/);
    expect(view.querySelector('[data-table-id="cv-contribution-table"]')).not.toBeNull();
    expect(view.querySelectorAll<HTMLButtonElement>(".cv-export button:disabled")).toHaveLength(0);
    expect([...view.querySelectorAll<HTMLButtonElement>(".cv-export button")].filter((button) => button.textContent?.endsWith(".csv")).map((button) => button.textContent)).toEqual(csvFilenames);
    expect([...view.querySelectorAll<HTMLButtonElement>(".cv-export button")].filter((button) => /\.(svg|png)$/.test(button.textContent ?? ""))).toHaveLength(8);
    await click(view, "中文");
    expect(view.textContent).toContain("CV 动力学分析");
    expect(view.textContent).toContain("Dunn 分析");
    expect(view.textContent).toContain("电位间隔");
    expect(view.textContent).toContain("R² 加权");
    expect(view.textContent).toContain("转折点裁剪");
    expect(view.textContent).toContain("平滑：自动");
    expect(view.querySelector('[data-export-id="cv-contribution-chart"] title')?.textContent).toContain("贡献百分比");
    const zhSummary = view.querySelector('[data-quality-summary="true"]')?.textContent ?? "";
    expect(zhSummary).toContain("电位间隔 自动");
    expect(zhSummary).toContain("裁剪 自动");
    expect(zhSummary).not.toMatch(/(?:电位间隔|裁剪)\s*auto/i);
    const zhChartMetadata = view.querySelector('[data-export-id="cv-b-chart"] [data-chart-metadata="true"]')?.textContent ?? "";
    expect(zhChartMetadata).toContain("取点间隔 = 自动");
    expect(zhChartMetadata).not.toMatch(/取点间隔\s*=\s*auto/i);
    const zhDunnRecords = view.querySelector('[data-table-id="cv-dunn-records-table"]')?.textContent ?? "";
    expect(zhDunnRecords).toContain("已裁剪");
    expect(zhDunnRecords).not.toContain("Trimmed");
    expect(view.textContent).toContain(`目标为每个序列最多 ${MAX_CHART_POINTS} 个点`);
    expect(view.textContent).toContain(`最多可增加到每个序列 ${MAX_CHART_OUTPUT_POINTS} 个点`);
    expect(view.querySelectorAll("svg")).toHaveLength(4);
    await click(view, "EN");
    expect(view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')?.value).toBe("1");
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe("0.5");
  });

  it("localizes validation and keeps exports disabled before valid analysis", async () => {
    const view = await renderPage();
    expect(view.querySelectorAll<HTMLButtonElement>(".cv-export button:disabled").length).toBeGreaterThan(0);
    await upload(view, "Potential,Current 1 mV/s\n0,1\n1,2");
    await click(view, "Run analysis");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("3 to 20");
    await click(view, "中文");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("3–20");
  });

  it.each([
    ["CSV", () => new File([csv], "equivalent.csv", { type: "text/csv" })],
    ["UTF-16 TXT", () => new File([encodeUtf16Le(csv.replaceAll(",", "\t"))], "equivalent.txt", { type: "text/plain" })],
    ["XLSX", () => makeXlsxFile([
      ["Potential", "Current 1 mV/s", "Current 4 mV/s", "Current 9 mV/s"],
      [0, 3, 8, 15],
      [0.5, 4.5, 18, 40.5],
      [1, 6, 32, 90],
      [0.5, 5.5, 22, 49.5],
      [0, 7, 28, 63]
    ], "equivalent.xlsx")]
  ])("runs visible b-value and Dunn results from %s import", async (_format, makeFile) => {
    const view = await renderPage();
    await uploadFile(view, makeFile());

    expect(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')?.value).toBe("1, 4, 9");
    expect(view.querySelectorAll(".cv-preview tbody tr")).toHaveLength(5);
    await click(view, "Run analysis");
    expect(view.querySelectorAll('[data-table-id="cv-b-records-table"] tbody tr').length).toBeGreaterThan(0);
    expect(view.querySelectorAll('[data-table-id="cv-dunn-records-table"] tbody tr').length).toBeGreaterThan(0);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe("");
  });

  it.each([
    ["CSV", () => new File([completeCycleDelimited(",")], "complete-cycle.csv", { type: "text/csv" })],
    ["UTF-16 TXT", () => new File([encodeUtf16Le(completeCycleDelimited("\t"))], "complete-cycle.txt", { type: "text/plain" })],
    ["XLSX", () => makeXlsxFile(completeCycleRows.map((row) => [...row]), "complete-cycle.xlsx")]
  ])("presents equivalent complete forward/reverse CV results from %s in branch traversal order", async (_format, makeFile) => {
    const view = await renderPage();
    await chooseRadio(view, "cv-layout", "pairedPotentialCurrent");
    await uploadFile(view, makeFile());
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "1, 4, 9");
    await click(view, "Run analysis");

    const originalRows = [...view.querySelectorAll<HTMLTableRowElement>('[data-table-id="cv-original-current-table"] tbody tr')];
    expect(originalRows.map((row) => row.cells[0].textContent)).toEqual(["0", "1", "2", "1", "0"]);
    expect(view.querySelector('[data-quality-summary="true"]')?.textContent).toContain("0–2 V");

    const bTable = view.querySelector('[data-table-id="cv-b-records-table"]')!;
    const dunnTable = view.querySelector('[data-table-id="cv-dunn-records-table"]')!;
    expect(bTable.querySelector("thead")?.textContent).toContain("Sweep branch");
    expect(dunnTable.querySelector("thead")?.textContent).toContain("Sweep branch");
    expect([...bTable.querySelectorAll<HTMLTableRowElement>("tbody tr")].map((row) => [row.cells[0].textContent, row.cells[1].textContent])).toEqual([
      ["0", "Forward sweep"], ["1", "Forward sweep"], ["2", "Forward sweep"], ["1", "Reverse sweep"], ["0", "Reverse sweep"]
    ]);
    expect([...dunnTable.querySelectorAll<HTMLTableRowElement>("tbody tr")].map((row) => [row.cells[0].textContent, row.cells[1].textContent])).toEqual([
      ["0", "Branch 1"], ["1", "Branch 1"], ["2", "Branch 1"], ["0", "Branch 2"], ["1", "Branch 2"], ["2", "Branch 2"]
    ]);

    const originalPath = view.querySelector<SVGPathElement>('[data-series-id="original"]')!;
    expect(originalPath.getAttribute("data-render-point-count")).toBe("5");
    const originalXs = pathXs(originalPath.getAttribute("d") ?? "");
    expect(originalXs).toHaveLength(5);
    expect(originalXs[3]).toBeLessThan(originalXs[2]);
    expect(originalXs[4]).toBeLessThan(originalXs[3]);
    expect(view.querySelector('[data-series-id="reconstructed-total"]')).toBeNull();
    const chart = view.querySelector('[data-export-id="cv-dunn-chart"]')!;
    const capacitiveAreas = [...chart.querySelectorAll<SVGPathElement>('[data-polygon-series-id="capacitive-area"]')];
    const diffusionAreas = [...chart.querySelectorAll<SVGPathElement>('[data-polygon-series-id="diffusion-area"]')];
    expect(capacitiveAreas).toHaveLength(1);
    expect(diffusionAreas).toHaveLength(2);
    expect(chart.querySelector('[data-area-series-id="excluded-area"]')).toBeNull();
    expect(chart.querySelectorAll('[data-series-id="capacitive-forward"], [data-series-id="capacitive-reverse"]')).toHaveLength(2);
    const capacitiveForwardXs = pathXs(chart.querySelector<SVGPathElement>('[data-series-id="capacitive-forward"]')?.getAttribute("d") ?? "");
    const capacitiveReverseXs = pathXs(chart.querySelector<SVGPathElement>('[data-series-id="capacitive-reverse"]')?.getAttribute("d") ?? "");
    expect(capacitiveForwardXs).toHaveLength(3);
    expect(capacitiveReverseXs).toHaveLength(2);
    expect(capacitiveForwardXs).toEqual([...capacitiveForwardXs].sort((left, right) => left - right));
    expect(capacitiveReverseXs).toEqual([...capacitiveReverseXs].sort((left, right) => right - left));
    expect(capacitiveAreas.map((path) => path.dataset.renderPointCount)).toEqual(["5"]);
    expect(diffusionAreas.map((path) => path.dataset.renderPointCount)).toEqual(["6", "4"]);
    const bForwardPath = view.querySelector<SVGPathElement>('[data-series-id="b-values"]')!;
    const bReversePath = view.querySelector<SVGPathElement>('[data-series-id="b-values-reverse"]')!;
    expect(bForwardPath.getAttribute("data-render-point-count")).toBe("3");
    expect(bReversePath.getAttribute("data-render-point-count")).toBe("2");
    expect(pathXs(bForwardPath.getAttribute("d") ?? "")).toHaveLength(3);
    expect(pathXs(bReversePath.getAttribute("d") ?? "")).toHaveLength(2);

    await setPotential(view, "1");
    expect(view.querySelector<HTMLTableRowElement>('[data-table-id="cv-selected-b-record-table"] tbody tr')?.cells[1].textContent).toBe("Forward sweep");
    expect(view.querySelector<HTMLTableRowElement>('[data-table-id="cv-selected-b-record-table"] tbody tr')?.cells[2].textContent).toBe("0.5");
    await click(view, "Next potential");
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe("2");
    await click(view, "Next potential");
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe("1");
    expect(view.querySelector<HTMLTableRowElement>('[data-table-id="cv-selected-b-record-table"] tbody tr')?.cells[1].textContent).toBe("Reverse sweep");
    expect(view.querySelector<HTMLTableRowElement>('[data-table-id="cv-selected-b-record-table"] tbody tr')?.cells[2].textContent).toBe("1");

    const bBranchOne = view.querySelector<SVGCircleElement>('[data-export-id="cv-b-chart"] [data-point-id="1"]')!;
    const bBranchTwo = view.querySelector<SVGCircleElement>('[data-export-id="cv-b-chart"] [data-point-id="3"]')!;
    expect(bBranchOne.getAttribute("aria-label")).toContain("Forward sweep");
    expect(bBranchTwo.getAttribute("aria-label")).toContain("Reverse sweep");
    expect(bBranchTwo.getAttribute("aria-label")).not.toBe(bBranchOne.getAttribute("aria-label"));
    await act(async () => bBranchTwo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(view.querySelector('[data-export-id="cv-b-chart"] [data-selected-point-id="3"]')).not.toBeNull();
    expect(view.querySelector<HTMLTableRowElement>('[data-table-id="cv-selected-b-record-table"] tbody tr')?.cells[1].textContent).toBe("Reverse sweep");
    await setPotential(view, "1");
    await act(async () => bBranchTwo.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(view.querySelector('[data-export-id="cv-b-chart"] [data-selected-point-id="3"]')).not.toBeNull();
    expect(view.querySelector<HTMLTableRowElement>('[data-table-id="cv-selected-b-record-table"] tbody tr')?.cells[1].textContent).toBe("Reverse sweep");

    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    restoreClipboard = () => {
      if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    };
    const toolbar = bTable.closest(".cv-result-table-block")?.querySelector<HTMLElement>(".cv-table-copy-toolbar")!;
    await act(async () => toolbar.querySelector<HTMLInputElement>('input[value="1"]')!.click());
    await act(async () => toolbar.querySelector<HTMLButtonElement>("button")!.click());
    expect(writeText.mock.calls[0][0]).toBe("Sweep branch\r\nForward sweep\r\nForward sweep\r\nForward sweep\r\nReverse sweep\r\nReverse sweep");

    const blobs: Blob[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return `blob:${blobs.length}`; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await click(view, "cv-b-value-results.csv");
    await click(view, "cv-dunn-k1-k2.csv");
    const [bCsv, dunnCsv] = await Promise.all(blobs.map(readBlob));
    expect(bCsv).toContain("Potential (V),Sweep branch,");
    expect(bCsv.split("\r\n")).toHaveLength(6);
    expect(bCsv.split("\r\n").slice(1).map((row) => row.split(",").slice(0, 2))).toEqual([
      ["0", "Forward sweep"], ["1", "Forward sweep"], ["2", "Forward sweep"], ["1", "Reverse sweep"], ["0", "Reverse sweep"]
    ]);
    expect(dunnCsv).toContain("Scan rate (mV/s),Potential (V),Sweep branch,");
    expect(dunnCsv.split("\r\n")).toHaveLength(19);
    expect(dunnCsv.split("\r\n").slice(1, 7).map((row) => row.split(",").slice(0, 3))).toEqual([
      ["1", "0", "Branch 1"], ["1", "1", "Branch 1"], ["1", "2", "Branch 1"],
      ["1", "0", "Branch 2"], ["1", "1", "Branch 2"], ["1", "2", "Branch 2"]
    ]);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe("");
  });

  it.each([
    ["CSV", () => new File([ncpLikeDelimited()], "ncp-cycle.csv", { type: "text/csv" })],
    ["XLSX", () => makeXlsxFile(ncpLikeRows, "ncp-cycle.xlsx")]
  ])("runs analysis for %s cycles with mixed seam starts and same-direction plateaus", async (_format, makeFile) => {
    const view = await renderPage();
    await chooseRadio(view, "cv-layout", "pairedPotentialCurrent");
    await uploadFile(view, makeFile());
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "50, 20, 10, 5, 2");
    await click(view, "Run analysis");

    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe("");
    expect(view.querySelectorAll('[data-table-id="cv-b-records-table"] tbody tr').length).toBeGreaterThan(0);
    expect(view.querySelectorAll('[data-table-id="cv-dunn-records-table"] tbody tr').length).toBeGreaterThan(0);
    await setSelect(view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')!, "50");
    expect([...view.querySelectorAll<HTMLTableRowElement>('[data-table-id="cv-original-current-table"] tbody tr')]
      .map((row) => row.cells[0].textContent)).toEqual(["0.2", "0.6", "1", "0.5", "0.2"]);
  });

  it("displays only the complete cycle selected by analysis when the upload has an incomplete tail", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,2,3\n1,2,4,6\n2,4,8,12\n1,2,4,6\n0,1,2,3\n1,99,99,99");
    await click(view, "Run analysis");

    expect([...view.querySelectorAll<HTMLTableRowElement>('[data-table-id="cv-original-current-table"] tbody tr')]
      .map((row) => row.cells[0].textContent)).toEqual(["0", "1", "2", "1", "0"]);
    expect(view.querySelector('[data-series-id="original"]')?.getAttribute("data-render-point-count")).toBe("5");
  });

  it("reconnects capacitive boundaries to the selected curve's true turning endpoints", async () => {
    const view = await renderPage();
    await chooseRadio(view, "cv-layout", "pairedPotentialCurrent");
    await upload(view, [
      "V1,Current 1 mV/s,V2,Current 4 mV/s,V3,Current 9 mV/s",
      "0,1,0.1,2,0.2,3",
      "0.5,2,0.55,4,0.6,6",
      "1,3,1,6,1,9",
      "1.5,2,1.45,4,1.4,6",
      "2,1,1.9,2,1.8,3",
      "1.5,-2,1.45,-4,1.4,-6",
      "1,-3,1,-6,1,-9",
      "0.5,-2,0.55,-4,0.6,-6",
      "0,-1,0.1,-2,0.2,-3"
    ].join("\n"));
    await click(view, "Run analysis");

    const chart = view.querySelector('[data-export-id="cv-dunn-chart"]')!;
    const originalXs = pathXs(chart.querySelector<SVGPathElement>('[data-series-id="original"]')?.getAttribute("d") ?? "");
    const boundaryXs = ["capacitive-forward", "capacitive-reverse"].flatMap((id) =>
      pathXs(chart.querySelector<SVGPathElement>(`[data-series-id="${id}"]`)?.getAttribute("d") ?? ""));
    expect(Math.min(...boundaryXs)).toBeCloseTo(Math.min(...originalXs), 10);
    expect(Math.max(...boundaryXs)).toBeCloseTo(Math.max(...originalXs), 10);
  });

  it("retains quality counts when every R-squared value is below 0.95", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,100,2\n0.5,2,200,4\n1,3,300,6\n0.5,2,200,4\n0,1,100,2");
    await click(view, "Run analysis");

    const bRows = view.querySelectorAll('[data-table-id="cv-b-records-table"] tbody tr');
    const dunnRows = view.querySelectorAll('[data-table-id="cv-dunn-records-table"] tbody tr');
    expect(bRows).toHaveLength(5);
    expect(dunnRows).toHaveLength(6);
    expect(view.querySelector('[data-table-id="cv-contribution-table"]')).not.toBeNull();
    expect(view.querySelector('[aria-live="polite"]')?.textContent).not.toContain("No b-value fit");
    expect([...view.querySelectorAll<HTMLSelectElement>('select[name="selectedRate"] option')].map((item) => item.value)).toEqual(["1", "4", "9"]);
    expect(view.querySelector('[data-series-id="original"]')?.getAttribute("data-render-point-count")).toBe("5");
    expect(view.querySelector('[data-area-series-id="excluded-area"]')).toBeNull();
    expect(view.querySelector('[data-dunn-coverage="true"]')?.textContent).toContain("2 / 6 points (33.33333%)");
    expect(button(view, "Export SVG — cv-dunn-chart.svg").disabled).toBe(false);

    await click(view, "中文");
    expect(view.querySelector('[data-quality-summary="true"]')?.textContent).toContain("5 个排除");
  });

  it("shows a genuine analysis failure immediately beside the Run analysis action", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,0,0,0\n1,0,0,0\n0,0,0,0");
    await click(view, "Run analysis");

    const analyze = button(view, "Run analysis");
    const status = analyze.nextElementSibling;
    expect(status?.classList.contains("tool-validation")).toBe(true);
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toContain("No b-value fit");
  });

  it.each([
    ["duplicate", csv, "unique", async (view: HTMLElement) => {
      await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "1, 1, 9");
    }, false],
    ["zero currents", "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,0,0,0\n1,0,0,0\n0,0,0,0", "No b-value fit", async () => {}],
    ["no overlap", "E1,Current 1 mV/s,E2,Current 4 mV/s,E3,Current 9 mV/s\n0,1,2,3,4,5\n1,2,3,4,5,6\n0,1,2,3,4,5", "no overlapping", async (view: HTMLElement) => {
      await chooseRadio(view, "cv-layout", "pairedPotentialCurrent");
    }, true]
  ] as const)("reports %s analysis errors", async (_name, contents, expected, prepare, prepareBeforeUpload = false) => {
    const view = await renderPage();
    if (prepareBeforeUpload) await prepare(view);
    await upload(view, contents);
    if (!prepareBeforeUpload) await prepare(view);
    await click(view, "Run analysis");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain(expected);
    expect(view.querySelectorAll<HTMLButtonElement>(".cv-export button:disabled").length).toBeGreaterThan(0);
  });

  it("reports malformed files during import", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 2 mV/s\n0,1,2\n1,2");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("malformed");
  });

  it("localizes safe resource-limit errors", async () => {
    const view = await renderPage();
    const file = new File(["Potential,1,2\n0,1,2"], "oversized.csv");
    Object.defineProperty(file, "size", { value: MAX_FILE_BYTES + 1 });
    await uploadFile(view, file);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("safe browser processing limit");
    await click(view, "中文");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("浏览器安全处理上限");
  });

  it("uses an exact accessible potential selection and discloses missing b fits", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,0,0,0\n0.5,2,8,18\n1,3,6,9\n0.5,2,8,18\n0,0,0,0");
    await click(view, "Run analysis");
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.type).toBe("number");
    expect(view.querySelector('select[name="selectedPotential"]')).toBeNull();
    expect(view.textContent).toContain("Missing b-value fits: 2 of 5 potential points");
    expect(view.querySelector('[data-export-id="cv-dunn-chart"] [data-selected-x="0.5"]')).not.toBeNull();
    expect(view.querySelector('[data-export-id="cv-fit-chart"]')?.textContent).toContain("log(|current|)");
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return "blob:fit"; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await click(view, "cv-b-value-results.csv");
    const exported = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs[0]); });
    expect(exported).toContain("0,Forward sweep,,,,,Zero-current logarithm unavailable");
  });

  it("rounds the selected potential for display while retaining a grid-backed selection", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0.123456789,1,4,9\n0.5,2,8,18\n1,3,12,27\n0.5,2,8,18\n0.123456789,1,4,9");
    await click(view, "Run analysis");

    const displayed = view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value ?? "";
    expect(displayed).toMatch(/^-?\d+(?:\.\d{1,4})?$/);
    await click(view, "Next potential");
    await click(view, "Previous potential");
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe(displayed);
    expect(view.querySelector('[data-export-id="cv-b-chart"] [data-selected-point-id]')).not.toBeNull();
  });

  it("maps exact potential and rate selections to signed publication-style Dunn areas", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,6,15\n0.5,4,10,18\n1,-1,-4,-9\n0.5,4,10,18\n0,1,6,15");
    await click(view, "Run analysis");
    const rate = view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')!;
    await setPotential(view, "1");
    await act(async () => { rate.value = "9"; rate.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(view.querySelector('[data-export-id="cv-fit-chart"] [data-selected-x]')).toBeNull();
    expect(view.querySelector('[data-export-id="cv-dunn-chart"] [data-selected-x="1"]')).not.toBeNull();
    const rows = [...view.querySelectorAll<HTMLTableRowElement>('[data-table-id="cv-dunn-current-table"] tbody tr')];
    const selected = rows.find((row) => row.cells[0].textContent === "1")!;
    expect([...selected.cells].map((cell) => cell.textContent)).toEqual(["1", "-9", "-9", "-4.5", "-4.5"]);
    const chart = view.querySelector('[data-export-id="cv-dunn-chart"]')!;
    expect(chart.querySelectorAll('[data-series-id]')).toHaveLength(3);
    expect(chart.querySelector('[data-series-id="original"]')?.getAttribute("data-render-point-count")).toBe("6");
    expect(chart.querySelector('[data-series-id="reconstructed-total"]')).toBeNull();
    expect(chart.querySelectorAll('[data-series-id="capacitive-forward"], [data-series-id="capacitive-reverse"]')).toHaveLength(2);
    expect(chart.querySelector('[data-series-id="capacitive"]')).toBeNull();
    expect(chart.querySelector('[data-series-id="diffusion"]')).toBeNull();
    expect(chart.querySelectorAll('[data-area-series-id="capacitive-area"]')).toHaveLength(1);
    expect(chart.querySelectorAll('[data-area-series-id="diffusion-area"]')).toHaveLength(2);
    expect(chart.querySelector('[data-area-series-id="excluded-area"]')).toBeNull();
    expect(view.querySelector('[data-dunn-coverage="true"]')?.textContent).toContain("2 / 6 points (33.33333%)");
  });

  it("keeps the full measured loop and continuous Dunn areas when interior R-squared is low", async () => {
    const view = await renderPage();
    await upload(view, [
      "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s",
      "0,1,4,9",
      "1,2,8,18",
      "2,1,8,2",
      "1,2,8,18",
      "0,1,4,9"
    ].join("\n"));
    await click(view, "Run analysis");

    const chart = view.querySelector('[data-export-id="cv-dunn-chart"]')!;
    expect(chart.querySelector('[data-series-id="original"]')?.getAttribute("data-render-point-count")).toBe("5");
    expect(chart.querySelectorAll('[data-area-series-id="capacitive-area"]')).toHaveLength(1);
    expect(chart.querySelector('[data-area-series-id="excluded-area"]')).toBeNull();
    expect(chart.querySelectorAll('[data-area-series-id="diffusion-area"]')).toHaveLength(2);
    expect(chart.querySelectorAll('[data-series-id="capacitive-forward"], [data-series-id="capacitive-reverse"]')).toHaveLength(2);
    expect(view.querySelector('[data-dunn-coverage="true"]')?.textContent).toContain("2 / 6 points (33.33333%)");
    expect(view.querySelectorAll('[data-table-id="cv-dunn-records-table"] tbody tr')).toHaveLength(6);
    expect([...view.querySelectorAll<HTMLButtonElement>('.cv-export button')].filter((item) => item.textContent?.endsWith(".csv"))).toHaveLength(6);

    await click(view, "中文");
    expect(view.querySelector('[data-dunn-coverage="true"]')?.textContent).toContain("2 / 6 个点（33.33333%）");
    expect(chart.querySelector('[data-chart-legend="true"]')?.textContent).not.toContain("低于 R² 阈值／不可用");
  });

  it("clears stale validation on edit and ignores an older import finishing last", async () => {
    const view = await renderPage();
    await upload(view, csv);
    const rates = view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!;
    await setValue(rates, "1, 1, 9");
    await click(view, "Run analysis");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("unique");
    await setValue(rates, "1, 4, 9");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe("");

    let resolveOld!: (value: ArrayBuffer) => void;
    const oldFile = new File(["ignored"], "old.csv");
    Object.defineProperty(oldFile, "arrayBuffer", { value: () => new Promise<ArrayBuffer>((resolve) => { resolveOld = resolve; }) });
    await uploadFile(view, oldFile, 0);
    await upload(view, "Potential,Current 2 mV/s,Current 8 mV/s,Current 18 mV/s\n0,2,8,18\n1,4,16,36\n0,2,8,18");
    await act(async () => {
      resolveOld(new TextEncoder().encode("Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,4,9\n1,2,8,18").buffer);
      await Promise.resolve();
    });
    expect(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')?.value).toBe("2, 8, 18");
  });

  it("exports localized CSV schemas and reports asynchronous PNG failures", async () => {
    const view = await renderPage();
    await upload(view, csv);
    await click(view, "Run analysis");
    const blobs: Blob[] = [];
    const downloaded: string[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return `blob:${blobs.length}`; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloaded.push(this.download); });
    for (const filename of csvFilenames) await click(view, filename);
    expect(downloaded).toEqual(csvFilenames);
    const english = await Promise.all(blobs.map((blob) => new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); })));
    expect(english[0]).toContain("Potential (V),Total current (arb. units) at 1 mV/s");
    expect(english[1]).toContain("Potential (V),Sweep branch,b value,Intercept,R²,Point count,Fit status");
    expect(english[2]).toContain("Scan rate (mV/s),Potential (V),Sweep branch,k1,k2,R²,Point count,Fit status,Local capacitive fraction,Local confidence");
    expect(english[3]).toContain("Scan rate (mV/s),Ordered sequence index,Original source index,Sweep branch,Potential (V),Original measured current (arb. units),g(V),Capacitive contribution,Maximum absolute containment overshoot");
    expect(english[4]).toContain("Scan rate (mV/s),Ordered sequence index,Original source index,Sweep branch,Potential (V),Original measured current (arb. units),g(V),Diffusion-controlled contribution,Maximum absolute containment overshoot");
    expect(english[5]).toContain("Scan rate (mV/s),Capacitive contribution (%),Diffusion-controlled contribution (%)");
    await click(view, "中文");
    await click(view, "cv-b-value-results.csv");
    const chinese = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs[6]); });
    expect(chinese).toContain("电位 (V),扫描分支,b 值");
    expect(chinese).toContain("拟合状态");

    class FailingImage { onload: null | (() => void) = null; onerror: null | (() => void) = null; set src(_value: string) { queueMicrotask(() => this.onerror?.()); } }
    vi.stubGlobal("Image", FailingImage);
    const png = [...view.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("cv-b-chart.png"))!;
    await act(async () => { png.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("导出失败");
  });

  it("keeps b-value threshold filtering while retaining Dunn fit traceability", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    restoreClipboard = () => {
      if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    };
    const view = await renderPage();
    await upload(view, qualityCsv());
    await setManualPotentialInterval(view, "5000");
    await click(view, "Run analysis");

    const summary = view.querySelector('[data-quality-summary="true"]')?.textContent ?? "";
    expect(summary).toContain("XYYYYY");
    expect(summary).toContain("File upload");
    expect(summary).toContain("3 curves");
    expect(summary).toContain("1, 4, 9 mV/s");
    expect(summary).toContain("0–20 V");
    expect(summary).toContain("5 points");
    expect(summary).toContain("9 retained");
    expect(summary).toContain("interval 5000 mV");
    expect(summary).toContain("R² ≥ 0.95");
    expect(summary).toContain("5 valid / 2 excluded / 2 unavailable");
    expect(summary).toContain("6 valid / 0 excluded / 4 unavailable");
    expect(summary).toContain("6 / 10");
    expect(summary).toContain("60%");
    expect(view.querySelector('[data-dunn-diagnostics="true"]')?.textContent).toContain("Only three scan rates");

    const bTable = view.querySelector('[data-table-id="cv-b-records-table"]')!;
    const dunnTable = view.querySelector('[data-table-id="cv-dunn-records-table"]')!;
    expect(bTable.querySelector("thead")?.textContent).toContain("Fit status");
    expect(dunnTable.querySelector("thead")?.textContent).toContain("Fit status");
    expect(bTable.querySelectorAll("tbody tr")).toHaveLength(9);
    expect(dunnTable.querySelectorAll("tbody tr")).toHaveLength(10);

    expect([...bTable.querySelectorAll<HTMLTableRowElement>("tbody tr")].some((row) => row.cells[0].textContent === "5")).toBe(true);
    expect([...dunnTable.querySelectorAll<HTMLTableRowElement>("tbody tr")].some((row) => row.cells[0].textContent === "5")).toBe(true);
    const unavailableRow = [...bTable.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((row) => row.cells[0].textContent === "10")!;
    expect([...unavailableRow.cells].slice(2, 6).map((cell) => cell.textContent)).toEqual(["—", "—", "—", "—"]);
    expect(unavailableRow.textContent).toContain("Zero-current logarithm unavailable");

    expect(view.querySelector('select[name="selectedPotential"]')).toBeNull();
    await setPotential(view, "5");
    expect(view.querySelector('[data-selected-fit-status="true"]')?.textContent).toContain("Below R² threshold");
    await setPotential(view, "0");
    await click(view, "Next potential");
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe("5");
    expect(view.querySelector('[data-export-id="cv-b-chart"] [data-selected-point-id="1"]')).not.toBeNull();
    expect((view.querySelector('path[data-series-id="b-values"]')?.getAttribute("d") ?? "").match(/\bM\b/g)).toHaveLength(2);

    const toolbar = bTable.closest('.cv-result-table-block')?.querySelector<HTMLElement>('.cv-table-copy-toolbar')!;
    await act(async () => toolbar.querySelector<HTMLInputElement>('input[value="0"]')!.click());
    await act(async () => toolbar.querySelector<HTMLButtonElement>('button')!.click());
    expect((writeText.mock.calls[0][0] as string).split("\r\n").some((row) => row === "5")).toBe(true);

    const blobs: Blob[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return `blob:filtered-${blobs.length}`; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await click(view, "cv-b-value-results.csv");
    await click(view, "cv-dunn-k1-k2.csv");
    expect((await readBlob(blobs[0])).split("\r\n").some((row) => row.startsWith("5,"))).toBe(true);
    expect((await readBlob(blobs[1])).split("\r\n").some((row) => row.includes(",5,Branch"))).toBe(true);

    const contributionTable = view.querySelector('[data-table-id="cv-contribution-table"]')!;
    expect(contributionTable.querySelector("thead")?.textContent).toContain("Valid / sampled points");
    expect(contributionTable.querySelector("thead")?.textContent).toContain("Coverage");
    expect(contributionTable.textContent).toContain("6 / 10");

    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-r-squared-threshold"]')!, "0");
    await click(view, "Run analysis");
    expect(view.querySelectorAll('[data-table-id="cv-b-records-table"] tbody tr')).toHaveLength(9);
    expect(view.querySelectorAll('[data-table-id="cv-dunn-records-table"] tbody tr')).toHaveLength(10);
    expect([...view.querySelectorAll<HTMLTableRowElement>('[data-table-id="cv-b-records-table"] tbody tr')]
      .find((row) => row.cells[0].textContent === "5")?.cells[2].textContent).not.toBe("—");
  });

  it("keeps the threshold editable in weighted mode and preserves b-value filtering", async () => {
    const view = await renderPage();
    await upload(view, lowQualityWorkflowCsv());
    await click(view, "Run analysis");

    const thresholdInput = view.querySelector<HTMLInputElement>('input[name="cv-r-squared-threshold"]')!;
    const thresholdStatuses = [...view.querySelectorAll<HTMLTableRowElement>('[data-table-id="cv-b-records-table"] tbody tr')]
      .map((row) => row.cells[6].textContent);
    expect(thresholdInput.value).toBe("0.95");
    expect(view.querySelector<HTMLInputElement>('input[name="cv-dunn-method"][value="threshold"]')?.checked).toBe(true);

    await chooseRadio(view, "cv-dunn-method", "weighted");
    expect(thresholdInput.disabled).toBe(false);
    expect(thresholdInput.value).toBe("0.95");
    await click(view, "Run analysis");

    const weightedStatuses = [...view.querySelectorAll<HTMLTableRowElement>('[data-table-id="cv-b-records-table"] tbody tr')]
      .map((row) => row.cells[6].textContent);
    expect(weightedStatuses).toEqual(thresholdStatuses);
    expect(view.querySelector('[data-quality-summary="true"]')?.textContent).toContain("R² weighted");
    expect(view.querySelector('[data-dunn-diagnostics="true"]')?.textContent).toContain("Low fit quality");

    await click(view, "中文");
    expect(view.textContent).toContain("R² 加权");
    expect(view.textContent).toContain("拟合质量偏低");
  });

  it("localizes complete-cycle structure errors from a real upload and analysis run", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,2,3\n1,2,4,6\n0,1,2,3\n1,2,4,6\n0,1,2,3");
    await click(view, "Run analysis");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("Each dataset must be one complete CV cycle");
    await click(view, "中文");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("每组数据必须是一个完整 CV 周期");
  });

  it("exports exactly six bilingual audit-ready CSVs and embeds current settings in SVG and PNG", async () => {
    const view = await renderPage();
    await upload(view, qualityCsv());
    await setManualPotentialInterval(view, "5000");
    await click(view, "Run analysis");
    const blobs: Blob[] = [];
    const downloaded: string[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return `blob:${blobs.length}`; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloaded.push(this.download); });

    for (const filename of csvFilenames) await click(view, filename);
    expect(downloaded).toEqual(csvFilenames);
    expect([...view.querySelectorAll<HTMLButtonElement>('.cv-export button')].filter((button) => button.textContent?.endsWith(".csv"))).toHaveLength(6);
    const exported = await Promise.all(blobs.map(readBlob));
    expect(exported[0].split("\r\n")[0]).toContain("Data layout: XYYYYY");
    expect(exported[0].split("\r\n")[0]).toContain("Requested interval: 5000 mV");
    expect(exported[0].split("\r\n")[0]).toContain("Resolved interval: 5000 mV");
    expect(exported[1]).toContain("Fit status,Data layout,Data source,Requested interval,Resolved interval,Dunn method,R² threshold,Requested turning point trim,Resolved turning point trim,Smoothing,Common potential range (V),Forward median R²,Reverse median R²,Dunn coverage (%)");
    expect(exported[1]).toContain("5,Forward sweep");
    expect(exported[1]).toContain("10,Forward sweep,,,,,Zero-current logarithm unavailable");
    expect(exported[2]).toContain("Scan rate (mV/s),Potential (V),Sweep branch,k1,k2,R²,Point count,Fit status,Local capacitive fraction,Local confidence,Data layout,Data source,Requested interval,Resolved interval,Dunn method,R² threshold,Requested turning point trim,Resolved turning point trim,Smoothing,Common potential range (V),Forward median R²,Reverse median R²,Dunn coverage (%)");
    expect(exported[2]).toContain("1,0,Branch 1,");
    expect(exported[3].split("\r\n")[0]).toContain("Resolved interval");
    expect(exported[3].split("\r\n")[0]).toContain("g(V)");
    expect(exported[3].split("\r\n")[0]).toContain("Capacitive contribution");
    expect(exported[3].split("\r\n")[0]).toContain("Maximum absolute containment overshoot");
    expect(exported[4].split("\r\n")[0]).toContain("R² threshold");
    expect(exported[4].split("\r\n")[0]).toContain("g(V)");
    expect(exported[4].split("\r\n")[0]).toContain("Diffusion-controlled contribution");
    expect(exported[4].split("\r\n")[0]).toContain("Maximum absolute containment overshoot");
    expect(exported[5]).toContain("Valid points,Sampled points,Coverage (%),Contribution status,Data layout,Data source,Requested interval,Resolved interval,Dunn method,R² threshold,Requested turning point trim,Resolved turning point trim,Smoothing,Common potential range (V),Forward median R²,Reverse median R²,Dunn coverage (%)");
    expect(exported[5]).toContain(",6,10,60,Available,XYYYYY,File upload,5000 mV,5000 mV,R² threshold,0.95,Auto,100 mV");

    await click(view, "中文");
    await click(view, "cv-b-value-results.csv");
    const chinese = await readBlob(blobs[6]);
    expect(chinese).toContain("拟合状态,数据格式,数据来源,请求间隔,解析间隔,Dunn 方法,R² 阈值,请求转折点裁剪,解析转折点裁剪");
    expect(chinese).toContain("5,正向扫描");

    await click(view, "EN");
    await click(view, "Export SVG — cv-b-chart.svg");
    const svg = await readBlob(blobs[7]);
    expect(svg).toContain("interval = 5000 mV");
    expect(svg).toContain("R² ≥ 0.95");
    expect(svg).toContain("XYYYYY");
    expect(svg).toContain("First row contains headers");
    expect(svg).toContain("rates = 1, 4, 9 mV/s");

    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
    class LoadingImage { onload: null | (() => void) = null; onerror: null | (() => void) = null; set src(_value: string) { queueMicrotask(() => this.onload?.()); } }
    vi.stubGlobal("Image", LoadingImage);
    await click(view, "Export PNG — cv-b-chart.png");
    const pngSourceSvg = await readBlob(blobs[8]);
    expect(pngSourceSvg).toContain("interval = 5000 mV");
    expect(pngSourceSvg).toContain("R² ≥ 0.95");
  });

  it("reconstructs continuous Dunn contributions from sparse trusted anchors", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,4,9\n1,1,8,2\n2,3,12,27\n1,1,8,2\n0,1,4,9");
    await click(view, "Run analysis");

    expect(view.querySelector('[data-quality-summary="true"]')).not.toBeNull();
    expect(view.querySelectorAll('[data-table-id="cv-b-records-table"] tbody tr')).toHaveLength(5);
    expect(view.querySelectorAll('[data-table-id="cv-dunn-records-table"] tbody tr')).toHaveLength(6);
    expect(view.querySelector('[data-table-id="cv-contribution-table"]')).not.toBeNull();
    expect(view.textContent).toContain("unavailable when no contiguous valid segment");
    const csvButtons = [...view.querySelectorAll<HTMLButtonElement>('.cv-export button')].filter((item) => item.textContent?.endsWith(".csv"));
    expect(csvButtons).toHaveLength(6);
    expect(csvButtons.every((item) => !item.disabled)).toBe(true);
    expect(button(view, "Export SVG — cv-b-chart.svg").disabled).toBe(false);
    expect(button(view, "Export SVG — cv-fit-chart.svg").disabled).toBe(false);
    expect(button(view, "Export SVG — cv-dunn-chart.svg").disabled).toBe(false);
    expect(button(view, "Export SVG — cv-contribution-chart.svg").disabled).toBe(false);
    expect([...view.querySelectorAll<HTMLSelectElement>('select[name="selectedRate"] option')].map((item) => item.value)).toEqual(["1", "4", "9"]);
    expect(view.querySelector('[data-series-id="original"]')?.getAttribute("data-render-point-count")).toBe("5");
    expect(view.querySelector('[data-dunn-coverage="true"]')?.textContent).toContain("2 / 6 points (33.33333%)");

    const blobs: Blob[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return "blob:no-contribution"; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await click(view, "cv-contribution-summary.csv");
    const summary = await readBlob(blobs[0]);
    expect(summary).toContain("Available");
    expect(summary).toContain(",2,6,");
  });

  it("disables only the selected-potential fit exports for a genuinely unavailable b record", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,0,0,0\n0.5,2,8,18\n1,3,12,27\n0.5,2,8,18\n0,0,0,0");
    await click(view, "Run analysis");
    await setPotential(view, "0");

    expect(view.querySelector('[data-export-id="cv-fit-chart"]')).toBeNull();
    expect(button(view, "Export SVG — cv-fit-chart.svg").disabled).toBe(true);
    expect(button(view, "Export PNG — cv-fit-chart.png").disabled).toBe(true);
    expect(button(view, "Export SVG — cv-b-chart.svg").disabled).toBe(false);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe("");
  });

  it("embeds header mode, ordered rates, and figure-specific selections in bilingual metadata", async () => {
    const view = await renderPage();
    await chooseRadio(view, "cv-layout", "sharedPotential");
    await chooseRadio(view, "cv-header-mode", "data");
    const headerless = [...Array.from({ length: 21 }, (_, potential) => potential), ...Array.from({ length: 20 }, (_, index) => 19 - index)].map((potential) => {
      const scale = potential + 1;
      return `${potential},${9 * scale},${scale},${4 * scale}`;
    }).join("\n");
    await uploadFile(view, new File([headerless], "headerless.csv"));
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "9, 1, 4");
    await setManualPotentialInterval(view, "5000");
    await click(view, "Run analysis");
    await setPotential(view, "5");
    await setSelect(view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')!, "9");

    const common = view.querySelector('[data-export-id="cv-b-chart"] [data-chart-metadata="true"]')?.textContent ?? "";
    expect(common).toContain("XYYYYY");
    expect(common).toContain("File upload");
    expect(common).toContain("First row is numeric data");
    expect(common).toContain("rates = 9, 1, 4 mV/s");
    expect(common).toContain("interval = 5000 mV");
    expect(common).toContain("R² ≥ 0.95");
    expect(view.querySelector('[data-export-id="cv-fit-chart"] [data-chart-metadata="true"]')?.textContent).toContain("potential = 5 V");
    expect(view.querySelector('[data-export-id="cv-dunn-chart"] [data-chart-metadata="true"]')?.textContent).toContain("scan rate = 9 mV/s");

    await click(view, "中文");
    expect(view.querySelector('[data-export-id="cv-b-chart"] [data-chart-metadata="true"]')?.textContent).toContain("首行为数值数据");
    expect(view.querySelector('[data-export-id="cv-fit-chart"] [data-chart-metadata="true"]')?.textContent).toContain("电位 = 5 V");
    expect(view.querySelector('[data-export-id="cv-dunn-chart"] [data-chart-metadata="true"]')?.textContent).toContain("扫描速率 = 9 mV/s");
  });

  it("round-trips high-precision scientific settings through CSV, SVG, and the PNG source SVG", async () => {
    const view = await renderPage();
    const rates = [0.123456789, 0.987654321, 1.234567891];
    const threshold = "0.876543219";
    const potentials = [
      0.123456789,
      ...Array.from({ length: 20 }, (_, index) => index + 1),
      ...Array.from({ length: 19 }, (_, index) => 19 - index),
      0.123456789
    ];
    const rows = potentials.map((potential, index) => {
      const scale = index + 1;
      const currents = rates.map((rate) => scale * (2 * rate + 3 * Math.sqrt(rate)));
      return [potential, ...currents].map(String).join(",");
    });
    await upload(view, ["Potential,Current A,Current B,Current C", ...rows].join("\n"));
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, rates.map(String).join(", "));
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-r-squared-threshold"]')!, threshold);
    await click(view, "Run analysis");

    const selectedDisplay = view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value ?? "";
    expect(selectedDisplay).toMatch(/^-?\d+(?:\.\d{1,4})?$/);
    expect(view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')?.value).toBe("0.123456789");
    const fitChart = view.querySelector<SVGSVGElement>('[data-export-id="cv-fit-chart"]')!;
    const dunnChart = view.querySelector<SVGSVGElement>('[data-export-id="cv-dunn-chart"]')!;
    expect(fitChart.querySelector("desc")?.id).toBe(fitChart.getAttribute("aria-describedby"));
    const selectedMetadata = fitChart.querySelector("desc")?.textContent?.match(/potential = ([^ ]+) V/)?.[1];
    expect(selectedMetadata).toBeDefined();
    expect(Number(selectedMetadata).toFixed(4)).toBe(Number(selectedDisplay).toFixed(4));
    expect(dunnChart.querySelector("desc")?.id).toBe(dunnChart.getAttribute("aria-describedby"));
    expect(dunnChart.querySelector("desc")?.textContent).toContain("scan rate = 0.123456789 mV/s");

    const blobs: Blob[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return `blob:precision-${blobs.length}`; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await click(view, "cv-b-value-results.csv");
    await click(view, "cv-interpolated-data.csv");

    const bCsv = await readBlob(blobs[0]);
    const wideCsv = await readBlob(blobs[1]);
    for (const value of ["0.123456789", "0.987654321", "1.234567891", threshold]) {
      expect(bCsv).toContain(value);
      expect(wideCsv).toContain(value);
    }

    await click(view, "Export SVG — cv-fit-chart.svg");
    const fitSvg = await readBlob(blobs[2]);
    expect(fitSvg).toContain(`potential = ${selectedMetadata} V`);
    expect(fitSvg).toContain(`R² ≥ ${threshold}`);
    expect(fitSvg).toContain("rates = 0.123456789, 0.987654321, 1.234567891 mV/s");

    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));
    class LoadingImage { onload: null | (() => void) = null; onerror: null | (() => void) = null; set src(_value: string) { queueMicrotask(() => this.onload?.()); } }
    vi.stubGlobal("Image", LoadingImage);
    await click(view, "Export PNG — cv-dunn-chart.png");
    const dunnPngSourceSvg = await readBlob(blobs[3]);
    expect(dunnPngSourceSvg).toContain("scan rate = 0.123456789 mV/s");
    expect(dunnPngSourceSvg).toContain(`R² ≥ ${threshold}`);
    expect(dunnPngSourceSvg).toContain("rates = 0.123456789, 0.987654321, 1.234567891 mV/s");
  });

  it("sorts scan-rate displays, uses point-only b observations, and breaks b curves across unavailable potentials", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 9 mV/s,Current 1 mV/s,Current 4 mV/s\n0,9,1,4\n1,0,4,10\n2,27,3,12\n1,0,4,10\n0,9,1,4");
    await click(view, "Run analysis");
    const rate = view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')!;
    expect([...rate.options].map((option) => option.value)).toEqual(["1", "4", "9"]);
    const observed = [...view.querySelectorAll<SVGCircleElement>('[data-point-series-id="fit-points"]')].map((point) => Number(point.dataset.pointX));
    expect(observed).toEqual([...observed].sort((left, right) => left - right));
    expect(view.querySelector('path[data-series-id="fit-points"]')).toBeNull();
    const forwardPath = view.querySelector('path[data-series-id="b-values"]')?.getAttribute("d") ?? "";
    const reversePath = view.querySelector('path[data-series-id="b-values-reverse"]')?.getAttribute("d") ?? "";
    expect(forwardPath.match(/\bM\b/g)).toHaveLength(2);
    expect(reversePath.match(/\bM\b/g)).toHaveLength(1);
  });

  it("keeps original CV points distinct from interpolated and reconstructed grid values", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,4,9\n1,,8,18\n2,3,12,27\n1,2,8,18\n0,1,4,9");
    await click(view, "Run analysis");
    expect(view.textContent).toContain("Original CV curve");
    expect(view.textContent).toContain("Reconstructed total current");
    expect(view.querySelector('[data-series-id="original"]')?.getAttribute("data-render-point-count")).toBe("4");
    expect(view.querySelector('[data-series-id="reconstructed-total"]')).toBeNull();
    expect(view.querySelectorAll('[data-area-series-id="capacitive-area"]').length).toBeGreaterThan(0);
    expect(view.querySelectorAll('[data-area-series-id="diffusion-area"]').length).toBeGreaterThan(0);
    expect(view.querySelectorAll('[data-table-id="cv-original-current-table"] tbody tr')).toHaveLength(4);
    expect(view.querySelectorAll('[data-table-id="cv-dunn-current-table"] tbody tr')).toHaveLength(6);
    expect(view.querySelector('[data-table-id="cv-dunn-current-table"]')?.textContent).toContain("Interpolated input current");
  });

  it("caps chart and table rendering while CSV export retains the full analysis", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    restoreClipboard = () => {
      if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    };
    const view = await renderPage();
    const sourceRowCount = 4_501;
    const contents = proportionalLoopCsv(sourceRowCount);
    await upload(view, contents);
    await click(view, "Run analysis");
    expect(view.querySelector('select[name="selectedPotential"]')).toBeNull();
    expect(view.querySelectorAll('datalist[name="selectedPotential"] option')).toHaveLength(0);
    await setSelect(view.querySelector<HTMLSelectElement>('select[name="selectedBBranch"]')!, "0");
    await setPotential(view, String(Math.floor(sourceRowCount / 2)));
    expect(view.querySelector('[data-table-id="cv-selected-b-record-table"] tbody tr')?.firstElementChild?.textContent).toBe(String(Math.floor(sourceRowCount / 2)));
    expect(button(view, "Previous potential").disabled).toBe(false);
    expect(button(view, "Next potential").disabled).toBe(false);
    expect(Number(view.querySelector('[data-series-id="b-values"]')?.getAttribute("data-render-point-count"))).toBeLessThanOrEqual(2_000);
    const dunnAreaPaths = [...view.querySelectorAll<SVGPathElement>('[data-export-id="cv-dunn-chart"] [data-polygon-series-id]')];
    expect(dunnAreaPaths.length).toBeGreaterThan(0);
    expect(dunnAreaPaths.every((path) => path.hasAttribute("data-render-point-count"))).toBe(true);
    for (const areaId of new Set(dunnAreaPaths.map((path) => path.dataset.polygonSeriesId))) {
      const renderedPointCount = dunnAreaPaths
        .filter((path) => path.dataset.polygonSeriesId === areaId)
        .reduce((total, path) => total + Number(path.dataset.renderPointCount), 0);
      expect(renderedPointCount).toBeLessThanOrEqual(MAX_CHART_OUTPUT_POINTS);
    }
    expect(view.querySelectorAll('[data-table-id="cv-dunn-current-table"] tbody tr').length).toBeLessThanOrEqual(500);
    const dunnRowCount = 2 * (Math.floor(sourceRowCount / 2) + 1);
    expect(view.textContent).toContain(`Showing 500 of ${dunnRowCount} rows`);
    const longFrame = view.querySelector('[data-table-id="cv-dunn-current-table"]')
      ?.closest('.cv-result-table-frame');
    expect(longFrame?.classList.contains('cv-result-table-frame-scroll')).toBe(true);
    const shortFrame = view.querySelector('[data-table-id="cv-contribution-table"]')
      ?.closest('.cv-result-table-frame');
    expect(shortFrame?.classList.contains('cv-result-table-frame-scroll')).toBe(false);

    const dunnTable = view.querySelector('[data-table-id="cv-dunn-current-table"]')!;
    const toolbar = dunnTable.closest('.cv-result-table-block')?.querySelector<HTMLElement>('.cv-table-copy-toolbar')!;
    const columnGroup = toolbar.querySelector<HTMLElement>('.cv-table-copy-columns');
    expect(columnGroup?.getAttribute("role")).toBe("group");
    expect(columnGroup?.getAttribute("aria-labelledby")).toBe(toolbar.querySelector("span")?.id);
    const copyButton = [...toolbar.querySelectorAll('button')]
      .find((item) => item.textContent === "Copy selected columns")!;
    expect(copyButton.disabled).toBe(true);
    await act(async () => toolbar.querySelector<HTMLInputElement>('input[value="3"]')!.click());
    await act(async () => toolbar.querySelector<HTMLInputElement>('input[value="0"]')!.click());
    await act(async () => copyButton.click());

    const copied = writeText.mock.calls[0][0] as string;
    expect(copied.split("\r\n")).toHaveLength(dunnRowCount + 1);
    expect(copied.split("\r\n")[0]).toBe("Potential (V)\tCapacitive contribution (arb. units)");
    expect(copied).not.toContain("Interpolated input current");
    expect(toolbar.textContent).toContain("Copied selected columns.");

    writeText.mockRejectedValueOnce(new Error("Clipboard access denied"));
    await act(async () => copyButton.click());
    expect(toolbar.textContent).toContain("Could not copy selected columns.");

    await click(view, "中文");
    expect(toolbar.textContent).toContain("复制所选列");
    expect(toolbar.textContent).toContain("无法复制所选列。");
    expect(view.querySelector('[data-table-id="cv-selected-b-record-table"]')
      ?.closest('.cv-result-table-block')?.querySelector('.cv-table-copy-toolbar')).toBeNull();

    const blobs: Blob[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return "blob:full"; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await click(view, "cv-interpolated-data.csv");
    const exported = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs[0]); });
    expect(exported.split("\r\n")).toHaveLength(sourceRowCount + 1);
  }, 30_000);

  it("adds the CV table viewport only after the twelfth rendered row", async () => {
    const analyzeGridPoints = async (gridPointCount: number) => {
      const view = await renderPage();
      const contents = proportionalLoopCsv(gridPointCount * 2 - 1);
      await upload(view, contents);
      await click(view, "Run analysis");
      return view;
    };

    const atThreshold = await analyzeGridPoints(6);
    const atThresholdFrame = atThreshold.querySelector('[data-table-id="cv-dunn-current-table"]')
      ?.closest('.cv-result-table-frame');
    expect(atThresholdFrame?.classList.contains('cv-result-table-frame-scroll')).toBe(false);
    expect(atThresholdFrame?.querySelector('.cv-result-table-viewport')).not.toBeNull();

    const overThreshold = await analyzeGridPoints(7);
    const overThresholdFrame = overThreshold.querySelector('[data-table-id="cv-dunn-current-table"]')
      ?.closest('.cv-result-table-frame');
    expect(overThresholdFrame?.classList.contains('cv-result-table-frame-scroll')).toBe(true);
    expect(overThresholdFrame?.querySelector('.cv-result-table-viewport')).not.toBeNull();
  });

  it("preserves every unavailable-gap run when downsampling a long b-value curve", async () => {
    const view = await renderPage();
    const gaps = new Set([2, 5_000, 9_998]);
    const contents = completeSharedCsv(10_001, (_potential, index) =>
      gaps.has(index) ? [0, 0, 0] : [index + 1, 4 * (index + 1), 9 * (index + 1)]);
    await upload(view, contents);
    await click(view, "Run analysis");
    const paths = [...view.querySelectorAll<SVGPathElement>('path[data-series-id="b-values"], path[data-series-id="b-values-reverse"]')];
    expect(paths.reduce((total, path) => total + Number(path.dataset.gapRunCount), 0)).toBe(3);
    expect(paths.every((path) => (path.getAttribute("d")?.match(/\bM\b/g)?.length ?? 0) <= Number(path.dataset.gapRunCount) + 1)).toBe(true);
  }, 30_000);

  it("falls back to an explicitly disclosed point view for pathological alternating gaps", async () => {
    const view = await renderPage();
    const contents = completeSharedCsv(1_203, (_potential, index) =>
      index % 2 === 0 ? [0, 0, 0] : [index + 1, 4 * (index + 1), 9 * (index + 1)]);
    await upload(view, contents);
    await click(view, "Run analysis");
    expect(view.querySelector('path[data-series-id="b-values"]')).toBeNull();
    expect(view.querySelectorAll('[data-point-series-id="b-values"]').length).toBeLessThanOrEqual(2_000);
    expect(view.textContent).toContain("Too many unavailable gaps to draw a continuous b-value line");
  }, 30_000);
});
