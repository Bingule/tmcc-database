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
    const path = window.location.pathname;
    if (path === "/") await import("../src/components/StructureViewer");
    if (path === "/tools") await import("../src/pages/ToolsPage");
    if (path === "/tools/cv-kinetics") await import("../src/pages/CvKineticsPage");
    if (path === "/tools/theoretical-capacity") await import("../src/pages/TheoreticalCapacityPage");
    if (path === "/tools/molecular-weight") await import("../src/pages/MolecularWeightPage");
    if (!path.startsWith("/tools") && path !== "/") await import("../src/pages/NotFoundPage");
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
  it("localizes the not-found route and breadcrumb without changing the route", async () => {
    history.replaceState(null, "", "/missing");
    const view = await renderApp();

    expect(view.querySelector("h1")?.textContent).toBe("Page not found");
    expect(view.querySelector('[aria-current="page"]')?.textContent).toBe("Page not found");

    const chinese = [...view.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "中文");
    await act(async () => chinese?.click());

    expect(window.location.pathname).toBe("/missing");
    expect(view.querySelector("h1")?.textContent).toBe("页面未找到");
    expect(view.querySelector('[aria-current="page"]')?.textContent).toBe("页面未找到");
  });

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
