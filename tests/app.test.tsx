import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import App from "../src/App";
import { I18nProvider } from "../src/i18n/I18nProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("App", () => {
  it("hides the material detail template when explorer filters return zero rows", async () => {
    await import("../src/components/StructureViewer");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<I18nProvider><App /></I18nProvider>);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Material page template");

    const searchInput = container.querySelector<HTMLInputElement>("#explorer input[placeholder*='TMCC-0001']");
    await act(async () => {
      if (!searchInput) throw new Error("Explorer search input not found");
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(searchInput, "zzzz-no-matching-material");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("0 of 0");
    expect(container.textContent).not.toContain("Material page template");
    expect(container.textContent).toContain("References / Methodology");

    const chineseButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "中文");
    await act(async () => {
      if (!chineseButton) throw new Error("Chinese language button not found");
      chineseButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      if (!searchInput) throw new Error("Explorer search input not found");
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(searchInput, "");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      if (!searchInput) throw new Error("Explorer search input not found");
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(searchInput, "zzzz-no-matching-material");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("0 / 0");
    expect(container.textContent).not.toContain("材料页面模板");
    expect(container.textContent).toContain("参考文献 / 研究方法");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
