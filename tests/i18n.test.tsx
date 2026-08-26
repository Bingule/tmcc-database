import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, resolveTranslation, useI18n } from "../src/i18n/I18nProvider";
import { en } from "../src/locales/en";
import { zh } from "../src/locales/zh";
import { getCrystalSystemTranslationKey } from "../src/i18n/displayLabels";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanup: Array<() => void> = [];

afterEach(async () => {
  await act(async () => {
    cleanup.splice(0).forEach((unmount) => unmount());
  });
  vi.restoreAllMocks();
  document.body.replaceChildren();
  localStorage.clear();
});

function LanguageHarness() {
  const { language, setLanguage, t } = useI18n();

  return (
    <section>
      <output>{t("nav.home")}</output>
      <output>{language}</output>
      <output data-testid="string-interpolation">{t("footer.lastUpdate", { date: "2026-08-24" })}</output>
      <output data-testid="number-interpolation">{t("footer.records", { count: 42 })}</output>
      <button type="button" onClick={() => setLanguage("en")}>{t("language.english")}</button>
      <button type="button" onClick={() => setLanguage("zh")}>{t("language.chinese")}</button>
    </section>
  );
}

async function renderLanguageHarness() {
  const view = document.createElement("div");
  const root: Root = createRoot(view);
  document.body.appendChild(view);
  cleanup.push(() => root.unmount());

  await act(async () => {
    root.render(
      <I18nProvider>
        <LanguageHarness />
      </I18nProvider>
    );
  });

  return view;
}

async function click(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`Button not found: ${label}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("I18nProvider", () => {
  it("defaults to English without saved state", async () => {
    localStorage.clear();
    const view = await renderLanguageHarness();
    expect(view.textContent).toContain("Home");
    expect(document.documentElement.lang).toBe("en");
  });

  it("switches to Chinese and persists the explicit choice", async () => {
    const view = await renderLanguageHarness();
    await click(view, "中文");
    expect(view.textContent).toContain("首页");
    expect(localStorage.getItem("tmcc-language")).toBe("zh");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("restores Chinese and can switch back to English", async () => {
    localStorage.setItem("tmcc-language", "zh");
    const view = await renderLanguageHarness();
    expect(view.textContent).toContain("首页");
    await click(view, "EN");
    expect(view.textContent).toContain("Home");
  });

  it("falls back to English for an invalid saved value", async () => {
    localStorage.setItem("tmcc-language", "fr");
    const view = await renderLanguageHarness();
    expect(view.textContent).toContain("Home");
  });

  it("falls back to English when saved-language storage cannot be read", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const view = await renderLanguageHarness();
    expect(view.textContent).toContain("Home");
    expect(document.documentElement.lang).toBe("en");
  });

  it("switches language in memory when language storage cannot be written", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const view = await renderLanguageHarness();
    await click(view, "中文");
    expect(view.textContent).toContain("首页");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("interpolates string and number parameters through t", async () => {
    const view = await renderLanguageHarness();
    expect(view.querySelector('[data-testid="string-interpolation"]')?.textContent).toBe("Last update: 2026-08-24");
    expect(view.querySelector('[data-testid="number-interpolation"]')?.textContent).toBe("42 records");
  });

  it("falls back to English when a Chinese translation is absent", () => {
    expect(resolveTranslation("nav.home", undefined, {})).toBe("Home");
  });

  it("keeps English and Chinese resource keys identical", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it("defines bilingual CV branch and complete-cycle error resources", () => {
    expect(en["cv.table.sweepBranch"]).toBe("Sweep branch");
    expect(en["cv.table.branchValue"]).toBe("Branch {{branch}}");
    expect(en["cv.error.invalidCycleStructure"]).toContain("complete CV cycle");
    expect(zh["cv.table.sweepBranch"]).toBe("扫描分支");
    expect(zh["cv.table.branchValue"]).toBe("分支 {{branch}}");
    expect(zh["cv.error.invalidCycleStructure"]).toContain("完整 CV 周期");
  });

  it("describes complete-cycle branch processing accurately in both languages", () => {
    expect(en["cv.analysis.notice"].toLowerCase()).toContain("each monotonic branch");
    expect(en["cv.analysis.notice"]).not.toContain("first monotonic sweep");
    expect(en["cv.import.pointInterval.help"]).toContain("within each monotonic branch");
    expect(zh["cv.analysis.notice"]).toContain("每个单调分支");
    expect(zh["cv.analysis.notice"]).not.toContain("第一个单调扫描分支");
    expect(zh["cv.import.pointInterval.help"]).toContain("各分支内");
  });

  it("keeps Angstrom units untranslated in Chinese resources", () => {
    expect(zh["xrd.wavelength"]).toBe("波长（Angstrom）");
  });

  it("uses the crystallographic class term for the trigonal -3m resource", () => {
    expect(zh["material.trigonalClass"]).toBe("三方晶类（-3m）");
  });

  it("maps common crystal-system data values to locale-neutral display keys", () => {
    expect([
      "triclinic",
      "monoclinic",
      "orthorhombic",
      "tetragonal",
      "trigonal",
      "hexagonal",
      "cubic",
      "rhombohedral"
    ].map(getCrystalSystemTranslationKey)).toEqual([
      "crystalSystem.triclinic",
      "crystalSystem.monoclinic",
      "crystalSystem.orthorhombic",
      "crystalSystem.tetragonal",
      "crystalSystem.trigonal",
      "crystalSystem.hexagonal",
      "crystalSystem.cubic",
      "crystalSystem.rhombohedral"
    ]);
  });
});
