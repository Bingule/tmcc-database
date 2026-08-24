import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { normalizePathname } from "../src/lib/routes";

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

async function renderApp(): Promise<HTMLElement> {
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
  });

  return view;
}

describe("normalizePathname", () => {
  it("maps only the supported paths after removing trailing slashes", () => {
    expect(normalizePathname("/")).toBe("home");
    expect(normalizePathname("/tools/")).toBe("tools");
    expect(normalizePathname("/tools/cv-kinetics")).toBe("cvKinetics");
    expect(normalizePathname("/tools/theoretical-capacity")).toBe("theoreticalCapacity");
    expect(normalizePathname("/tools/molecular-weight")).toBe("molecularWeight");
    expect(normalizePathname("/other")).toBe("notFound");
  });
});

describe("App routes", () => {
  it("keeps the CV tool route available while calculator routes use their dedicated pages", async () => {
    history.replaceState(null, "", "/tools/cv-kinetics");
    const view = await renderApp();

    expect(view.querySelector("h1")?.textContent).toBe("CV Kinetics Analysis");
  });

  it("keeps homepage anchors local and sends Tools visitors back to the homepage sections", async () => {
    history.replaceState(null, "", "/");
    const home = await renderApp();

    for (const href of ["#selector", "#periodic-table", "#explorer", "#methodology"]) {
      expect(home.querySelector(`nav.top-nav a[href="${href}"]`)).not.toBeNull();
    }

    history.replaceState(null, "", "/tools");
    const tools = await renderApp();

    for (const href of ["/#selector", "/#periodic-table", "/#explorer", "/#methodology"]) {
      expect(tools.querySelector(`nav.top-nav a[href="${href}"]`)).not.toBeNull();
    }
  });

  it("renders one Tools navigation link and no homepage tool cards", async () => {
    history.replaceState(null, "", "/");
    const view = await renderApp();

    expect(view.querySelectorAll('nav a[href="/tools"]')).toHaveLength(1);
    expect(view.textContent).not.toContain("b-value and Dunn");
  });
});
