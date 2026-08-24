import { readFile } from "node:fs/promises";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { I18nProvider } from "../src/i18n/I18nProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
  localStorage.clear();
});

async function renderRoute(path: string) {
  history.replaceState(null, "", path);
  const view = document.createElement("div");
  document.body.appendChild(view);
  const root = createRoot(view);
  roots.push(root);
  await act(async () => root.render(<I18nProvider><App /></I18nProvider>));
  return view;
}

async function setInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(form: HTMLFormElement) {
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

function expectLabeledControls(view: HTMLElement) {
  for (const control of view.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
    const id = control.id;
    const explicitlyLabeled = id !== "" && view.querySelector(`label[for="${id}"]`) !== null;
    const implicitlyLabeled = control.closest("label") !== null;
    expect(explicitlyLabeled || implicitlyLabeled || control.hasAttribute("aria-label"), control.outerHTML).toBe(true);
  }
}

describe("Tools page markup", () => {
  it.each([
    "/tools",
    "/tools/cv-kinetics",
    "/tools/theoretical-capacity",
    "/tools/molecular-weight"
  ])("provides one page heading, breadcrumb navigation, and native keyboard controls on %s", async (path) => {
    const view = await renderRoute(path);

    expect(view.querySelectorAll("h1")).toHaveLength(1);
    expect(view.querySelector('nav.breadcrumb-nav[aria-label="Breadcrumb"]')).not.toBeNull();
    expectLabeledControls(view);
    for (const control of view.querySelectorAll("a, button")) {
      expect(control.getAttribute("tabindex")).not.toBe("-1");
    }
  });

  it("exposes a compact two-button language group with pressed state", async () => {
    const view = await renderRoute("/tools");
    const switcher = view.querySelector('[role="group"].language-switch');
    const buttons = switcher?.querySelectorAll("button") ?? [];

    expect(buttons).toHaveLength(2);
    expect([...buttons].map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
  });

  it.each([
    ["/tools/theoretical-capacity", "#capacity-error"],
    ["/tools/molecular-weight", "#molecular-weight-error"],
    ["/tools/cv-kinetics", ".cv-import [aria-live=\"polite\"]"]
  ])("keeps validation messages in a polite live region on %s", async (path, selector) => {
    const view = await renderRoute(path);
    expect(view.querySelector(selector)?.getAttribute("aria-live")).toBe("polite");
  });

  it("uses responsive layout hooks and table-based calculator result regions", async () => {
    const capacity = await renderRoute("/tools/theoretical-capacity");
    expect(capacity.querySelector(".tool-layout")).not.toBeNull();
    await setInput(capacity.querySelector<HTMLInputElement>('#capacity-formula')!, "Nb2S2C");
    await setInput(capacity.querySelector<HTMLInputElement>('#capacity-electrons')!, "4");
    await submit(capacity.querySelector<HTMLFormElement>("form")!);
    expect(capacity.querySelector(".tool-result-table table")).not.toBeNull();

    const molecular = await renderRoute("/tools/molecular-weight");
    expect(molecular.querySelector(".tool-layout")).not.toBeNull();
    await setInput(molecular.querySelector<HTMLInputElement>('#molecular-weight-formula')!, "Ca(OH)2");
    await submit(molecular.querySelector<HTMLFormElement>("form")!);
    expect(molecular.querySelector(".tool-result-table table")).not.toBeNull();

    const cv = await renderRoute("/tools/cv-kinetics");
    expect(cv.querySelector(".tool-layout")).not.toBeNull();
    expect(cv.querySelectorAll('.scientific-chart-empty[role="status"]')).toHaveLength(4);
  });
});

describe("Tools static integration", () => {
  it("defines scoped desktop/mobile layout, overflow, chart, focus, and compact-language styles", async () => {
    const css = await readFile("src/styles/global.css", "utf8");

    expect(css).toMatch(/\.tool-layout\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*?\.tool-layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(css).toMatch(/\.tool-table-wrap[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\.scientific-chart-svg[^}]*width:\s*100%/s);
    expect(css).toMatch(/\.tools-page[^}]*:focus-visible|\.tools-page\s+:is\([^}]*\):focus-visible/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*520px\)[\s\S]*?\.language-switch/s);
  });

  it("keeps root metadata database-focused", async () => {
    const html = await readFile("index.html", "utf8");
    expect(html).toContain("TMCC Database | Transition Metal Carbochalcogenide Materials");
    expect(html).toContain('<link rel="canonical" href="https://tmccdb.org/"');
    expect(html).not.toContain("/en/");
    expect(html).not.toContain("/zh/");
  });

  it("lists the root and four exact Tools URLs without language routes", async () => {
    const sitemap = await readFile("public/sitemap.xml", "utf8");
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    expect(locations).toEqual([
      "https://tmccdb.org/",
      "https://tmccdb.org/tools",
      "https://tmccdb.org/tools/cv-kinetics",
      "https://tmccdb.org/tools/theoretical-capacity",
      "https://tmccdb.org/tools/molecular-weight"
    ]);
    expect(sitemap).not.toMatch(/tmccdb\.org\/(?:en|zh)\//);
  });
});
