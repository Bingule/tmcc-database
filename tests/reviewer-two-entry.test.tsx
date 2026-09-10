import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import App from "../src/App";
import { I18nProvider } from "../src/i18n/I18nProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
  localStorage.clear();
});

async function renderTools(): Promise<HTMLElement> {
  history.replaceState(null, "", "/tools");
  const view = document.createElement("div");
  document.body.appendChild(view);
  root = createRoot(view);

  await act(async () => {
    root?.render(<I18nProvider><App /></I18nProvider>);
    await import("../src/pages/ToolsPage");
  });

  return view;
}

it("adds a bilingual Reviewer Two card to the Tools index", async () => {
  const view = await renderTools();
  const card = view.querySelector('.tool-card a[href="/tools/reviewer-two"]')?.closest("li");

  expect(card?.querySelector("a")?.textContent).toBe("Reviewer Two");
  expect(card?.querySelector("p")?.textContent)
    .toBe("Launch an evidence-grounded scientific peer-review workflow in an authorized private environment.");

  await act(async () => {
    [...view.querySelectorAll<HTMLButtonElement>(".language-switch button")][1].click();
  });

  expect(card?.querySelector("a")?.textContent).toBe("科学论文预审");
  expect(card?.querySelector("p")?.textContent)
    .toBe("在获得授权的私有环境中启动基于证据的科学论文审稿工作流。");
});
