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

async function upload(view: HTMLElement, contents: string) {
  const input = view.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([contents], "cv.csv", { type: "text/csv" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
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
    expect(view.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3);
    expect(view.querySelector<HTMLSelectElement>("select")?.value).toBe("1");
    expect(view.querySelectorAll<HTMLButtonElement>(".cv-export button:disabled")).toHaveLength(0);
    expect(view.textContent).toContain("cv-interpolated-data.csv");
    await click(view, "中文");
    expect(view.textContent).toContain("CV 动力学分析");
    expect(view.textContent).toContain("Dunn 分析");
    expect(view.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3);
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
});
