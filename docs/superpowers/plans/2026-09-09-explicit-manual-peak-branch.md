# Explicit Manual Peak Branch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users explicitly add an oxidation or reduction peak family even when automatic detection found peaks on only one sweep branch.

**Architecture:** Keep the existing peak override model and manual-family matching algorithm. Add one helper that chooses the strongest unoccupied local extremum on a requested branch, then expose two localized branch actions from the existing Add peak control.

**Tech Stack:** React 19, TypeScript, Vitest, existing CV peak-analysis modules and locale resources.

## Global Constraints

- Change only the manual Add peak interaction.
- Do not change automatic peak detection, b-value regression, charts, exports, or scientific formulas.
- Preserve the ten-peak limit and bilingual architecture.
- Add no dependencies.

---

### Task 1: Branch-aware manual peak creation

**Files:**
- Modify: `src/lib/cvPeakOverrides.ts`
- Test: `tests/cv-peak-overrides.test.ts`

**Interfaces:**
- Produces: `addManualPeakForBranch(state, automatic, series, cycles, anchorSeriesIndex, branch): CvPeakOverrideState`
- Consumes: existing `addManualPeakOverride`, `findOriginalPeakExtrema`, and active fitted points.

- [x] **Step 1: Write failing tests** proving a reverse family can be created when automatic results contain only a forward family, and vice versa.
- [x] **Step 2: Run** `npm test -- tests/cv-peak-overrides.test.ts` and confirm failure because `addManualPeakForBranch` is absent.
- [x] **Step 3: Implement the helper** by ranking unoccupied original extrema on the requested branch by prominence and delegating to `addManualPeakOverride`.
- [x] **Step 4: Run the focused test** and confirm it passes.

### Task 2: Explicit compact branch chooser

**Files:**
- Modify: `src/components/CvPeakAnalysisPanel.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `src/styles/global.css`
- Test: `tests/cv-page.test.tsx`

**Interfaces:**
- `CvPeakAnalysisPanel` receives `onAddPeakBranch(branch)` and localized oxidation/reduction add labels.
- `CvKineticsPage` toggles the compact chooser and calls `addManualPeakForBranch` for the selected branch.

- [x] **Step 1: Write failing page tests** asserting the two actions appear after Add peak and that choosing reduction creates a reverse manual family without a chart click.
- [x] **Step 2: Run** `npm test -- tests/cv-page.test.tsx` and confirm the new assertions fail.
- [x] **Step 3: Add localized labels and the two compact actions**, replacing only the pending chart-click add flow.
- [x] **Step 4: Run the focused page tests** and confirm they pass.
- [x] **Step 5: Run** `npm test` and `npm run build`; confirm no regression or TypeScript/build failure.
