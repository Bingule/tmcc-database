import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SiteFooter } from "../src/components/SiteFooter";
import { I18nProvider } from "../src/i18n/I18nProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: ReturnType<typeof createRoot>[] = [];

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});

describe("SiteFooter", () => {
  it("shows release v1.1 and the injected Budapest build date", async () => {
    const view = document.createElement("div");
    document.body.appendChild(view);
    const root = createRoot(view);
    roots.push(root);

    await act(async () => root.render(
      <I18nProvider><SiteFooter buildDate="2026-09-01" /></I18nProvider>
    ));

    expect(view.querySelector("footer")?.children[0].textContent).toBe("TMCC Database v1.1");
    expect(view.querySelector("footer")?.children[1].textContent).toBe("Last update: 2026-09-01");
  });
});
