import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import App from "../src/App";
import { I18nProvider } from "../src/i18n/I18nProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("App", () => {
  it("hides the material detail template when explorer filters return zero rows", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<I18nProvider><App /></I18nProvider>);
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

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
