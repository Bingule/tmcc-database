import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CvImportPanel, type CvImportDraft } from "../src/components/CvImportPanel";
import { I18nProvider, useI18n } from "../src/i18n/I18nProvider";
import { parseDelimitedCv, type ParsedCvTable } from "../src/lib/cvParsing";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  localStorage.clear();
});

const initialDraft: CvImportDraft = {
  options: { layout: "", headerMode: "header" },
  source: "file",
  pasteText: "",
  scanRateText: "",
  pointInterval: 1,
  rSquaredThreshold: 0.95
};

function PanelHarness({ table = null, initial = initialDraft }: { table?: ParsedCvTable | null; initial?: CvImportDraft }) {
  const [draft, setDraft] = useState(initial);
  const { setLanguage, t } = useI18n();
  return <>
    <button type="button" onClick={() => setLanguage("en")}>{t("language.english")}</button>
    <button type="button" onClick={() => setLanguage("zh")}>{t("language.chinese")}</button>
    <CvImportPanel
      draft={draft}
      table={table}
      busy={false}
      error={null}
      onDraftChange={setDraft}
      onFile={() => undefined}
      onParsePaste={() => undefined}
      onAnalyze={() => undefined}
    />
  </>;
}

async function renderPanel(props: Parameters<typeof PanelHarness>[0] = {}) {
  const view = document.createElement("div");
  document.body.appendChild(view);
  root = createRoot(view);
  await act(async () => root!.render(<I18nProvider><PanelHarness {...props} /></I18nProvider>));
  return view;
}

async function click(view: HTMLElement, label: string) {
  const control = [...view.querySelectorAll<HTMLElement>("button, label")]
    .find((item) => item.textContent?.trim() === label);
  if (!control) throw new Error(`Missing control: ${label}`);
  await act(async () => control.click());
}

async function setValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("CvImportPanel", () => {
  it("requires an explicit layout and exposes the documented English defaults", async () => {
    const view = await renderPanel();
    const layout = view.querySelector('[role="radiogroup"][aria-required="true"]')!;
    const layoutRadios = layout.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(layoutRadios).toHaveLength(2);
    expect([...layoutRadios].every((radio) => !radio.checked)).toBe(true);

    const header = view.querySelector<HTMLInputElement>('input[name="cv-header-mode"][value="header"]')!;
    expect(header.checked).toBe(true);
    expect(view.querySelector<HTMLInputElement>('input[type="file"]')?.accept).toBe(".csv,.txt,.xlsx");
    expect(view.querySelector("textarea")).toBeNull();

    const rates = view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!;
    expect(rates.placeholder).toBe("0.2, 0.4, 0.6, 0.8, 1");
    const interval = view.querySelector<HTMLSelectElement>('select[name="cv-point-interval"]')!;
    expect([...interval.options].map((option) => option.value)).toEqual(
      Array.from({ length: 30 }, (_, index) => String(index + 1))
    );
    expect(interval.value).toBe("1");

    const threshold = view.querySelector<HTMLInputElement>('input[name="cv-r-squared-threshold"]')!;
    expect(threshold).toMatchObject({ min: "0", max: "1", step: "0.01", value: "0.95" });
    expect(view.textContent).toContain("subsamples the common potential grid; it does not smooth or average currents");
    expect(view.textContent).toContain("Choose a data format before importing data");
    expect(view.textContent).toContain("0 disables quality exclusion");
    expect(view.textContent).toContain("XYYYYY");
    expect(view.textContent).toContain("XYXYXY");
    expect(view.querySelector<HTMLButtonElement>('button[name="cv-analyze"]')?.disabled).toBe(true);
  });

  it("localizes labels, help, format examples, and ARIA while preserving the controlled draft", async () => {
    const view = await renderPanel();
    await click(view, "Paste from Excel");
    const textarea = view.querySelector<HTMLTextAreaElement>("textarea")!;
    await setValue(textarea, "E\tI1\tI2\tI3\n0\t1\t2\t3");
    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "1, 4, 9");

    await click(view, "中文");
    expect(view.textContent).toContain("数据格式");
    expect(view.textContent).toContain("首行为表头");
    expect(view.textContent).toContain("从 Excel 粘贴");
    expect(view.textContent).toContain("仅对共同电位网格进行抽样；不会平滑或平均电流");
    expect(view.textContent).toContain("设为 0 时禁用质量排除");
    expect(view.textContent).toContain("导入数据前请选择数据格式");
    expect(view.querySelector("textarea")?.getAttribute("aria-label")).toBe("粘贴 Excel 兼容的 CV 数据");
    expect(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')?.getAttribute("aria-label")).toBe("有序扫描速率列表");

    await click(view, "EN");
    expect(view.querySelector<HTMLTextAreaElement>("textarea")?.value).toContain("E\tI1");
    expect(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')?.value).toBe("1, 4, 9");
  });

  it("enables analysis only for a parsed table with a valid positional rate mapping and settings", async () => {
    const table = parseDelimitedCv(
      "E,I1,I2,I3\n0,1,2,3\n1,2,3,4",
      { layout: "sharedPotential", headerMode: "header" }
    );
    const view = await renderPanel({
      table,
      initial: {
        ...initialDraft,
        options: { layout: "sharedPotential", headerMode: "header" },
        scanRateText: "1, 4, 9"
      }
    });
    const analyze = view.querySelector<HTMLButtonElement>('button[name="cv-analyze"]')!;
    expect(analyze.disabled).toBe(false);
    expect(view.textContent).toContain("I1 → 1 mV/s");
    expect(view.querySelectorAll("tbody tr")).toHaveLength(2);

    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "1, 4");
    expect(analyze.disabled).toBe(true);
    expect(view.textContent).toContain("Provide 3 to 20 distinct positive scan rates");

    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "1, 4, 9, 16");
    expect(analyze.disabled).toBe(true);
    expect(view.textContent).toContain("must match the 3 detected curves");

    await setValue(view.querySelector<HTMLInputElement>('input[name="cv-scan-rates"]')!, "1, 4, 9");
    const threshold = view.querySelector<HTMLInputElement>('input[name="cv-r-squared-threshold"]')!;
    await setValue(threshold, "1.01");
    expect(analyze.disabled).toBe(true);

    await setValue(threshold, "");
    expect(analyze.disabled).toBe(true);
    expect(threshold.value).toBe("");
    expect(view.textContent).toContain("R² threshold must be a finite number from 0 to 1");
  });
});
