import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "../src/i18n/I18nProvider";
import { en } from "../src/locales/en";
import { zh } from "../src/locales/zh";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanup: Array<() => void> = [];

afterEach(async () => {
  await act(async () => {
    cleanup.splice(0).forEach((unmount) => unmount());
  });
  document.body.replaceChildren();
  localStorage.clear();
});

function LanguageHarness() {
  const { language, setLanguage, t } = useI18n();

  return (
    <section>
      <output>{t("nav.home")}</output>
      <output>{language}</output>
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

  it("keeps English and Chinese resource keys identical", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
});
