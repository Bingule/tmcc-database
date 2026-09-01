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
    if (path === "/tools/reviewer-two") await import("../src/tools/reviewer-two/pages/ReviewerTwoPage");
    if (path === "/tools/rate-performance") await import("../src/tools/rate-performance/pages/RatePerformanceAnalysisPage");
    if (path === "/tools/rate-performance/model-comparison") await import("../src/tools/rate-performance/pages/ModelComparisonPage");
    if (path === "/missing") await import("../src/pages/NotFoundPage");
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
  it("provides responsive and accessible feedback panel styles", async () => {
    const css = await readFile("src/styles/global.css", "utf8");

    expect(css).toMatch(/\.tool-feedback-panel\s*\{[^}]*border-top:/s);
    expect(css).toMatch(/\.tool-feedback-grid\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.tool-feedback-status\s*\{[^}]*min-height:/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.tool-feedback-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });

  it.each([
    "/tools",
    "/tools/cv-kinetics",
    "/tools/rate-performance",
    "/tools/rate-performance/model-comparison",
    "/tools/reviewer-two"
  ])("shows the approved feedback panel exactly once at the bottom of %s", async (path) => {
    const view = await renderRoute(path);
    const panels = view.querySelectorAll(".tool-feedback-panel");

    expect(panels).toHaveLength(1);
    const contact = panels[0].querySelector(".tool-feedback-contact");
    expect(contact?.tagName).toBe("P");
    expect(contact?.textContent).toBe("Found an issue, got an unexpected result, or have a suggestion? Contact Dr. Wu at wui@vscht.cz");
    expect(contact?.textContent?.match(/Dr\. Wu/g)).toHaveLength(1);
    expect(contact?.querySelector("a")?.getAttribute("href")).toBe("mailto:wui@vscht.cz");
  });

  it("does not show the Tools contact note on non-Tools pages", async () => {
    const view = await renderRoute("/missing");
    expect(view.querySelector(".tool-feedback-panel")).toBeNull();
  });

  it.each([
    "/tools",
    "/tools/cv-kinetics",
    "/tools/theoretical-capacity",
    "/tools/molecular-weight",
    "/tools/rate-performance"
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
      { title: "Molecular Weight Calculator", description: "Calculate molar mass and elemental mass contributions from chemical formulas." },
      { title: "Reviewer Two", description: "Launch an evidence-grounded scientific peer-review workflow in an authorized private environment." },
      { title: "Rate Performance", description: "Analyze rate capability and compare validated kinetic models." }
    ]);

    await switchToChinese(view);
    expect(view.querySelector("h1")?.textContent).toBe("材料研究工具");
    expect(view.querySelector(".tool-page-header p")?.textContent).toBe("用于电化学与材料研究的在线工具。");
    expect(readCards()).toEqual([
      { title: "CV 动力学分析", description: "基于多扫描速率 CV 数据进行 b 值与 Dunn 电容贡献分析。" },
      { title: "理论容量计算器", description: "根据化学式和电子转移数计算理论比容量。" },
      { title: "分子量计算器", description: "根据化学式计算摩尔质量和各元素质量贡献。" },
      { title: "科学论文预审", description: "在获得授权的私有环境中启动基于证据的科学论文审稿工作流。" },
      { title: "倍率性能", description: "分析倍率性能并比较经验证的动力学模型。" }
    ]);
  });

  it.each([
    ["/tools", "Materials Research Tools", "材料研究工具"],
    ["/tools/cv-kinetics", "CV Kinetics Analysis", "CV 动力学分析"],
    ["/tools/theoretical-capacity", "Theoretical Capacity Calculator", "理论容量计算器"],
    ["/tools/molecular-weight", "Molecular Weight Calculator", "分子量计算器"],
    ["/tools/rate-performance", "Rate Performance Analysis", "倍率性能分析"]
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

    expect(fieldsets).toHaveLength(4);
    expect(fieldsets.every((fieldset) => fieldset.querySelector("legend") !== null)).toBe(true);
    expect(formatChoices.getAttribute("aria-invalid")).toBe("true");
    expect(formatChoices.classList.contains("cv-format-choices-invalid")).toBe(true);
    expect([...formatChoices.querySelectorAll<HTMLInputElement>('input[name="cv-layout"]')]
      .every((radio) => radio.getAttribute("aria-invalid") === "true")).toBe(true);
    expect(importPanel.querySelectorAll(".cv-format-choice")).toHaveLength(2);
    expect(importPanel.querySelectorAll(".cv-format-choice code")).toHaveLength(2);
    expect(importPanel.querySelectorAll(".cv-format-choice table")).toHaveLength(2);

    expect(importPanel.querySelector("#cv-point-interval")).toBeNull();
    const ids = [
      "cv-file-input",
      "cv-scan-rates",
      "cv-potential-interval-mode",
      "cv-potential-interval-mv",
      "cv-r-squared-threshold",
      "cv-turning-trim-mode",
      "cv-turning-trim-mv"
    ];
    for (const id of ids) expect(importPanel.querySelector(`label[for=\"${id}\"]`)).not.toBeNull();

    const pasteSource = importPanel.querySelector<HTMLInputElement>('input[name="cv-source"][value="paste"]')!;
    await act(async () => pasteSource.click());
    const textarea = importPanel.querySelector<HTMLTextAreaElement>("textarea#cv-paste-text")!;
    expect(textarea.labels?.[0]?.htmlFor).toBe("cv-paste-text");
    expect(textarea.getAttribute("aria-label")).not.toBeNull();

    const interval = importPanel.querySelector<HTMLSelectElement>("#cv-potential-interval-mode")!;
    const thresholdMode = importPanel.querySelector<HTMLInputElement>("#cv-dunn-method-threshold")!;
    const weightedMode = importPanel.querySelector<HTMLInputElement>("#cv-dunn-method-weighted")!;
    const trimMode = importPanel.querySelector<HTMLSelectElement>("#cv-turning-trim-mode")!;
    const threshold = importPanel.querySelector<HTMLInputElement>("#cv-r-squared-threshold")!;
    expect(interval.disabled).toBe(false);
    expect(thresholdMode.disabled).toBe(false);
    expect(weightedMode.disabled).toBe(false);
    expect(trimMode.disabled).toBe(false);
    expect(threshold.disabled).toBe(false);
    expect(view.textContent).toContain("Smoothing: Auto");
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
    const cvLayout = cv.querySelector(".tool-layout.cv-tool-layout");
    expect(cvLayout).not.toBeNull();
    expect(cvLayout?.querySelector(":scope > .cv-import.cv-import-wide")).not.toBeNull();
    expect(cvLayout?.querySelector(":scope > .cv-b-analysis")).not.toBeNull();
    expect(cvLayout?.querySelector(":scope > .cv-dunn-analysis")).not.toBeNull();
    expect(cvLayout?.querySelector(":scope > .cv-results.tool-section-wide")).not.toBeNull();
    expect(cvLayout?.querySelector(":scope > .cv-export.tool-section-wide")).not.toBeNull();
    expect(cv.querySelector(".cv-import .cv-analysis-actions > button[name=\"cv-analyze\"] + .tool-validation")).not.toBeNull();
    expect(cv.querySelector<HTMLSelectElement>('select[name="bAnalysisMode"]')?.value).toBe("peak");
    expect(cv.querySelector('[data-panel-id="cv-potential-b-analysis"]')).toBeNull();
    expect(cv.querySelectorAll('.scientific-chart-empty[role="status"]')).toHaveLength(2);
    expect((await readFile("src/pages/CvKineticsPage.tsx", "utf8"))).toContain('t("cv.table.sweepBranch")');
  });
});

describe("Tools static integration", () => {
  it("defines scoped desktop/mobile layout, overflow, chart, focus, and compact-language styles", async () => {
    const css = await readFile("src/styles/global.css", "utf8");

    expect(css).toMatch(/body\s*\{[^}]*min-width:\s*0/s);
    expect(css).toMatch(/\.tool-layout\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*?\.tool-layout\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(css).toMatch(/\.tool-table-wrap[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\.cv-result-table-frame-scroll\s*\{[^}]*--cv-visible-table-rows:\s*12/s);
    expect(css).toMatch(/\.cv-result-table-frame-scroll\s+\.cv-result-table-viewport\s*\{[^}]*max-height:\s*calc\(43px\s*\*\s*\(var\(--cv-visible-table-rows\)\s*\+\s*1\)\)[^}]*overflow-y:\s*auto/s);
    expect(css).toMatch(/\.cv-result-table-frame-scroll\s+\.cv-result-table-viewport\s+thead\s+th\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/s);
    expect(css).toMatch(/\.scientific-chart-svg[^}]*width:\s*100%/s);
    expect(css).toMatch(/\.scientific-chart-point:focus-visible\s*\{[^}]*stroke:\s*#[0-9a-f]{6}[^}]*stroke-width:\s*[2-9]/s);
    expect(css).toMatch(/\.tools-page[^}]*:focus-visible|\.tools-page\s+:is\([^}]*\):focus-visible/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*520px\)[\s\S]*?\.language-switch/s);
    expect(css).toMatch(/\.cv-import-fieldset\s+input\[type=\"radio\"\][^}]*width:\s*auto/s);
    expect(css).toMatch(/\.cv-file-source\s+\.cv-file-input\s*\{[^}]*width:\s*1px[^}]*height:\s*1px[^}]*min-height:\s*1px/s);
    expect(css).toMatch(/\.cv-paste-source\s+textarea[^}]*width:\s*100%[^}]*min-height:\s*1[2-9]0px/s);
    expect(css).toMatch(/\.cv-format-choices\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).toMatch(/\.cv-analysis-settings\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).toMatch(/\.cv-settings-diagnostics\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(280px,\s*0\.8fr\)/s);
    expect(css).toMatch(/\.cv-diagnostics-list\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/s);
    expect(css).toMatch(/\.cv-data-input\s*\{[^}]*box-shadow:\s*inset\s+4px\s+0\s+0/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*520px\)[\s\S]*?\.cv-analysis-settings\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(css).toMatch(/\.tools-page\s+:is\([^}]*textarea[^}]*\):focus-visible/s);
    expect(css).toMatch(/\.cv-import\s+\.tool-validation:empty[^}]*display:\s*none/s);
    expect(css).toMatch(/\.cv-import\s+button:disabled[^}]*cursor:\s*not-allowed/s);
    expect(css).toMatch(/\.cv-import\s*\{[^}]*min-width:\s*0/s);
    expect(css).toMatch(/\.cv-preview\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/s);
    expect(css).toMatch(/\.cv-preview\s+\.tool-table-wrap\s*\{[^}]*width:\s*100%[^}]*overflow-x:\s*auto/s);
    expect(css).toMatch(/\.cv-import\s+\.tool-validation\s*\{[^}]*color:\s*#[0-9a-f]{6}/s);
    expect(css).toMatch(/\.cv-format-choices-invalid\s*\{[^}]*border-color:\s*#[0-9a-f]{6}/s);
    expect(css).toMatch(/\.cv-tool-layout\s+\.cv-import-wide\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
    expect(css).toMatch(/\.cv-import\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(css).toMatch(/\.cv-import\s*>\s*:is\([^}]*\.cv-preview[^}]*\)\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*?\.cv-import\s*\{[^}]*grid-template-columns:\s*1fr/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*?\.cv-tool-layout\s+\.cv-import-wide\s*\{[^}]*grid-column:\s*auto/s);
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
