import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { I18nProvider } from "../src/i18n/I18nProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanup: Array<() => void> = [];

afterEach(async () => {
  await act(async () => cleanup.splice(0).forEach((unmount) => unmount()));
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
  localStorage.clear();
});

async function renderRoute(path: string): Promise<HTMLElement> {
  history.replaceState(null, "", path);
  const view = document.createElement("div");
  const root: Root = createRoot(view);
  document.body.appendChild(view);
  cleanup.push(() => root.unmount());
  await act(async () => {
    root.render(<I18nProvider><App /></I18nProvider>);
    if (path === "/tools/molecular-weight") await import("../src/pages/MolecularWeightPage");
    if (path === "/tools/theoretical-capacity") await import("../src/pages/TheoreticalCapacityPage");
  });
  return view;
}

async function setInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(form: HTMLFormElement) {
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

async function switchLanguage(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`Language button not found: ${label}`);
  await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("calculator routes", () => {
  it("calculates Ca(OH)2 molecular weight in English and Chinese", async () => {
    const view = await renderRoute("/tools/molecular-weight");
    const form = view.querySelector("form");
    const formula = view.querySelector<HTMLInputElement>('input[name="formula"]');
    if (!form || !formula) throw new Error("Molecular-weight form is missing");

    expect(form.noValidate).toBe(true);
    await setInput(formula, "Ca(OH)2");
    await submit(form);
    expect(view.textContent).toContain("Molecular Weight Calculator");
    expect(view.querySelector("#molecular-weight-result")?.textContent).toBe("Total molar mass");
    expect(view.querySelector('[aria-labelledby="molecular-weight-result"]')?.textContent).toContain("Chemical formula: Ca(OH)2");
    expect(view.querySelector("caption")?.textContent).toBe("Element contributions");
    expect(view.textContent).toContain("74.092");
    expect(view.textContent).toContain("Mass contribution");
    expect(view.querySelector("#molecular-weight-formula-help")?.textContent)
      .toContain("ASCII . is interpreted as a decimal stoichiometric count; hydrate notation using · is unsupported.");

    await switchLanguage(view, "中文");
    expect(view.querySelector("#molecular-weight-result")?.textContent).toBe("总摩尔质量");
    expect(view.querySelector('[aria-labelledby="molecular-weight-result"]')?.textContent).toContain("化学式：Ca(OH)2");
    expect(view.querySelector("caption")?.textContent).toBe("元素贡献");
    expect(view.textContent).toContain("质量贡献");
    expect(view.textContent).toContain("74.092");
    expect(view.querySelector("#molecular-weight-formula-help")?.textContent)
      .toContain("ASCII . 会被解释为化学计量数的小数点；不支持使用 · 的水合物表示法。");

    await switchLanguage(view, "EN");
    expect(view.textContent).toContain("Molecular Weight Calculator");
    expect(view.querySelector("#molecular-weight-result")?.textContent).toBe("Total molar mass");
    expect(view.textContent).toContain("74.092");
    expect(formula.value).toBe("Ca(OH)2");
  });

  it("calculates Nb2S2C theoretical capacity in English and Chinese", async () => {
    const view = await renderRoute("/tools/theoretical-capacity");
    const form = view.querySelector("form");
    const formula = view.querySelector<HTMLInputElement>('input[name="formula"]');
    const electrons = view.querySelector<HTMLInputElement>('input[name="electrons"]');
    if (!form || !formula || !electrons) throw new Error("Capacity form is missing");

    expect(form.noValidate).toBe(true);
    await setInput(formula, "Nb2S2C");
    await setInput(electrons, "4");
    await submit(form);
    expect(view.textContent).toContain("Theoretical Capacity Calculator");
    expect(view.querySelector("#capacity-result")?.textContent).toBe("Theoretical Specific Capacity");
    expect(view.querySelector('[aria-labelledby="capacity-result"]')?.textContent).toContain("Chemical formula: Nb2S2C");
    expect(view.textContent).toContain("Q = nF/(3.6M)");
    expect(view.textContent).toContain("F = Faraday constant (96485 C mol−1)");
    expect(view.textContent).toContain("M = molar mass (g mol−1)");
    expect(view.textContent).toContain("n = electron transfer number");
    expect(view.textContent).toContain("Q = nF/(3.6M) gives the theoretical specific capacity in mAh g−1.");
    expect(view.textContent).toContain("261.943");
    expect(view.textContent).toContain("409.272");
    expect(view.textContent).toContain("mAh g−1");
    expect(view.querySelector("#capacity-formula-help")?.textContent)
      .toContain("ASCII . is interpreted as a decimal stoichiometric count; hydrate notation using · is unsupported.");

    await switchLanguage(view, "中文");
    expect(view.querySelector("#capacity-result")?.textContent).toBe("理论比容量");
    expect(view.querySelector('[aria-labelledby="capacity-result"]')?.textContent).toContain("化学式：Nb2S2C");
    expect(view.textContent).toContain("F = 法拉第常数（96485 C mol−1）");
    expect(view.textContent).toContain("M = 摩尔质量（g mol−1）");
    expect(view.textContent).toContain("n = 电子转移数");
    expect(view.textContent).toContain("Q = nF/(3.6M) 得到以 mAh g−1 表示的理论比容量。");
    expect(view.textContent).toContain("409.272");
    expect(view.querySelector("#capacity-formula-help")?.textContent)
      .toContain("ASCII . 会被解释为化学计量数的小数点；不支持使用 · 的水合物表示法。");

    await switchLanguage(view, "EN");
    expect(view.querySelector("#capacity-result")?.textContent).toBe("Theoretical Specific Capacity");
    expect(formula.value).toBe("Nb2S2C");
    expect(electrons.value).toBe("4");
  });

  it.each([
    ["/tools/molecular-weight", "CuSO4·5H2O", "Enter a formula without hydrate notation.", "请输入不含水合物符号的化学式。"],
    ["/tools/molecular-weight", "Xx2O", "Unknown element: Xx.", "未知元素：Xx。"],
    ["/tools/molecular-weight", "", "This field is required.", "此字段为必填项。"],
    ["/tools/theoretical-capacity", "CuSO4·5H2O", "Enter a formula without hydrate notation.", "请输入不含水合物符号的化学式。"],
    ["/tools/theoretical-capacity", "Xx2O", "Unknown element: Xx.", "未知元素：Xx。"],
    ["/tools/theoretical-capacity", "", "This field is required.", "此字段为必填项。"]
  ])("shows localized formula errors for %s", async (path, value, expectedError, expectedChineseError) => {
    const view = await renderRoute(path);
    const form = view.querySelector("form");
    const formula = view.querySelector<HTMLInputElement>('input[name="formula"]');
    if (!form || !formula) throw new Error("Calculator formula form is missing");
    await setInput(formula, value);
    await submit(form);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain(expectedError);
    expect(formula.value).toBe(value);

    await switchLanguage(view, "中文");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain(expectedChineseError);

    await switchLanguage(view, "EN");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain(expectedError);
    expect(formula.value).toBe(value);
  });

  it.each(["0", "-1", "Infinity", "NaN", ""])
  ("rejects invalid electron input %s without clearing the form", async (value) => {
    const view = await renderRoute("/tools/theoretical-capacity");
    const form = view.querySelector("form");
    const formula = view.querySelector<HTMLInputElement>('input[name="formula"]');
    const electrons = view.querySelector<HTMLInputElement>('input[name="electrons"]');
    if (!form || !formula || !electrons) throw new Error("Capacity form is missing");
    await setInput(formula, "Nb2S2C");
    await setInput(electrons, value);
    await submit(form);
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("Enter a positive finite number.");
    expect(electrons.value).toBe(value);

    await switchLanguage(view, "中文");
    expect(view.querySelector('[aria-live="polite"]')?.textContent).toContain("请输入正的有限数字。");
  });

  it("does not render an infinite capacity for a finite overflowing electron count", async () => {
    const view = await renderRoute("/tools/theoretical-capacity");
    const form = view.querySelector("form");
    const formula = view.querySelector<HTMLInputElement>('input[name="formula"]');
    const electrons = view.querySelector<HTMLInputElement>('input[name="electrons"]');
    if (!form || !formula || !electrons) throw new Error("Capacity form is missing");
    await setInput(formula, "Nb2S2C");
    await setInput(electrons, "1e308");
    await submit(form);

    expect(view.querySelector('[aria-live="polite"]')?.textContent)
      .toContain("Calculated theoretical capacity must be a finite positive number.");
    expect(view.textContent).not.toContain("Infinity");
    expect(view.textContent).not.toContain("NaN");
    expect(electrons.value).toBe("1e308");

    await switchLanguage(view, "中文");
    expect(view.querySelector('[aria-live="polite"]')?.textContent)
      .toContain("计算得到的理论容量必须是正的有限数值。");
  });

  it("keeps a valid extreme molar mass from being reported as an electron-input error", async () => {
    const view = await renderRoute("/tools/theoretical-capacity");
    const form = view.querySelector("form");
    const formula = view.querySelector<HTMLInputElement>('input[name="formula"]');
    const electrons = view.querySelector<HTMLInputElement>('input[name="electrons"]');
    if (!form || !formula || !electrons) throw new Error("Capacity form is missing");
    await setInput(formula, `H1${"0".repeat(308)}`);
    await setInput(electrons, "1");
    await submit(form);

    expect(view.querySelector('[aria-live="polite"]')?.textContent).toBe("");
    expect(view.textContent).toContain("mAh g−1");
    expect(view.textContent).not.toContain("Infinity");
    expect(view.textContent).not.toContain("NaN");
  });
});
