import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PeriodicTable } from "../src/components/PeriodicTable";
import { I18nProvider } from "../src/i18n/I18nProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

describe("accessibility regressions", () => {
  it("identifies periodic-table buttons by full element name and symbol", async () => {
    const view = document.createElement("div");
    const root = createRoot(view);
    document.body.appendChild(view);

    await act(async () => root.render(
      <I18nProvider>
        <PeriodicTable materials={[]} onMetalSelect={() => undefined} onElementSearch={() => undefined} />
      </I18nProvider>
    ));

    expect(view.querySelector('button.element[aria-label^="Hydrogen (H):"]')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
