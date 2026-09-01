# Reviewer Two Tools Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a bilingual, static `/tools/reviewer-two` safety launcher that points to the independently versioned Reviewer Two skill without accepting or transmitting manuscript data.

**Architecture:** TMCCdb remains a static React/Vite application. A new lazily loaded presentational page consumes only bundled i18n strings and standard external links; Reviewer Two scientific logic remains exclusively in `Bingule/reviewer-two` at commit `9ff847d0b23a23c87b24e5340907df4c45f32ffc`.

**Tech Stack:** React 19, TypeScript 5.7, Vite 5, Vitest 2, existing TMCCdb CSS and i18n provider, GitHub Pages.

## Global Constraints

- Work only in `D:/codex_communication/tmcc-database/.worktrees/reviewer-two-tools` on `feat/reviewer-two-tools`.
- Never modify CV, Rate Performance, database, dataset, or unrelated existing Tools implementation files.
- Stop immediately if any CV path appears in the feature-branch diff.
- Do not add manuscript input, file upload, AI/API calls, API-key fields, DOI lookup, journal-policy lookup, persistence, analytics, or copied scientific-review rules.
- Use commit `9ff847d0b23a23c87b24e5340907df4c45f32ffc` for every version-specific Reviewer Two link.
- Do not push directly to TMCCdb `main`; use the feature branch, tests, PR, checks, preview, and user-approved deployment flow.

---

### Task 1: Register the static route and build entry

**Files:**
- Create: `tests/reviewer-two-routing.test.ts`
- Modify: `src/lib/routes.ts`
- Modify: `scripts/create-route-entries.mjs`

**Interfaces:**
- Consumes: existing `normalizePathname(pathname: string): AppRoute` and `createRouteEntries(distPath)`.
- Produces: `AppRoute` member `reviewerTwo`, mapping `/tools/reviewer-two -> reviewerTwo`, and build output `tools/reviewer-two/index.html`.

- [ ] **Step 1: Write the failing route/build test**

```ts
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createRouteEntries } from "../scripts/create-route-entries.mjs";
import { normalizePathname } from "../src/lib/routes";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

it("registers Reviewer Two as a standalone Tools route", async () => {
  expect(normalizePathname("/tools/reviewer-two")).toBe("reviewerTwo");
  expect(normalizePathname("/tools/reviewer-two/")).toBe("reviewerTwo");

  const distPath = await mkdtemp(join(tmpdir(), "tmcc-reviewer-two-route-"));
  temporaryDirectories.push(distPath);
  const html = "<!doctype html><html><body>TMCC</body></html>";
  await writeFile(join(distPath, "index.html"), html, "utf8");

  await createRouteEntries(distPath);

  expect(await readFile(join(distPath, "tools/reviewer-two/index.html"), "utf8"))
    .toBe(html);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test -- tests/reviewer-two-routing.test.ts`

Expected: FAIL because `/tools/reviewer-two` returns `notFound` and its standalone entry is absent.

- [ ] **Step 3: Add the minimum route definitions**

Add `"reviewerTwo"` to `AppRoute`, add this route mapping:

```ts
"/tools/reviewer-two": "reviewerTwo",
```

Add this entry to `routeEntries`:

```js
"tools/reviewer-two/index.html",
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test -- tests/reviewer-two-routing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the route slice**

```bash
git add tests/reviewer-two-routing.test.ts src/lib/routes.ts scripts/create-route-entries.mjs
git commit -m "feat: register Reviewer Two tools route"
```

---

### Task 2: Add the bilingual Tools entry

**Files:**
- Create: `tests/reviewer-two-entry.test.tsx`
- Modify: `src/pages/ToolsPage.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`

**Interfaces:**
- Consumes: existing `useI18n().t()` and `.tool-card` grid contract.
- Produces: `/tools/reviewer-two` card using `tools.reviewerTwo.title` and `tools.reviewerTwo.description`.

- [ ] **Step 1: Write the failing bilingual entry test**

Create a jsdom render helper matching existing Tools tests, render `/tools`, and assert:

```ts
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test -- tests/reviewer-two-entry.test.tsx`

Expected: FAIL because the Reviewer Two card is absent.

- [ ] **Step 3: Add the minimum card and translations**

Append this item to the existing `tools` array:

```ts
{
  href: "/tools/reviewer-two",
  title: "tools.reviewerTwo.title",
  description: "tools.reviewerTwo.description"
}
```

Add these English strings:

```ts
"tools.reviewerTwo.title": "Reviewer Two",
"tools.reviewerTwo.description": "Launch an evidence-grounded scientific peer-review workflow in an authorized private environment.",
```

Add these Chinese strings:

```ts
"tools.reviewerTwo.title": "科学论文预审",
"tools.reviewerTwo.description": "在获得授权的私有环境中启动基于证据的科学论文审稿工作流。",
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test -- tests/reviewer-two-entry.test.tsx`

Expected: PASS in both languages.

- [ ] **Step 5: Commit the Tools entry slice**

```bash
git add tests/reviewer-two-entry.test.tsx src/pages/ToolsPage.tsx src/locales/en.ts src/locales/zh.ts
git commit -m "feat: add Reviewer Two tools entry"
```

---

### Task 3: Build the safe launcher page

**Files:**
- Create: `tests/reviewer-two-page.test.tsx`
- Create: `src/tools/reviewer-two/pages/ReviewerTwoPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`

**Interfaces:**
- Consumes: `Breadcrumbs`, existing `Shell`, `useI18n`, and route value `reviewerTwo`.
- Produces: lazily loaded `ReviewerTwoPage` with static safety copy and immutable version links.

- [ ] **Step 1: Write the failing launcher behavior test**

Render `<App />` at `/tools/reviewer-two`, wait for React lazy work to settle, and assert the English and Chinese behavior:

```ts
expect(view.querySelector("h1")?.textContent).toBe("Reviewer Two");
expect(view.querySelector('[role="note"]')?.textContent)
  .toContain("TMCCdb does not receive or upload manuscripts");
expect(view.querySelectorAll(".reviewer-two-steps li")).toHaveLength(3);

const links = [...view.querySelectorAll<HTMLAnchorElement>(".reviewer-two-actions a")];
expect(links.map((link) => link.href)).toEqual([
  "https://github.com/Bingule/reviewer-two",
  "https://github.com/Bingule/reviewer-two/blob/9ff847d0b23a23c87b24e5340907df4c45f32ffc/README.md"
]);
for (const link of links) {
  expect(link.target).toBe("_blank");
  expect(link.rel.split(/\s+/)).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
}

expect(view.querySelector('input[type="file"]')).toBeNull();
expect(view.querySelector("textarea")).toBeNull();
expect(view.querySelector('input[name*="key" i]')).toBeNull();
expect(view.querySelector("form")).toBeNull();

await switchToChinese(view);
expect(view.querySelector("h1")?.textContent).toBe("科学论文预审");
expect(view.querySelector('[role="note"]')?.textContent)
  .toContain("TMCCdb 不接收或上传论文");
```

Also read `src/App.tsx` and assert:

```ts
expect(source).toContain('lazy(() => import("./tools/reviewer-two/pages/ReviewerTwoPage"))');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test -- tests/reviewer-two-page.test.tsx`

Expected: FAIL because `App` does not render a Reviewer Two page.

- [ ] **Step 3: Add page strings**

Add these exact English values:

```ts
"reviewerTwo.title": "Reviewer Two",
"reviewerTwo.eyebrow": "Scientific peer-review launcher",
"reviewerTwo.subtitle": "Support a human reviewer with an evidence-grounded workflow while keeping scientific judgment with the reviewer.",
"reviewerTwo.privacy.title": "Process unpublished work only in an authorized private environment",
"reviewerTwo.privacy.body": "TMCCdb does not receive or upload manuscripts. Open Reviewer Two only in a runtime you are authorized to use, and confirm confidentiality permission before any manuscript is read.",
"reviewerTwo.flow.title": "Start safely",
"reviewerTwo.flow.step1.title": "Open the independent project",
"reviewerTwo.flow.step1.body": "Review the source, limitations, and supported runtime adapters in the versioned repository.",
"reviewerTwo.flow.step2.title": "Install or load the skill",
"reviewerTwo.flow.step2.body": "Use Codex or another supported runtime inside your authorized private environment.",
"reviewerTwo.flow.step3.title": "Authorize and choose a mode",
"reviewerTwo.flow.step3.body": "Explicitly authorize manuscript access and select first-round or revision-round review before analysis.",
"reviewerTwo.actions.repository": "View GitHub repository",
"reviewerTwo.actions.instructions": "Read installation and usage",
"reviewerTwo.version.title": "Versioned source",
"reviewerTwo.version.body": "This launcher points to the reviewed Reviewer Two source below. Scientific rules remain in the independent repository.",
"reviewerTwo.version.commit": "Reviewed commit",
```

Add these exact Chinese values:

```ts
"reviewerTwo.title": "科学论文预审",
"reviewerTwo.eyebrow": "科学论文审稿启动页",
"reviewerTwo.subtitle": "使用基于证据的工作流辅助人工审稿，并始终由审稿人保留科学判断。",
"reviewerTwo.privacy.title": "仅在获得授权的私有环境中处理未发表内容",
"reviewerTwo.privacy.body": "TMCCdb 不接收或上传论文。请仅在你获准使用的运行环境中打开 Reviewer Two，并在读取任何稿件前确认保密授权。",
"reviewerTwo.flow.title": "安全开始",
"reviewerTwo.flow.step1.title": "打开独立项目",
"reviewerTwo.flow.step1.body": "在固定版本仓库中查看源文件、限制和受支持的运行时适配器。",
"reviewerTwo.flow.step2.title": "安装或加载 Skill",
"reviewerTwo.flow.step2.body": "在获得授权的私有环境中使用 Codex 或其他受支持运行时。",
"reviewerTwo.flow.step3.title": "授权并选择模式",
"reviewerTwo.flow.step3.body": "分析前明确授权稿件访问，并选择初审或修回审稿模式。",
"reviewerTwo.actions.repository": "查看 GitHub 仓库",
"reviewerTwo.actions.instructions": "阅读安装与使用说明",
"reviewerTwo.version.title": "固定版本来源",
"reviewerTwo.version.body": "此启动页指向下方经过审阅的 Reviewer Two 源码。科学审稿规则仍保留在独立仓库中。",
"reviewerTwo.version.commit": "已审阅提交",
```

- [ ] **Step 4: Implement the minimum page**

Use these immutable constants and semantic structure:

```tsx
const REPOSITORY_URL = "https://github.com/Bingule/reviewer-two";
const COMMIT = "9ff847d0b23a23c87b24e5340907df4c45f32ffc";
const INSTRUCTIONS_URL = `${REPOSITORY_URL}/blob/${COMMIT}/README.md`;

const steps = [
  ["reviewerTwo.flow.step1.title", "reviewerTwo.flow.step1.body"],
  ["reviewerTwo.flow.step2.title", "reviewerTwo.flow.step2.body"],
  ["reviewerTwo.flow.step3.title", "reviewerTwo.flow.step3.body"]
] as const;

export function ReviewerTwoPage() {
  const { t } = useI18n();

  return (
    <section className="tools-page reviewer-two-page">
      <Breadcrumbs current={t("reviewerTwo.title")} />
      <header className="tool-page-header reviewer-two-header">
        <p className="reviewer-two-eyebrow">{t("reviewerTwo.eyebrow")}</p>
        <h1>{t("reviewerTwo.title")}</h1>
        <p>{t("reviewerTwo.subtitle")}</p>
        <div className="reviewer-two-actions">
          <a className="primary-button" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
            {t("reviewerTwo.actions.repository")}
          </a>
          <a className="secondary-button" href={INSTRUCTIONS_URL} target="_blank" rel="noopener noreferrer">
            {t("reviewerTwo.actions.instructions")}
          </a>
        </div>
      </header>
      <aside className="reviewer-two-privacy" role="note">
        <h2>{t("reviewerTwo.privacy.title")}</h2>
        <p>{t("reviewerTwo.privacy.body")}</p>
      </aside>
      <section className="reviewer-two-section" aria-labelledby="reviewer-two-flow-title">
        <h2 id="reviewer-two-flow-title">{t("reviewerTwo.flow.title")}</h2>
        <ol className="reviewer-two-steps">
          {steps.map(([title, body]) => (
            <li key={title}>
              <h3>{t(title)}</h3>
              <p>{t(body)}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="reviewer-two-version" aria-labelledby="reviewer-two-version-title">
        <h2 id="reviewer-two-version-title">{t("reviewerTwo.version.title")}</h2>
        <p>{t("reviewerTwo.version.body")}</p>
        <p><span>{t("reviewerTwo.version.commit")}</span> <code>{COMMIT}</code></p>
      </section>
    </section>
  );
}
```

Add to `App.tsx`:

```tsx
const ReviewerTwoPage = lazy(() => import("./tools/reviewer-two/pages/ReviewerTwoPage"));
// ...
if (route === "reviewerTwo") return renderInShell(<ReviewerTwoPage />);
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `pnpm test -- tests/reviewer-two-page.test.tsx`

Expected: PASS with bilingual content, safe links, and no manuscript controls.

- [ ] **Step 6: Commit the launcher behavior slice**

```bash
git add tests/reviewer-two-page.test.tsx src/tools/reviewer-two/pages/ReviewerTwoPage.tsx src/App.tsx src/locales/en.ts src/locales/zh.ts
git commit -m "feat: add safe Reviewer Two launcher"
```

---

### Task 4: Style, verify, preview, and prepare deployment

**Files:**
- Modify: `tests/reviewer-two-page.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: semantic classes produced by `ReviewerTwoPage` and existing TMCCdb color/button tokens.
- Produces: responsive launcher layout with visible focus and single-column mobile behavior.

- [ ] **Step 1: Add failing style-contract assertions**

Read `src/styles/global.css` in the existing page test and assert:

```ts
expect(css).toMatch(/\.reviewer-two-actions\s*\{[^}]*display:\s*flex/s);
expect(css).toMatch(/\.reviewer-two-privacy\s*\{[^}]*border-left:/s);
expect(css).toMatch(/\.reviewer-two-steps\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
expect(css).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*?\.reviewer-two-steps\s*\{[^}]*grid-template-columns:\s*1fr/s);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test -- tests/reviewer-two-page.test.tsx`

Expected: FAIL because the Reviewer Two style hooks are absent.

- [ ] **Step 3: Add narrowly scoped styles**

Add these narrowly scoped styles beside the existing Tools styles:

```css
.reviewer-two-header { max-width: 82ch; }

.reviewer-two-eyebrow {
  color: #285b70;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.reviewer-two-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

.reviewer-two-actions a { text-decoration: none; }

.reviewer-two-privacy {
  margin: 24px 0;
  padding: 20px;
  border: 1px solid #dce2df;
  border-left: 4px solid #366c75;
  border-radius: 8px;
  background: #f5f8f6;
}

.reviewer-two-privacy h2,
.reviewer-two-section h2,
.reviewer-two-version h2 { margin-top: 0; color: #111b25; }

.reviewer-two-privacy p,
.reviewer-two-steps p,
.reviewer-two-version p { color: #52666e; line-height: 1.6; }

.reviewer-two-section,
.reviewer-two-version { margin-top: 28px; }

.reviewer-two-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  padding: 0;
  list-style: none;
  counter-reset: reviewer-step;
}

.reviewer-two-steps li {
  padding: 20px;
  border: 1px solid #dce2df;
  border-radius: 8px;
  background: #fff;
  counter-increment: reviewer-step;
}

.reviewer-two-steps h3::before {
  content: counter(reviewer-step) ". ";
  color: #366c75;
}

.reviewer-two-version code { overflow-wrap: anywhere; }
```

Add to the existing `@media (max-width: 900px)` block:

```css
.reviewer-two-steps { grid-template-columns: 1fr; }
```

Add to the existing `@media (max-width: 520px)` block:

```css
.reviewer-two-actions { display: grid; }
.reviewer-two-actions a { width: 100%; text-align: center; }
```

Do not edit CV or Rate Performance selectors.

- [ ] **Step 4: Run focused and complete validation**

Run in order:

```bash
pnpm test -- tests/reviewer-two-routing.test.ts tests/reviewer-two-entry.test.tsx tests/reviewer-two-page.test.tsx
pnpm test
pnpm build
git diff --check origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected: all tests pass, production build succeeds, no whitespace errors, and
the diff contains only the specification/plan plus allowed Reviewer Two entry,
module, route, i18n, style, build-entry, and test files.

- [ ] **Step 5: Enforce the protected-path gate**

Run:

```powershell
$changed = git diff --name-only origin/main...HEAD
$protected = $changed | Select-String -Pattern '(^|/)(Cv|cv-|cv/|rate-performance|data|database)'
if ($protected) { $protected; exit 1 }
```

Expected: exit 0 with no output. Any match is a hard stop and must be reported.

- [ ] **Step 6: Start a local preview and inspect only the new routes**

Run `pnpm dev` in a retained terminal. Open `/tools` and
`/tools/reviewer-two`, verify desktop/mobile layout, bilingual switching,
keyboard focus, exact external destinations, and absence of manuscript controls.

- [ ] **Step 7: Commit the styling slice**

```bash
git add tests/reviewer-two-page.test.tsx src/styles/global.css
git commit -m "style: polish Reviewer Two launcher"
```

- [ ] **Step 8: Publish through the protected workflow**

Push only `feat/reviewer-two-tools`, create a pull request into `main`, wait for
automated checks, and inspect the resulting preview or branch build. Never push
directly to `main`. Merge only through the approved PR flow, then wait for the
existing GitHub Pages deployment and verify:

```text
https://tmccdb.org/tools/reviewer-two
```

If the custom domain has not refreshed, also verify the authoritative GitHub
Pages deployment URL reported by the workflow.
