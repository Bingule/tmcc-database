import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { I18nProvider } from "../src/i18n/I18nProvider";

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
  history.replaceState(null, "", "/tools/cv-kinetics");
  const view = document.createElement("div");
  document.body.appendChild(view);
  root = createRoot(view);
  await act(async () => root!.render(<I18nProvider><App /></I18nProvider>));
  return view;
}

async function uploadFile(view: HTMLElement, file: File, delay = 25) {
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

const csv = `Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,3,8,15\n0.5,4.5,18,40.5\n1,6,32,90`;
const csvFilenames = ["cv-interpolated-data.csv", "cv-b-value-results.csv", "cv-dunn-k1-k2.csv", "cv-capacitive-current.csv", "cv-diffusion-current.csv", "cv-contribution-summary.csv"];

describe("CV kinetics page", () => {
  it("imports once, confirms rates, and produces both analyses with exports", async () => {
    const view = await renderPage();
    expect(view.textContent).toContain("CV Kinetics Analysis");
    expect(view.textContent).toContain("Import Data");
    await upload(view, csv);
    expect(view.textContent).toContain("Data Preview");
    const rateInputs = view.querySelectorAll<HTMLInputElement>('input[name="scanRate"]');
    expect(rateInputs).toHaveLength(3);
    expect([...rateInputs].map((input) => input.value)).toEqual(["1", "4", "9"]);
    await setValue(rateInputs[1], "5");
    await click(view, "Run analysis");
    expect(view.textContent).toContain("b-value Analysis");
    expect(view.textContent).toContain("Dunn Analysis");
    expect(view.querySelectorAll("svg")).toHaveLength(4);
    expect(view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')?.value).toBe("1");
    expect(view.querySelector<HTMLSelectElement>('select[name="selectedPotential"]')?.value).toBe("0");
    expect(view.textContent).toContain("Contribution percentage by scan rate");
    expect(view.querySelectorAll<HTMLButtonElement>(".cv-export button:disabled")).toHaveLength(0);
    expect([...view.querySelectorAll<HTMLButtonElement>(".cv-export button")].filter((button) => button.textContent?.endsWith(".csv")).map((button) => button.textContent)).toEqual(csvFilenames);
    expect([...view.querySelectorAll<HTMLButtonElement>(".cv-export button")].filter((button) => /\.(svg|png)$/.test(button.textContent ?? ""))).toHaveLength(8);
    await click(view, "中文");
    expect(view.textContent).toContain("CV 动力学分析");
    expect(view.textContent).toContain("Dunn 分析");
    expect(view.querySelectorAll("svg")).toHaveLength(4);
    await click(view, "EN");
    expect(view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')?.value).toBe("1");
    expect(view.querySelector<HTMLSelectElement>('select[name="selectedPotential"]')?.value).toBe("0");
  });

  it("localizes validation and keeps exports disabled before valid analysis", async () => {
    const view = await renderPage();
    expect(view.querySelectorAll<HTMLButtonElement>(".cv-export button:disabled").length).toBeGreaterThan(0);
    await upload(view, "Potential,Current 1 mV/s\n0,1\n1,2");
    await click(view, "Run analysis");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("at least two");
    await click(view, "中文");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("至少两");
  });

  it.each([
    ["duplicate", csv, "unique", async (view: HTMLElement) => {
      const inputs = view.querySelectorAll<HTMLInputElement>('input[name="scanRate"]');
      await setValue(inputs[1], "1");
    }],
    ["zero currents", "Potential,Current 1 mV/s,Current 2 mV/s\n0,0,0\n1,0,0", "No b-value fit", async () => {}],
    ["no overlap", "Potential,Current 1 mV/s,Current 2 mV/s\n0,1,\n1,2,\n2,,3\n3,,4", "no overlapping", async () => {}]
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

  it("uses an exact accessible potential selection and discloses missing b fits", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s\n0,0,0\n0.5,2,8\n1,3,6");
    await click(view, "Run analysis");
    const potential = view.querySelector<HTMLSelectElement>('select[name="selectedPotential"]')!;
    expect([...potential.options].map((option) => option.value)).toEqual(["0.5", "1"]);
    expect(view.textContent).toContain("Missing b-value fits: 1 of 3 potential points");
    expect(view.querySelector('[data-export-id="cv-dunn-chart"] [data-selected-x="0.5"]')).not.toBeNull();
    expect(view.querySelector('[data-export-id="cv-fit-chart"]')?.textContent).toContain("log(|current|)");
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", { createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return "blob:fit"; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await click(view, "cv-b-value-results.csv");
    const exported = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blobs[0]); });
    expect(exported).toContain("0,,,,,Unavailable");
  });

  it("maps exact potential and rate selections to the signed Dunn curves", async () => {
    const view = await renderPage();
    await upload(view, "Potential,Current 1 mV/s,Current 4 mV/s,Current 9 mV/s\n0,1,6,15\n1,1,0,-3");
    await click(view, "Run analysis");
    const potential = view.querySelector<HTMLSelectElement>('select[name="selectedPotential"]')!;
    const rate = view.querySelector<HTMLSelectElement>('select[name="selectedRate"]')!;
    await act(async () => { potential.value = "1"; potential.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { rate.value = "9"; rate.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(view.querySelector('[data-export-id="cv-fit-chart"] [data-selected-x]')).toBeNull();
    expect(view.querySelector('[data-export-id="cv-dunn-chart"] [data-selected-x="1"]')).not.toBeNull();
    const rows = [...view.querySelectorAll<HTMLTableRowElement>('[data-table-id="cv-dunn-current-table"] tbody tr')];
    const selected = rows.find((row) => row.cells[0].textContent === "1")!;
    expect([...selected.cells].map((cell) => cell.textContent)).toEqual(["1", "-3", "-9", "6"]);
    expect(view.querySelectorAll('[data-export-id="cv-dunn-chart"] [data-series-id]')).toHaveLength(3);
  });

  it("clears stale validation on edit and ignores an older import finishing last", async () => {
    const view = await renderPage();
    await upload(view, csv);
    const rates = view.querySelectorAll<HTMLInputElement>('input[name="scanRate"]');
    await setValue(rates[1], "1");
    await click(view, "Run analysis");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("unique");
    await setValue(rates[1], "4");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe("");

    let resolveOld!: (value: string) => void;
    const oldFile = new File(["ignored"], "old.csv");
    Object.defineProperty(oldFile, "text", { value: () => new Promise<string>((resolve) => { resolveOld = resolve; }) });
    await uploadFile(view, oldFile, 0);
    await upload(view, "Potential,Current 2 mV/s,Current 8 mV/s\n0,2,8\n1,4,16");
    await act(async () => { resolveOld("Potential,Current 1 mV/s,Current 4 mV/s\n0,1,4\n1,2,8"); await Promise.resolve(); });
    expect([...view.querySelectorAll<HTMLInputElement>('input[name="scanRate"]')].map((input) => input.value)).toEqual(["2", "8"]);
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
});
