import { readFile } from "node:fs/promises";
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

async function renderReviewerTwo(): Promise<HTMLElement> {
  history.replaceState(null, "", "/tools/reviewer-two");
  const view = document.createElement("div");
  document.body.appendChild(view);
  root = createRoot(view);

  await act(async () => {
    root?.render(<I18nProvider><App /></I18nProvider>);
    await import("../src/tools/reviewer-two/pages/ReviewerTwoPage");
  });

  return view;
}

async function switchToChinese(view: HTMLElement) {
  await act(async () => {
    [...view.querySelectorAll<HTMLButtonElement>(".language-switch button")][1].click();
  });
}

it("renders a bilingual launcher with an explicit privacy boundary", async () => {
  const view = await renderReviewerTwo();

  expect(view.querySelector("h1")?.textContent).toBe("Reviewer Two");
  expect(view.querySelector('[role="note"]')?.textContent)
    .toContain("TMCCdb does not receive or upload manuscripts");
  expect(view.querySelectorAll(".reviewer-two-steps li")).toHaveLength(3);
  expect(view.querySelector('[aria-current="page"]')?.textContent).toBe("Reviewer Two");

  await switchToChinese(view);

  expect(view.querySelector("h1")?.textContent).toBe("科学论文预审");
  expect(view.querySelector('[role="note"]')?.textContent)
    .toContain("TMCCdb 不接收或上传论文");
  expect(view.querySelector('[aria-current="page"]')?.textContent).toBe("科学论文预审");
});

it("links to the independent fixed source without manuscript controls", async () => {
  const view = await renderReviewerTwo();
  const launcher = view.querySelector<HTMLElement>(".reviewer-two-page")!;
  const links = [...view.querySelectorAll<HTMLAnchorElement>(".reviewer-two-actions a")];

  expect(links.map((link) => link.href)).toEqual([
    "https://github.com/Bingule/reviewer-two",
    "https://github.com/Bingule/reviewer-two/blob/9ff847d0b23a23c87b24e5340907df4c45f32ffc/README.md"
  ]);
  for (const link of links) {
    expect(link.target).toBe("_blank");
    expect(link.rel.split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
  }

  const visibleSource = view.querySelector<HTMLAnchorElement>(".reviewer-two-version a");
  expect(visibleSource?.textContent).toBe("github.com/Bingule/reviewer-two");
  expect(visibleSource?.href).toBe("https://github.com/Bingule/reviewer-two");

  expect(view.textContent).toContain("9ff847d0b23a23c87b24e5340907df4c45f32ffc");
  expect(launcher.querySelector('input[type="file"]')).toBeNull();
  expect(launcher.querySelector("textarea")).toBeNull();
  expect(launcher.querySelector('input[name*="key" i]')).toBeNull();
  expect(launcher.querySelector("form")).toBeNull();
});

it("keeps Reviewer Two code split from the application shell", async () => {
  const source = await readFile("src/App.tsx", "utf8");

  expect(source).toContain('lazy(() => import("./tools/reviewer-two/pages/ReviewerTwoPage"))');
  expect(source).not.toMatch(/import\s+\{[^}]*ReviewerTwoPage[^}]*\}\s+from/);
});

it("provides responsive Reviewer Two layout hooks", async () => {
  const css = await readFile("src/styles/global.css", "utf8");

  expect(css).toMatch(/\.reviewer-two-actions\s*\{[^}]*display:\s*flex/s);
  expect(css).toMatch(/\.reviewer-two-privacy\s*\{[^}]*border-left:/s);
  expect(css).toMatch(/\.reviewer-two-steps\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  expect(css).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*?\.reviewer-two-steps\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
