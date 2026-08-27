# CV Advanced Dunn Introduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic CV page introduction with the approved bilingual Advanced R²-Guided Regularized Dunn Analysis content while preserving the title, Import Data placement, and responsive layout.

**Architecture:** Reuse the existing `tool-page-header` and centralized locale dictionaries. Add three stable translation keys, semantic page markup, and narrowly scoped CSS; do not create a component or change any analysis behavior.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/jsdom, existing custom i18n provider, CSS.

## Global Constraints

- English title stays exactly `CV Kinetics Analysis`; the existing Chinese title stays `CV 动力学分析`.
- The approved subtitle, description, and Benefits line appear directly below the title and above Import Data.
- English copy must match the user-provided text exactly; Chinese copy must remain centralized in `src/locales/zh.ts`.
- `k1`, `k2`, `R²`, `g(V)`, and `0 <= g(V) <= 1` remain plain text with no LaTeX or runtime math renderer.
- The Benefits line wraps naturally on mobile without horizontal scrolling.
- No analysis, import, export, navigation, homepage, or dependency changes.

---

### Task 1: Bilingual semantic introduction

**Files:**
- Modify: `tests/i18n.test.tsx`
- Modify: `tests/cv-page.test.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: existing `useI18n().t(key)` and `.tool-page-header` layout.
- Produces: translation keys `cv.intro.advancedTitle`, `cv.intro.description`, and `cv.intro.benefits`; CSS classes `.cv-intro-subtitle`, `.cv-intro-description`, and `.cv-intro-benefits`.

- [ ] **Step 1: Add failing locale-resource assertions**

Add this test to `tests/i18n.test.tsx`:

```ts
it("defines the bilingual advanced Dunn introduction as plain text", () => {
  expect(en["cv.intro.advancedTitle"]).toBe("Advanced R²-Guided Regularized Dunn Analysis");
  expect(en["cv.intro.description"]).toContain("Local k1, k2, and R² values");
  expect(en["cv.intro.description"]).toContain("0 <= g(V) <= 1");
  expect(en["cv.intro.benefits"]).toBe("Benefits: robust reconstruction · R²-aware confidence weighting · smooth branch consistency · sign preservation · bounded capacitive contribution · reduced sensitivity to local fitting noise");
  expect(zh["cv.intro.advancedTitle"]).toBe("高级 R² 引导正则化 Dunn 分析");
  expect(zh["cv.intro.description"]).toContain("0 <= g(V) <= 1");
  expect(zh["cv.intro.benefits"]).toContain("优势：稳健重构");
});
```

- [ ] **Step 2: Add a failing page hierarchy test**

Add this test to `tests/cv-page.test.tsx`:

```tsx
it("renders the advanced Dunn introduction below the unchanged title and above Import Data", async () => {
  const view = await renderPage();
  const title = view.querySelector<HTMLHeadingElement>(".tool-page-header h1")!;
  const subtitle = view.querySelector<HTMLHeadingElement>(".cv-intro-subtitle")!;
  const description = view.querySelector<HTMLElement>(".cv-intro-description")!;
  const benefits = view.querySelector<HTMLElement>(".cv-intro-benefits")!;
  const importSection = view.querySelector<HTMLElement>(".cv-import")!;

  expect(title.textContent).toBe("CV Kinetics Analysis");
  expect(subtitle.textContent).toBe("Advanced R²-Guided Regularized Dunn Analysis");
  expect(description.textContent).toContain("0 <= g(V) <= 1");
  expect(description.querySelector("math, .katex")).toBeNull();
  expect(benefits.textContent).toContain("R²-aware confidence weighting");
  expect(subtitle.compareDocumentPosition(importSection) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

  await click(view, "中文");
  expect(view.querySelector(".cv-intro-subtitle")?.textContent).toBe("高级 R² 引导正则化 Dunn 分析");
  expect(view.querySelector(".cv-intro-benefits")?.textContent).toContain("优势：稳健重构");
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/i18n.test.tsx tests/cv-page.test.tsx -t "advanced Dunn introduction"
```

Expected: FAIL because the `cv.intro.*` resources and markup do not exist.

- [ ] **Step 4: Add the centralized translation resources**

Add to `src/locales/en.ts`:

```ts
"cv.intro.advancedTitle": "Advanced R²-Guided Regularized Dunn Analysis",
"cv.intro.description": "This tool combines conventional Dunn kinetic separation with confidence-aware regularization and physically constrained reconstruction. Local k1, k2, and R² values are evaluated across the potential window, while forward and reverse branches jointly determine a shared capacitive fraction g(V). A constrained smooth optimization enforces 0 <= g(V) <= 1, preserving the measured CV morphology, current sign, and physical bounds while improving robustness in regions with variable fit quality.",
"cv.intro.benefits": "Benefits: robust reconstruction · R²-aware confidence weighting · smooth branch consistency · sign preservation · bounded capacitive contribution · reduced sensitivity to local fitting noise",
```

Add to `src/locales/zh.ts`:

```ts
"cv.intro.advancedTitle": "高级 R² 引导正则化 Dunn 分析",
"cv.intro.description": "本工具将传统 Dunn 动力学分离与置信度感知正则化和物理约束重构相结合。在整个电位窗口内评估局部 k1、k2 和 R² 值，同时由正向和反向分支共同确定共享电容比例 g(V)。约束平滑优化强制满足 0 <= g(V) <= 1，在提高拟合质量变化区域稳健性的同时，保留实测 CV 形貌、电流符号和物理边界。",
"cv.intro.benefits": "优势：稳健重构 · R² 感知置信度加权 · 平滑分支一致性 · 符号保持 · 有界电容贡献 · 降低对局部拟合噪声的敏感性",
```

- [ ] **Step 5: Replace the old introductory paragraph with semantic markup**

In `src/pages/CvKineticsPage.tsx`, keep the existing `h1` and replace `<p>{t("cv.subtitle")}</p>` with:

```tsx
<h2 className="cv-intro-subtitle">{t("cv.intro.advancedTitle")}</h2>
<p className="cv-intro-description">{t("cv.intro.description")}</p>
<p className="cv-intro-benefits">{t("cv.intro.benefits")}</p>
```

Keep the existing sampling notice after these elements.

- [ ] **Step 6: Add narrowly scoped responsive styles**

Add after the existing `.tool-page-header p` rule in `src/styles/global.css`:

```css
.cv-intro-subtitle {
  margin: 16px 0 0;
  color: #285b70;
  font-size: clamp(1.15rem, 2vw, 1.5rem);
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.tool-page-header .cv-intro-description {
  margin-top: 10px;
}

.tool-page-header .cv-intro-benefits {
  margin-top: 8px;
  color: #3f5963;
  font-size: 0.92rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .tool-page-header .cv-intro-benefits {
    font-size: 0.875rem;
    line-height: 1.5;
  }
}
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run the Step 3 command.

Expected: PASS for both the resource and rendered hierarchy tests.

- [ ] **Step 8: Commit the implementation**

```powershell
git add tests/i18n.test.tsx tests/cv-page.test.tsx src/locales/en.ts src/locales/zh.ts src/pages/CvKineticsPage.tsx src/styles/global.css
git commit -m "feat: add advanced Dunn page introduction"
```

---

### Task 2: Verification and current-branch deployment

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: committed `fix-dunn-literature-plot` branch and existing `.github/workflows/deploy-pages.yml` workflow.
- Produces: a verified production build and an online deployment from the feature branch without merging `main`.

- [ ] **Step 1: Run the complete test suite**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vitest\vitest.mjs' run
```

Expected: all test files and tests PASS.

- [ ] **Step 2: Run TypeScript and the production build**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\typescript\bin\tsc'
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\node_modules\vite\bin\vite.js' build
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\scripts\create-route-entries.mjs'
```

Expected: TypeScript exits successfully; Vite reports `built`; route entries are created without error.

- [ ] **Step 3: Push and deploy without merging**

Push `fix-dunn-literature-plot`, manually dispatch `deploy-pages.yml` with that ref, temporarily allow only that exact branch in the `github-pages` environment if required, and remove the temporary policy immediately after successful deployment.

Expected: the workflow concludes `success`, the environment policy again lists only `main`, and `main` remains unmerged.

- [ ] **Step 4: Verify the live resource**

Fetch `https://tmccdb.org/tools/cv-kinetics/` and its referenced assets. Confirm the deployed bundle contains `Advanced R²-Guided Regularized Dunn Analysis` and the updated Chinese subtitle.

Expected: live resources match the local production build.
