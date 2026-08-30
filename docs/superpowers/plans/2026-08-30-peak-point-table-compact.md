# Compact Peak-Point Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the peak-point adjustments table compact, scientifically explicit, bilingual, and directly column-copyable without changing analysis behavior.

**Architecture:** Extend the existing `CvPeakAnalysisPanel` with local selected-column and clipboard-status state, while reusing the established table-copy interaction and translations. Derive natural-log display values directly from each existing peak candidate and scan rate so the table matches the current regression implementation.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, existing CSS and i18n resources.

## Global Constraints

- Work only on `fix-dunn-literature-plot`; do not merge `main`.
- Do not change peak detection, b-value regression, Dunn analysis, or exports.
- Keep English and Simplified Chinese support.
- Use `Math.log`, matching the existing regression.
- Keep the table responsive and horizontally scrollable when necessary.

---

### Task 1: Specify the compact table and copy behavior

**Files:**
- Modify: `tests/cv-peak-charts.test.tsx`
- Modify: `tests/cv-page.test.tsx`

**Interfaces:**
- Consumes: `CvPeakAnalysisPanel` and `CvPeakPanelCopy`.
- Produces: failing expectations for inline column checkboxes, natural-log columns, removed visible columns, and clipboard output.

- [ ] **Step 1: Write the failing component tests**

Add expectations that `cv-peak-points` contains headers for `ln(ν / (mV·s⁻¹))` and `ln(|i| / arb. units)`, does not contain the source-index/status headers, and exposes one checkbox for each visible column.

- [ ] **Step 2: Write the failing clipboard test**

Select two header checkboxes, click Copy selected columns, and assert that `navigator.clipboard.writeText` receives tab-separated headers and row values for only those columns.

- [ ] **Step 3: Verify RED**

Run `pnpm vitest run tests/cv-peak-charts.test.tsx tests/cv-page.test.tsx` and confirm the new assertions fail because the current table still renders source index/status and has no copy controls.

### Task 2: Implement the table content and interaction

**Files:**
- Modify: `src/components/CvPeakAnalysisPanel.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`

**Interfaces:**
- Consumes: `CvPeakRatePoint.scanRate`, `CvPeakRatePoint.candidate.current`, and existing clipboard translations.
- Produces: finite natural-log cell strings, inline header checkboxes, and selected-column TSV copying.

- [ ] **Step 1: Extend panel copy strings**

Replace visible source-index/status labels in `CvPeakPanelCopy` with log-rate, log-current, copy action, column-selection aria label, success, and failure strings sourced through `makePeakPanelCopy`.

- [ ] **Step 2: Add minimal copy state and helpers**

Store selected visible column keys in a `Set`, toggle them from header checkboxes, and build TSV from the same column definitions used to render the table. Use `navigator.clipboard.writeText`; set accessible success/error status.

- [ ] **Step 3: Render regression-aligned values**

Render `Math.log(point.scanRate)` only for positive finite scan rates and `Math.log(Math.abs(candidate.current))` only for non-zero finite currents; otherwise render the unavailable label.

- [ ] **Step 4: Verify GREEN**

Run `pnpm vitest run tests/cv-peak-charts.test.tsx tests/cv-page.test.tsx` and confirm all targeted tests pass.

### Task 3: Compact responsive styling and regression verification

**Files:**
- Modify: `src/styles/global.css`
- Test: full test suite and production build

**Interfaces:**
- Consumes: existing `.cv-table-copy-toolbar`, `.cv-table-column-heading`, and `.cv-table-scroll` patterns.
- Produces: wrapped compact headings with inline checkboxes and retained horizontal overflow.

- [ ] **Step 1: Add scoped compact styles**

Add a peak-table class that reduces cell padding, constrains header widths, allows wrapping, keeps checkboxes fixed-size, and preserves horizontal scrolling.

- [ ] **Step 2: Run focused tests**

Run `pnpm vitest run tests/cv-peak-charts.test.tsx tests/cv-page.test.tsx` and expect PASS.

- [ ] **Step 3: Run full verification**

Run `pnpm test` and `pnpm build`; expect all tests and TypeScript/Vite production build to pass.

- [ ] **Step 4: Commit**

Commit only the compact-table implementation, translations, styles, tests, spec, and plan on `fix-dunn-literature-plot`.
