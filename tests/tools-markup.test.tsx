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
  await act(async () => {
    root.render(<I18nProvider><App /></I18nProvider>);
    if (path === "/tools") await import("../src/pages/ToolsPage");
    if (path === "/tools/cv-kinetics") await import("../src/pages/CvKineticsPage");
    if (path === "/tools/theoretical-capacity") await import("../src/pages/TheoreticalCapacityPage");
    if (path === "/tools/molecular-weight") await import("../src/pages/MolecularWeightPage");
  });
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

async function switchToChinese(view: HTMLElement) {
  const buttons = view.querySelectorAll<HTMLButtonElement>(".language-switch button");
  await act(async () => buttons[1].click());
}

function breadcrumbParts(view: HTMLElement) {
  const breadcrumb = view.querySelector<HTMLElement>("nav.breadcrumb-nav");
  return [...(breadcrumb?.children ?? [])].map((item) => item.textContent?.trim());
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
    expect(view.querySelector("nav.breadcrumb-nav")).not.toBeNull();
    expectLabeledControls(view);
    for (const control of view.querySelectorAll("a, button")) {
      expect(control.getAttribute("tabindex")).not.toBe("-1");
    }
  });

  it("uses the approved bilingual Tools landing copy", async () => {
    const view = await renderRoute("/tools");
    const readCards = () => [...view.querySelectorAll(".tool-card")].map((card) => ({
      title: card.querySelector("a")?.textContent,
      description: card.querySelector("p")?.textContent
    }));

    expect(view.querySelector("h1")?.textContent).toBe("Materials Research Tools");
    expect(view.querySelector(".tool-page-header p")?.textContent).toBe("Online tools for electrochemistry and materials research.");
    expect(readCards()).toEqual([
      { title: "CV Kinetics Analysis", description: "b-value and Dunn capacitive contribution analysis from multi-scan-rate CV data." },
      { title: "Theoretical Capacity Calculator", description: "Calculate theoretical specific capacity from chemical formula and electron transfer number." },
      { title: "Molecular Weight Calculator", description: "Calculate molar mass and elemental mass contributions from chemical formulas." }
    ]);

    await switchToChinese(view);
    expect(view.querySelector("h1")?.textContent).toBe("材料研究工具");
    expect(view.querySelector(".tool-page-header p")?.textContent).toBe("用于电化学与材料研究的在线工具。");
    expect(readCards()).toEqual([
      { title: "CV 动力学分析", description: "基于多扫描速率 CV 数据进行 b 值与 Dunn 电容贡献分析。" },
      { title: "理论容量计算器", description: "根据化学式和电子转移数计算理论比容量。" },
      { title: "分子量计算器", description: "根据化学式计算摩尔质量和各元素质量贡献。" }
    ]);
  });

  it.each([
    ["/tools", "Materials Research Tools", "材料研究工具"],
    ["/tools/cv-kinetics", "CV Kinetics Analysis", "CV 动力学分析"],
    ["/tools/theoretical-capacity", "Theoretical Capacity Calculator", "理论容量计算器"],
    ["/tools/molecular-weight", "Molecular Weight Calculator", "分子量计算器"]
  ])("uses full bilingual titles and the correct breadcrumb depth on %s", async (path, englishTitle, chineseTitle) => {
    const view = await renderRoute(path);
    const breadcrumb = view.querySelector<HTMLElement>("nav.breadcrumb-nav")!;

    expect(view.querySelector("h1")?.textContent).toBe(englishTitle);
    expect(breadcrumb.getAttribute("aria-label")).toBe("Breadcrumb");
    expect(breadcrumbParts(view)).toEqual(path === "/tools"
      ? ["Home", "/", "Tools"]
      : ["Home", "/", "Tools", "/", englishTitle]);
    expect(breadcrumb.querySelector('[aria-current="page"]')?.textContent).toBe(path === "/tools" ? "Tools" : englishTitle);

    await switchToChinese(view);
    expect(view.querySelector("h1")?.textContent).toBe(chineseTitle);
    expect(breadcrumb.getAttribute("aria-label")).toBe("面包屑");
    expect(breadcrumbParts(view)).toEqual(path === "/tools"
      ? ["首页", "/", "工具"]
      : ["首页", "/", "工具", "/", chineseTitle]);
    expect(breadcrumb.querySelector('[aria-current="page"]')?.textContent).toBe(path === "/tools" ? "工具" : chineseTitle);
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
    ["/tools/molecular-weight", "#molecular-weight-error"]
  ])("keeps validation messages in a polite live region on %s", async (path, selector) => {
    const view = await renderRoute(path);
    expect(view.querySelector(selector)?.getAttribute("aria-live")).toBe("polite");
  });

  it("uses one non-conflicting polite status region for CV errors", async () => {
    const view = await renderRoute("/tools/cv-kinetics");
    const region = view.querySelector<HTMLElement>(".cv-import .tool-validation")!;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  it("uses semantic, labeled import controls with responsive styling hooks", async () => {
    const view = await renderRoute("/tools/cv-kinetics");
    const importPanel = view.querySelector<HTMLElement>(".cv-import")!;
    const fieldsets = [...importPanel.querySelectorAll("fieldset.cv-import-fieldset")];
    const formatChoices = importPanel.querySelector<HTMLElement>(".cv-format-choices")!;

    expect(fieldsets).toHaveLength(3);
    expect(fieldsets.every((fieldset) => fieldset.querySelector("legend") !== null)).toBe(true);
    expect(formatChoices.getAttribute("aria-invalid")).toBe("true");
    expect(formatChoices.classList.contains("cv-format-choices-invalid")).toBe(true);
    expect([...formatChoices.querySelectorAll<HTMLInputElement>('input[name="cv-layout"]')]
      .every((radio) => radio.getAttribute("aria-invalid") === "true")).toBe(true);
    expect(importPanel.querySelectorAll(".cv-format-choice")).toHaveLength(2);
    expect(importPanel.querySelectorAll(".cv-format-choice code")).toHaveLength(2);
    expect(importPanel.querySelectorAll(".cv-format-choice table")).toHaveLength(2);

    const ids = ["cv-file-input", "cv-scan-rates", "cv-point-interval", "cv-r-squared-threshold"];
    for (const id of ids) expect(importPanel.querySelector(`label[for=\"${id}\"]`)).not.toBeNull();

    const pasteSource = importPanel.querySelector<HTMLInputElement>('input[name="cv-source"][value="paste"]')!;
    await act(async () => pasteSource.click());
    const textarea = importPanel.querySelector<HTMLTextAreaElement>("textarea#cv-paste-text")!;
    expect(textarea.labels?.[0]?.htmlFor).toBe("cv-paste-text");
    expect(textarea.getAttribute("aria-label")).not.toBeNull();

    const interval = importPanel.querySelector<HTMLSelectElement>("#cv-point-interval")!;
    const threshold = importPanel.querySelector<HTMLInputElement>("#cv-r-squared-threshold")!;
    expect(interval.disabled).toBe(false);
    expect(threshold.disabled).toBe(false);
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
    expect(css).toMatch(/\.scientific-chart-point:focus-visible\s*\{[^}]*stroke:\s*#[0-9a-f]{6}[^}]*stroke-width:\s*[2-9]/s);
    expect(css).toMatch(/\.tools-page[^}]*:focus-visible|\.tools-page\s+:is\([^}]*\):focus-visible/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*520px\)[\s\S]*?\.language-switch/s);
    expect(css).toMatch(/\.cv-import-fieldset\s+input\[type=\"radio\"\][^}]*width:\s*auto/s);
    expect(css).toMatch(/\.cv-paste-source\s+textarea[^}]*width:\s*100%[^}]*min-height:\s*1[2-9]0px/s);
    expect(css).toMatch(/\.cv-format-choices\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).toMatch(/\.cv-analysis-settings\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*520px\)[\s\S]*?\.cv-analysis-settings\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(css).toMatch(/\.tools-page\s+:is\([^}]*textarea[^}]*\):focus-visible/s);
    expect(css).toMatch(/\.cv-import\s+\.tool-validation:empty[^}]*display:\s*none/s);
    expect(css).toMatch(/\.cv-import\s+button:disabled[^}]*cursor:\s*not-allowed/s);
    expect(css).toMatch(/\.cv-import\s*\{[^}]*min-width:\s*0/s);
    expect(css).toMatch(/\.cv-preview\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s);
    expect(css).toMatch(/\.cv-preview\s+\.tool-table-wrap\s*\{[^}]*width:\s*100%[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\.cv-import\s+\.tool-validation\s*\{[^}]*color:\s*#[0-9a-f]{6}/s);
    expect(css).toMatch(/\.cv-format-choices-invalid\s*\{[^}]*border-color:\s*#[0-9a-f]{6}/s);
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
