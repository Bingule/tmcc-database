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

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
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

const csv = `Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,3,8,15\n0.5,4.5,18,40.5\n1,6,32,90`;
const csvFilenames = ["cv-interpolated-data.csv", "cv-b-value-results.csv", "cv-dunn-k1-k2.csv", "cv-capacitive-current.csv", "cv-diffusion-current.csv", "cv-contribution-summary.csv"];

function qualityCsv() {
  const special = new Map<number, [number, number, number]>([
    [5, [1, 8, 2]],
    [10, [0, 4, 9]]
  ]);
  return [
    "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s",
    ...Array.from({ length: 21 }, (_, potential) => {
      const currents = special.get(potential) ?? [potential + 1, 4 * (potential + 1), 9 * (potential + 1)];
      return `${potential},${currents.join(",")}`;
    })
  ].join("\n");
}

describe("CV kinetics page", () => {
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

    await chooseRadio(view, "cv-layout", "sharedPotential");
    await uploadFile(view, new File([csv], "cv.csv"));
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

  it.each([
    ["layout", async (view: HTMLElement) => chooseRadio(view, "cv-layout", "pairedPotentialCurrent")],
    ["header mode", async (view: HTMLElement) => chooseRadio(view, "cv-header-mode", "data")],
    ["scan rates", async (view: HTMLElement) => setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "1, 4, 16")],
    ["point interval", async (view: HTMLElement) => setSelect(view.querySelector<HTMLSelectElement>('select[name="cv-point-interval"]')!, "2")],
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
    let resolveOld!: (value: ArrayBuffer) => void;
    const oldFile = new File(["ignored"], "old.csv");
    Object.defineProperty(oldFile, "arrayBuffer", {
      value: () => new Promise<ArrayBuffer>((resolve) => { resolveOld = resolve; })
    });
    await uploadFile(view, oldFile, 0);
    await chooseRadio(view, "cv-header-mode", "data");
    await act(async () => {
      resolveOld(new TextEncoder().encode(csv).buffer);
      await Promise.resolve();
    });
    expect(view.textContent).toContain("No parsed table is ready");
    expect(view.textContent).not.toContain("Current 1 mV/s →");
  });

  it("imports once, confirms rates, and produces both analyses with exports", async () => {
    const view = await renderPage();
    expect(view.textContent).toContain("CV Kinetics Analysis");
    expect(view.textContent).toContain("Import Data");
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
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe("0");
    expect(view.textContent).toContain("Contribution percentage by scan rate");
    expect(view.querySelectorAll<HTMLButtonElement>(".cv-export button:disabled")).toHaveLength(0);
    expect([...view.querySelectorAll<HTMLButtonElement>(".cv-export button")].filter((button) => button.textContent?.endsWith(".csv")).map((button) => button.textContent)).toEqual(csvFilenames);
    expect([...view.querySelectorAll<HTMLButtonElement>(".cv-export button")].filter((button) => /\.(svg|png)$/.test(button.textContent ?? ""))).toHaveLength(8);
    await click(view, "中文");
    expect(view.textContent).toContain("CV 动力学分析");
    expect(view.textContent).toContain("Dunn 分析");
    expect(view.textContent).toContain(`目标为每个序列最多 ${MAX_CHART_POINTS} 个点`);
    expect(view.textContent).toContain(`最多可增加到每个序列 ${MAX_CHART_OUTPUT_POINTS} 个点`);
    expect(view.querySelectorAll("svg")).toHaveLength(4);
    await click(view, "EN");
    expect(view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')?.value).toBe("1");
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe("0");
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
      [1, 6, 32, 90]
    ], "equivalent.xlsx")]
  ])("runs visible b-value and Dunn results from %s import", async (_format, makeFile) => {
    const view = await renderPage();
    await uploadFile(view, makeFile());

    expect(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')?.value).toBe("1, 4, 9");
    expect(view.querySelectorAll(".cv-preview tbody tr")).toHaveLength(3);
    await click(view, "Run analysis");
    expect(view.querySelectorAll('[data-table-id="cv-b-records-table"] tbody tr').length).toBeGreaterThan(0);
    expect(view.querySelectorAll('[data-table-id="cv-dunn-records-table"] tbody tr').length).toBeGreaterThan(0);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe("");
  });

  it("retains mathematical b-value and Dunn fits when every R-squared value is below 0.95", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,100,2\n0.5,2,200,4\n1,3,300,6");
    await click(view, "Run analysis");

    const bRows = view.querySelectorAll('[data-table-id="cv-b-records-table"] tbody tr');
    const dunnRows = view.querySelectorAll('[data-table-id="cv-dunn-records-table"] tbody tr');
    expect(bRows.length).toBeGreaterThan(0);
    expect(dunnRows.length).toBeGreaterThan(0);
    expect(bRows[0]?.textContent).toContain("Below R² threshold");
    expect(dunnRows[0]?.textContent).toContain("Below R² threshold");
    expect(bRows[0]?.querySelectorAll("td")[1]?.textContent).not.toBe("—");
    expect(dunnRows[0]?.querySelectorAll("td")[1]?.textContent).not.toBe("—");
    expect(view.querySelector('[data-table-id="cv-contribution-table"]')).toBeNull();
    expect(view.querySelector('[aria-live="polite"]')?.textContent).not.toContain("No b-value fit");

    await click(view, "中文");
    expect(view.querySelector('[data-table-id="cv-b-records-table"]')?.textContent).toContain("低于 R² 阈值");
  });

  it("shows a genuine analysis failure immediately beside the Run analysis action", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,0,0,0\n1,0,0,0");
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
    }],
    ["zero currents", "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,0,0,0\n1,0,0,0", "No b-value fit", async () => {}],
    ["no overlap", "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,,\n1,2,,\n2,,3,\n3,,4,\n4,,,5\n5,,,6", "no overlapping", async () => {}]
  ])("reports %s analysis errors", async (_name, contents, expected, prepare) => {
    const view = await renderPage();
    await upload(view, contents);
    await prepare(view);
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
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,0,0,0\n0.5,2,8,18\n1,3,6,9");
    await click(view, "Run analysis");
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.type).toBe("number");
    expect(view.querySelector('select[name="selectedPotential"]')).toBeNull();
    expect(view.textContent).toContain("Missing b-value fits: 1 of 3 potential points");
    expect(view.querySelector('[data-export-id="cv-dunn-chart"] [data-selected-x="0.5"]')).not.toBeNull();
    expect(view.querySelector('[data-export-id="cv-fit-chart"]')?.textContent).toContain("log(|current|)");
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return "blob:fit"; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await click(view, "cv-b-value-results.csv");
    const exported = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs[0]); });
    expect(exported).toContain("0,,,,,Zero-current logarithm unavailable");
  });

  it("round-trips a high-precision retained potential without display rounding", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0.123456789,1,4,9\n0.5,2,8,18\n1,3,12,27");
    await click(view, "Run analysis");

    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe("0.123456789");
    await click(view, "Next potential");
    await click(view, "Previous potential");
    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe("0.123456789");
    expect(view.querySelector('[data-export-id="cv-b-chart"] [data-selected-x="0.123456789"]')).not.toBeNull();
  });

  it("maps exact potential and rate selections to the signed Dunn curves", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,6,15\n1,-1,-4,-9");
    await click(view, "Run analysis");
    const rate = view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')!;
    await setPotential(view, "1");
    await act(async () => { rate.value = "9"; rate.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(view.querySelector('[data-export-id="cv-fit-chart"] [data-selected-x]')).toBeNull();
    expect(view.querySelector('[data-export-id="cv-dunn-chart"] [data-selected-x="1"]')).not.toBeNull();
    const rows = [...view.querySelectorAll<HTMLTableRowElement>('[data-table-id="cv-dunn-current-table"] tbody tr')];
    const selected = rows.find((row) => row.cells[0].textContent === "1")!;
    expect([...selected.cells].map((cell) => cell.textContent)).toEqual(["1", "-9", "-9", "-9", "0"]);
    expect(view.querySelectorAll('[data-export-id="cv-dunn-chart"] [data-series-id]')).toHaveLength(4);
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
    await upload(view, "Potential,Current 2 mV/s,Current 8 mV/s,Current 18 mV/s\n0,2,8,18\n1,4,16,36");
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
    expect(english[1]).toContain("Potential (V),b value,Intercept,R²,Point count,Fit status");
    expect(english[2]).toContain("Potential (V),k1,k2,R²,Point count");
    expect(english[3]).toContain("Potential (V),Capacitive current (arb. units) at 1 mV/s");
    expect(english[4]).toContain("Potential (V),Diffusion-controlled current (arb. units) at 1 mV/s");
    expect(english[5]).toContain("Scan rate (mV/s),Capacitive contribution (%),Diffusion-controlled contribution (%)");
    await click(view, "中文");
    await click(view, "cv-b-value-results.csv");
    const chinese = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs[6]); });
    expect(chinese).toContain("电位 (V),b 值");
    expect(chinese).toContain("拟合状态");

    class FailingImage { onload: null | (() => void) = null; onerror: null | (() => void) = null; set src(_value: string) { queueMicrotask(() => this.onerror?.()); } }
    vi.stubGlobal("Image", FailingImage);
    const png = [...view.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("cv-b-chart.png"))!;
    await act(async () => { png.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("导出失败");
  });

  it("reports full quality metadata, retains every fit record, and selects excluded potentials exactly", async () => {
    const view = await renderPage();
    await upload(view, qualityCsv());
    await setSelect(view.querySelector<HTMLSelectElement>('select[name="cv-point-interval"]')!, "5");
    await click(view, "Run analysis");

    const summary = view.querySelector('[data-quality-summary="true"]')?.textContent ?? "";
    expect(summary).toContain("XYYYYY");
    expect(summary).toContain("File upload");
    expect(summary).toContain("3 curves");
    expect(summary).toContain("1, 4, 9 mV/s");
    expect(summary).toContain("0–20 V");
    expect(summary).toContain("21");
    expect(summary).toContain("5 retained");
    expect(summary).toContain("interval 5");
    expect(summary).toContain("R² ≥ 0.95");
    expect(summary).toContain("3 valid / 1 excluded / 1 unavailable");
    expect(summary).toContain("4 valid / 1 excluded / 0 unavailable");
    expect(summary).toContain("4 / 5");
    expect(summary).toContain("80%");

    const bTable = view.querySelector('[data-table-id="cv-b-records-table"]')!;
    const dunnTable = view.querySelector('[data-table-id="cv-dunn-records-table"]')!;
    expect(bTable.querySelector("thead")?.textContent).toContain("Fit status");
    expect(dunnTable.querySelector("thead")?.textContent).toContain("Fit status");
    expect(bTable.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(dunnTable.querySelectorAll("tbody tr")).toHaveLength(5);

    const excludedRow = [...bTable.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((row) => row.cells[0].textContent === "5")!;
    expect(excludedRow.textContent).toContain("Below R² threshold");
    expect(excludedRow.cells[1].textContent).not.toBe("—");
    expect(excludedRow.cells[3].textContent).not.toBe("—");
    expect(excludedRow.cells[4].textContent).toBe("3");
    const unavailableRow = [...bTable.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((row) => row.cells[0].textContent === "10")!;
    expect([...unavailableRow.cells].slice(1, 5).map((cell) => cell.textContent)).toEqual(["—", "—", "—", "—"]);
    expect(unavailableRow.textContent).toContain("Zero-current logarithm unavailable");

    expect(view.querySelector('select[name="selectedPotential"]')).toBeNull();
    await setPotential(view, "5");
    expect(view.querySelector('[data-selected-fit-status="true"]')?.textContent).toContain("Below R² threshold");
    expect(view.querySelector('[data-selected-fit-status="true"]')?.textContent).toContain("R²");
    expect(view.querySelector('[data-export-id="cv-b-chart"] [data-selected-x="5"]')).toBeNull();
    expect((view.querySelector('path[data-series-id="b-values"]')?.getAttribute("d") ?? "").match(/\bM\b/g)).toHaveLength(2);

    const contributionTable = view.querySelector('[data-table-id="cv-contribution-table"]')!;
    expect(contributionTable.querySelector("thead")?.textContent).toContain("Valid / sampled points");
    expect(contributionTable.querySelector("thead")?.textContent).toContain("Coverage");
    expect(contributionTable.textContent).toContain("4 / 5");
    expect(view.textContent).toContain("unavailable when no contiguous valid segment");

    await click(view, "中文");
    expect(view.querySelector('[data-table-id="cv-b-records-table"]')?.textContent).toContain("低于 R² 阈值");
    expect(view.querySelector('[data-quality-summary="true"]')?.textContent).toContain("80%");
  });

  it("exports exactly six bilingual audit-ready CSVs and embeds current settings in SVG and PNG", async () => {
    const view = await renderPage();
    await upload(view, qualityCsv());
    await setSelect(view.querySelector<HTMLSelectElement>('select[name="cv-point-interval"]')!, "5");
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
    expect(exported[0].split("\r\n")[0]).toContain("Point interval: 5");
    expect(exported[1]).toContain("Fit status,Data layout,Data source,Point interval,R² threshold");
    expect(exported[1]).toContain("Below R² threshold,XYYYYY,File upload,5,0.95");
    expect(exported[1]).toContain("10,,,,,Zero-current logarithm unavailable");
    expect(exported[2]).toContain("Fit status,Data layout,Data source,Point interval,R² threshold");
    expect(exported[3].split("\r\n")[0]).toContain("R² threshold: 0.95");
    expect(exported[4].split("\r\n")[0]).toContain("R² threshold: 0.95");
    expect(exported[5]).toContain("Valid points,Sampled points,Coverage (%),Contribution status,Data layout,Data source,Point interval,R² threshold");
    expect(exported[5]).toContain(",4,5,80,Available,XYYYYY,File upload,5,0.95");

    await click(view, "中文");
    await click(view, "cv-b-value-results.csv");
    const chinese = await readBlob(blobs[6]);
    expect(chinese).toContain("拟合状态,数据格式,数据来源,取点间隔,R² 阈值");
    expect(chinese).toContain("低于 R² 阈值,XYYYYY,上传文件,5,0.95");

    await click(view, "EN");
    await click(view, "Export SVG — cv-b-chart.svg");
    const svg = await readBlob(blobs[7]);
    expect(svg).toContain("interval = 5");
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
    expect(pngSourceSvg).toContain("interval = 5");
    expect(pngSourceSvg).toContain("R² ≥ 0.95");
  });

  it("keeps quality records and all six CSV exports when Dunn contributions are unavailable", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,4,9\n1,1,8,2\n2,3,12,27");
    await click(view, "Run analysis");

    expect(view.querySelector('[data-quality-summary="true"]')).not.toBeNull();
    expect(view.querySelectorAll('[data-table-id="cv-b-records-table"] tbody tr')).toHaveLength(3);
    expect(view.querySelectorAll('[data-table-id="cv-dunn-records-table"] tbody tr')).toHaveLength(3);
    expect(view.querySelector('[data-table-id="cv-contribution-table"]')).toBeNull();
    expect(view.textContent).toContain("unavailable when no contiguous valid segment");
    const csvButtons = [...view.querySelectorAll<HTMLButtonElement>('.cv-export button')].filter((item) => item.textContent?.endsWith(".csv"));
    expect(csvButtons).toHaveLength(6);
    expect(csvButtons.every((item) => !item.disabled)).toBe(true);
    expect(button(view, "Export SVG — cv-b-chart.svg").disabled).toBe(false);
    expect(button(view, "Export SVG — cv-fit-chart.svg").disabled).toBe(false);
    expect(button(view, "Export SVG — cv-dunn-chart.svg").disabled).toBe(true);
    expect(button(view, "Export SVG — cv-contribution-chart.svg").disabled).toBe(true);

    const blobs: Blob[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return "blob:no-contribution"; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await click(view, "cv-contribution-summary.csv");
    const summary = await readBlob(blobs[0]);
    expect(summary).toContain("Unavailable");
    expect(summary).toContain(",2,3,");
  });

  it("disables only the selected-potential fit exports for a genuinely unavailable b record", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,0,0,0\n0.5,2,8,18\n1,3,12,27");
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
    const headerless = Array.from({ length: 21 }, (_, potential) => {
      const scale = potential + 1;
      return `${potential},${9 * scale},${scale},${4 * scale}`;
    }).join("\n");
    await uploadFile(view, new File([headerless], "headerless.csv"));
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "9, 1, 4");
    await setSelect(view.querySelector<HTMLSelectElement>('select[name="cv-point-interval"]')!, "5");
    await click(view, "Run analysis");
    await setPotential(view, "5");
    await setSelect(view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')!, "9");

    const common = view.querySelector('[data-export-id="cv-b-chart"] [data-chart-metadata="true"]')?.textContent ?? "";
    expect(common).toContain("XYYYYY");
    expect(common).toContain("File upload");
    expect(common).toContain("First row is numeric data");
    expect(common).toContain("rates = 9, 1, 4 mV/s");
    expect(common).toContain("interval = 5");
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
    const rows = Array.from({ length: 21 }, (_, index) => {
      const potential = index === 0 ? 0.123456789 : index;
      const scale = index + 1;
      const currents = rates.map((rate) => scale * (2 * rate + 3 * Math.sqrt(rate)));
      return [potential, ...currents].map(String).join(",");
    });
    await upload(view, ["Potential,Current A,Current B,Current C", ...rows].join("\n"));
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, rates.map(String).join(", "));
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-r-squared-threshold"]')!, threshold);
    await click(view, "Run analysis");

    expect(view.querySelector<HTMLInputElement>('input[name="selectedPotential"]')?.value).toBe("0.123456789");
    expect(view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')?.value).toBe("0.123456789");
    const fitChart = view.querySelector<SVGSVGElement>('[data-export-id="cv-fit-chart"]')!;
    const dunnChart = view.querySelector<SVGSVGElement>('[data-export-id="cv-dunn-chart"]')!;
    expect(fitChart.querySelector("desc")?.id).toBe(fitChart.getAttribute("aria-describedby"));
    expect(fitChart.querySelector("desc")?.textContent).toContain("potential = 0.123456789 V");
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
    expect(fitSvg).toContain("potential = 0.123456789 V");
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
    await upload(view, "Potential,Current 9 mV/s,Current 1 mV/s,Current 4 mV/s\n0,9,1,4\n1,0,0,0\n2,27,3,12");
    await click(view, "Run analysis");
    const rate = view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')!;
    expect([...rate.options].map((option) => option.value)).toEqual(["1", "4", "9"]);
    const observed = [...view.querySelectorAll<SVGCircleElement>('[data-point-series-id="fit-points"]')].map((point) => Number(point.dataset.pointX));
    expect(observed).toEqual([...observed].sort((left, right) => left - right));
    expect(view.querySelector('path[data-series-id="fit-points"]')).toBeNull();
    const bPath = view.querySelector('path[data-series-id="b-values"]')?.getAttribute("d") ?? "";
    expect(bPath.match(/\bM\b/g)).toHaveLength(2);
  });

  it("keeps original CV points distinct from interpolated and reconstructed grid values", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,4,9\n1,,8,18\n2,3,12,27");
    await click(view, "Run analysis");
    expect(view.textContent).toContain("Original CV curve");
    expect(view.textContent).toContain("Reconstructed total current");
    expect(view.querySelector('[data-series-id="original"]')?.getAttribute("data-render-point-count")).toBe("2");
    expect(view.querySelector('[data-series-id="reconstructed-total"]')?.getAttribute("data-render-point-count")).toBe("3");
    expect(view.querySelectorAll('[data-table-id="cv-original-current-table"] tbody tr')).toHaveLength(2);
    expect(view.querySelectorAll('[data-table-id="cv-dunn-current-table"] tbody tr')).toHaveLength(3);
    expect(view.querySelector('[data-table-id="cv-dunn-current-table"]')?.textContent).toContain("Interpolated input current");
  });

  it("caps chart and table rendering while CSV export retains the full analysis", async () => {
    const view = await renderPage();
    const rowCount = 2_501;
    const contents = ["Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s", ...Array.from({ length: rowCount }, (_, index) => `${index},${index + 1},${4 * (index + 1)},${9 * (index + 1)}`)].join("\n");
    await upload(view, contents);
    await click(view, "Run analysis");
    expect(view.querySelector('select[name="selectedPotential"]')).toBeNull();
    expect(view.querySelectorAll('datalist[name="selectedPotential"] option')).toHaveLength(0);
    await setPotential(view, "2500");
    expect(view.querySelector('[data-table-id="cv-selected-b-record-table"] tbody tr')?.firstElementChild?.textContent).toBe("2500");
    expect(button(view, "Previous potential").disabled).toBe(false);
    expect(button(view, "Next potential").disabled).toBe(true);
    expect(Number(view.querySelector('[data-series-id="b-values"]')?.getAttribute("data-render-point-count"))).toBeLessThanOrEqual(2_000);
    expect(view.querySelectorAll('[data-table-id="cv-dunn-current-table"] tbody tr').length).toBeLessThanOrEqual(500);
    expect(view.textContent).toContain("Showing 500 of 2501 rows");

    const blobs: Blob[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return "blob:full"; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await click(view, "cv-interpolated-data.csv");
    const exported = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs[0]); });
    expect(exported.split("\r\n")).toHaveLength(rowCount + 1);
  }, 30_000);

  it("preserves every unavailable-gap run when downsampling a long b-value curve", async () => {
    const view = await renderPage();
    const gaps = new Set([2, 5_000, 9_998]);
    const contents = ["Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s", ...Array.from({ length: 10_000 }, (_, index) => gaps.has(index) ? `${index},0,0,0` : `${index},${index + 1},${4 * (index + 1)},${9 * (index + 1)}`)].join("\n");
    await upload(view, contents);
    await click(view, "Run analysis");
    const path = view.querySelector('path[data-series-id="b-values"]')!;
    expect(path.getAttribute("d")?.match(/\bM\b/g)).toHaveLength(4);
    expect(path.getAttribute("data-gap-run-count")).toBe("3");
  }, 30_000);

  it("falls back to an explicitly disclosed point view for pathological alternating gaps", async () => {
    const view = await renderPage();
    const contents = ["Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s", ...Array.from({ length: 1_202 }, (_, index) => index % 2 === 0 ? `${index},0,0,0` : `${index},${index + 1},${4 * (index + 1)},${9 * (index + 1)}`)].join("\n");
    await upload(view, contents);
    await click(view, "Run analysis");
    expect(view.querySelector('path[data-series-id="b-values"]')).toBeNull();
    expect(view.querySelectorAll('[data-point-series-id="b-values"]').length).toBeLessThanOrEqual(2_000);
    expect(view.textContent).toContain("Too many unavailable gaps to draw a continuous b-value line");
  }, 30_000);
});
