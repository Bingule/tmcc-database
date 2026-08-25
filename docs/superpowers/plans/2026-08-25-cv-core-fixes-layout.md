# CV Core Flow and Layout Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make valid CSV, TXT, and XLSX CV datasets reliably produce visible b-value and Dunn results, while compacting only the CV import/results layout and preserving bilingual behavior and scientific formulas.

**Architecture:** Keep `cvWorkflow` as the scientific source of truth. Fix the page handoff so a mathematical fit remains inspectable even when `R² < 0.95`, while the existing `valid` mask continues to gate plots and Dunn contribution integration. Decode text files from bytes before passing them to the existing delimiter parser, and add CV-specific grid classes instead of changing the shared Tools layout used by calculators.

**Tech Stack:** React 19, Vite 5, TypeScript 5.7, Vitest 2, JSDOM, `read-excel-file@9.3.10`, explicit English/Simplified Chinese locale resources.

## Constraints

- Work only on branch `fix-cv-core-flow-layout`; do not merge or deploy automatically.
- Do not add dependencies or change b-value/Dunn formulas.
- Keep layout and first-row mode explicitly user-selected; do not add format guessing.
- Default R² threshold remains `0.95`. Only `R² ≥ 0.95` fits are valid, but lower-quality mathematical fits remain visible with their status and values.
- Preserve CSV behavior, current resource limits, bilingual support, routes, homepage, calculators, and exports.
- Verify only the requested CSV/TXT/XLSX analysis flows and focused desktop/mobile layout, then run the existing suite and build.

---

### Task 1: Retain Below-Threshold Analysis and Surface Errors Beside the Action

**Files:**
- Modify: `tests/cv-page.test.tsx`
- Modify: `tests/cv-import-panel.test.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/components/CvImportPanel.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`

- [ ] **Step 1: Write failing page tests**

Add a valid three-rate shared-potential dataset whose mathematical b/Dunn fits all have `R² < 0.95`. Import it and click Run analysis. Assert:

- the b-value and Dunn record tables populate;
- below-threshold rows retain b/intercept or k1/k2 and R²;
- their localized status is `Below R² threshold` / `低于 R² 阈值`;
- contribution-only output remains empty because the workflow validity mask is unchanged;
- the page does not show `noBFit`.

Add a genuine no-mathematical-fit case and assert its bilingual error appears in a live status block adjacent to the Run analysis button instead of only above the preview.

- [ ] **Step 2: Write failing help-text tests**

In both languages assert the exact strings:

```text
Recommended threshold: 0.95 (only fits with R² ≥ 0.95 are treated as valid).
建议阈值：0.95（仅将 R² ≥ 0.95 的拟合视为有效）。
```

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `pnpm test -- tests/cv-page.test.tsx tests/cv-import-panel.test.tsx`

Expected: FAIL because `runAnalysis()` discards all-below-threshold workflow results, and the current R² help/error placement does not meet the confirmed behavior.

- [ ] **Step 4: Implement the minimal analysis handoff fix**

In `runAnalysis()`, select the first `record.fit` regardless of `valid` versus `belowRSquaredThreshold`. Throw `noBFit` only when every b record has `fit === null`. Store the complete workflow result and metadata before initializing the selected potential/rate. Do not change `cvWorkflow`, contribution masking, chart validity filtering, or formulas.

Move or mirror the single live validation/status region into the import panel action area so failures are visible where Run analysis is clicked. Avoid duplicate live regions and remove the silent attempted-analysis return path by mapping a missing table to an existing visible validation state.

- [ ] **Step 5: Update centralized locale resources**

Replace only the R² help keys in `src/locales/en.ts` and `src/locales/zh.ts` with the confirmed wording. Keep all component markup translation-key driven.

- [ ] **Step 6: Run focused tests**

Run: `pnpm test -- tests/cv-page.test.tsx tests/cv-import-panel.test.tsx tests/cv-workflow.test.ts`

Expected: PASS; low-R² fits are inspectable while the existing scientific quality mask remains unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/pages/CvKineticsPage.tsx src/components/CvImportPanel.tsx src/locales/en.ts src/locales/zh.ts tests/cv-page.test.tsx tests/cv-import-panel.test.tsx
git commit -m "fix: retain cv analysis results below quality threshold"
```

---

### Task 2: Normalize CSV and TXT Byte Decoding

**Files:**
- Modify: `tests/cv-parsing.test.ts`
- Modify: `src/lib/cvParsing.ts`

- [ ] **Step 1: Write failing decoder tests**

Create equivalent shared-potential files encoded as UTF-8, UTF-8 BOM, UTF-16LE BOM, and UTF-16BE BOM. Include both `.csv` and `.txt` where relevant. Assert `parseCvFile()` returns the same headers, rows, pairs, inferred scan rates, and confirmed series for all variants.

Also cover headerless numeric TXT with `{ layout: "sharedPotential", headerMode: "data" }` and confirm generated `X`, `Y1`… headers. Preserve the existing read-failure/error-contract test.

- [ ] **Step 2: Run parser tests and confirm RED**

Run: `pnpm test -- tests/cv-parsing.test.ts`

Expected: UTF-16 cases FAIL because text import currently delegates to `File.text()`/`readAsText()` without BOM-aware decoding.

- [ ] **Step 3: Implement one bounded byte-decoding path**

Read CSV/TXT as an `ArrayBuffer`, retain the existing file-size checks, detect BOMs, and decode with `TextDecoder`:

- UTF-8 BOM: strip BOM and decode UTF-8;
- UTF-16LE BOM: decode `utf-16le`;
- UTF-16BE BOM: byte-swap code units or use supported `utf-16be` decoding with a deterministic fallback;
- no BOM: decode UTF-8.

Pass the decoded string to the unchanged `parseDelimitedCv()` path. Wrap read/decode failures in the existing stable `CvParseError` contract. Do not add encoding heuristics beyond BOM handling.

- [ ] **Step 4: Run focused parsing regression tests**

Run: `pnpm test -- tests/cv-parsing.test.ts tests/cv-import.test.ts`

Expected: PASS for CSV/TXT encodings, delimiters, headerless mode, resource limits, and prior malformed-file behavior.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cvParsing.ts tests/cv-parsing.test.ts
git commit -m "fix: decode cv text imports consistently"
```

---

### Task 3: Prove Equivalent CSV, TXT, and XLSX Page Flows

**Files:**
- Modify: `tests/cv-page.test.tsx`
- Modify: `tests/cv-parsing.test.ts`
- Modify only if a test exposes a scoped defect: `src/lib/cvParsing.ts`

- [ ] **Step 1: Add one parameterized three-format page test**

Use scientifically equivalent three-rate datasets for `.csv`, UTF-16 `.txt`, and a real minimal `.xlsx` fixture. For each format:

1. select `XYYYYY` and the matching header mode;
2. upload the file;
3. verify preview and positional rate mapping;
4. click Run analysis;
5. verify both `cv-b-records-table` and `cv-dunn-records-table` contain records.

Use data that produces at least one `R² ≥ 0.95` record so the test proves the complete requested results path, not only low-quality retention.

- [ ] **Step 2: Run the new test and confirm behavior**

Run: `pnpm test -- tests/cv-page.test.tsx tests/cv-parsing.test.ts`

Expected: CSV and decoded TXT pass. XLSX either passes unchanged or reveals a concrete sheet-normalization defect.

- [ ] **Step 3: Apply only evidence-driven XLSX fixes if necessary**

If XLSX fails, keep archive/resource preflight and workbook-order scanning. Normalize cells from the first useful sheet into the same `ParsedCvTable` contract as text input, respecting the explicit layout/header mode. Do not loosen ZIP safety checks or add workbook-format guessing.

- [ ] **Step 4: Run the three-format test again**

Run: `pnpm test -- tests/cv-page.test.tsx tests/cv-parsing.test.ts`

Expected: all three formats reach visible b-value and Dunn record results.

- [ ] **Step 5: Commit**

```bash
git add tests/cv-page.test.tsx tests/cv-parsing.test.ts src/lib/cvParsing.ts
git commit -m "test: cover cv analysis across three import formats"
```

Omit `src/lib/cvParsing.ts` from the commit if no XLSX production change is needed.

---

### Task 4: Compact CV-Only Desktop and Mobile Layout

**Files:**
- Modify: `tests/tools-markup.test.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/components/CvImportPanel.tsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: Write failing layout-hook tests**

Assert the CV page has a scoped layout class and that:

- Import Data spans both desktop columns;
- import controls use a compact two-column internal grid where practical;
- b-value and Dunn sections occupy the two columns on the next row;
- quality summary, results, and export remain full-width;
- the `max-width: 900px` rule stacks the CV grid and import controls to one column;
- preview tables retain internal horizontal scrolling.

Do not alter assertions for the shared `.tool-layout` used by the capacity and molecular-weight calculators.

- [ ] **Step 2: Run layout tests and confirm RED**

Run: `pnpm test -- tests/tools-markup.test.tsx tests/cv-import-panel.test.tsx`

Expected: FAIL because the import panel currently occupies one outer column and lacks the final compact row structure.

- [ ] **Step 3: Add scoped markup and CSS**

Add CV-only class hooks such as `.cv-tool-layout`, `.cv-import-wide`, and compact import subgrid hooks. Use grid placement rather than DOM duplication:

- desktop outer grid: Import full width; b-value/Dunn one column each; full-width summary/results/export;
- desktop import subgrid: format/source/settings/preview arranged in two columns with headings, validation, and wide content spanning both where needed;
- mobile: one column at `≤ 900px`;
- reduce CV-specific padding/gaps and paragraph margins without reducing input target sizes or removing help text.

- [ ] **Step 4: Run focused layout and page tests**

Run: `pnpm test -- tests/tools-markup.test.tsx tests/cv-import-panel.test.tsx tests/cv-page.test.tsx`

Expected: PASS with calculator/shared layout behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CvKineticsPage.tsx src/components/CvImportPanel.tsx src/styles/global.css tests/tools-markup.test.tsx
git commit -m "fix: compact cv analysis layout"
```

---

### Task 5: Final Verification and Branch Handoff

**Files:**
- Modify only if verification reveals a defect within the confirmed scope.

- [ ] **Step 1: Run focused core flows**

Run: `pnpm test -- tests/cv-page.test.tsx tests/cv-parsing.test.ts tests/cv-import-panel.test.tsx tests/tools-markup.test.tsx tests/cv-workflow.test.ts`

Expected: CSV, UTF-16 TXT, and XLSX each import and produce b/Dunn records; low-R² results remain visible; bilingual R² help is exact; layout tests pass.

- [ ] **Step 2: Run the complete test suite**

Run: `pnpm test`

Expected: exit 0 with no failed tests or unhandled errors.

- [ ] **Step 3: Run TypeScript and production build**

Run: `pnpm exec tsc --noEmit`

Run: `pnpm build`

Expected: exit 0 and existing static route output remains intact.

- [ ] **Step 4: Browser-check the requested behavior**

At desktop width, verify Import Data is compact/full-width and b-value/Dunn are side by side. At mobile width, verify stacking and no page-level horizontal overflow. In English and Chinese, run one file of each format and confirm visible results or a visible adjacent error.

- [ ] **Step 5: Review scope and working tree**

Run:

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short --branch
```

Confirm there are no homepage, route, formula, dependency, or unrelated data changes. Do not merge, push, or deploy automatically.

