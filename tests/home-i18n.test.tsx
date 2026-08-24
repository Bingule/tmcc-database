import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { I18nProvider } from "../src/i18n/I18nProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanup: Array<() => void> = [];

afterEach(async () => {
  await act(async () => {
    cleanup.splice(0).forEach((unmount) => unmount());
  });
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
  localStorage.clear();
});

async function renderHome(): Promise<HTMLElement> {
  Element.prototype.scrollIntoView ??= () => undefined;
  await import("../src/components/StructureViewer");
  const view = document.createElement("div");
  const root: Root = createRoot(view);
  document.body.appendChild(view);
  cleanup.push(() => root.unmount());

  await act(async () => {
    root.render(
      <I18nProvider>
        <App />
      </I18nProvider>
    );
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });

  return view;
}

function expectText(view: HTMLElement, labels: string[]) {
  for (const label of labels) expect(view.textContent).toContain(label);
}

async function switchLanguage(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`Language button not found: ${label}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function setInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("homepage localization", () => {
  it("renders every homepage component boundary in English and Simplified Chinese", async () => {
    const view = await renderHome();

    expectText(view, [
      "Database at a glance",
      "Material selector",
      "Periodic Table",
      "Materials Explorer",
      "Crystal Structure",
      "XRD / PDF",
      "References / Methodology",
      "Export CSV"
    ]);
    expect(view.querySelector(".brand-lockup")?.textContent).toBe("TMCC Database v0.1");
    expect(view.querySelector('[aria-label="Structure viewer controls"]')).not.toBeNull();
    expect(view.querySelector('[aria-label="DOS and band structure viewer"]')).not.toBeNull();

    await switchLanguage(view, "中文");

    expectText(view, [
      "数据库概览",
      "材料选择器",
      "元素周期表",
      "材料浏览器",
      "晶体结构",
      "XRD／PDF",
      "参考文献 / 研究方法",
      "导出 CSV"
    ]);
    expect(view.querySelector(".brand-lockup")?.textContent).toBe("TMCC 数据库 v0.1");
    expect(view.querySelector('[aria-label="结构查看器控件"]')).not.toBeNull();
    expect(view.querySelector('[aria-label="DOS 与能带结构查看器"]')).not.toBeNull();
    expect(view.querySelector("#material-detail")?.textContent).toContain("三方晶类（-3m）");
    expect(view.textContent).toContain("Nb2S2C");
    expect(view.textContent).toContain("P-3m1");
  });

  it("localizes a selected hexagonal material without changing its English data value", async () => {
    const view = await renderHome();
    await switchLanguage(view, "中文");
    const searchInput = view.querySelector<HTMLInputElement>('#explorer input[placeholder="TMCC-0001, Nb2S2C, P-3m1"]');
    if (!searchInput) throw new Error("Explorer search input not found");
    await setInputValue(searchInput, "TMCC-0011");
    const materialButton = [...view.querySelectorAll<HTMLButtonElement>("#explorer tbody button")]
      .find((button) => button.textContent === "TMCC-0011");
    if (!materialButton) throw new Error("TMCC-0011 result not found");
    await act(async () => materialButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(view.querySelector("#material-detail")?.textContent).toContain("六方晶系");
    expect(view.querySelector("#material-detail")?.textContent).not.toContain("hexagonal");

    await switchLanguage(view, "EN");
    expect(view.querySelector("#material-detail")?.textContent).toContain("hexagonal");
  });
});
