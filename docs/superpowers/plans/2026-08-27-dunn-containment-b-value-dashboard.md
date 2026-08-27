# Dunn Physical Containment and b-Value Dashboard Implementation Plan

> **For Codex:** Execute this plan in order with test-driven development. Add each failing test before its production change. Do not merge automatically.

**Goal:** Guarantee numerical and visual branch-wise Dunn containment, synchronize Dunn chart/export geometry, and deliver a branch-aware publication-style b-value dashboard with near-zero-current stability handling.

**Architecture:** Keep the aligned PCHIP grid as the fitting/integration model. Add a canonical ordered Dunn record model for rendering and reconstructed-current export, then derive every displayed Dunn line/polygon from one shared sampled record set. Extend b-value fit records with unit-invariant current-stability metadata and render them in a dedicated overview component while retaining the generic line chart for the selected regression.

**Tech stack:** React 19, TypeScript, Vite, Vitest, jsdom, existing SVG components and CSS. No new dependency.

---

## Task 1: Add Dunn containment primitives and diagnostics

**Files:**

- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvDunnQuality.ts`
- Test: `tests/cv-dunn-quality.test.ts`

**Steps:**

1. Add tests for positive/negative final clipping, zero-current handling, maximum signed/absolute overshoot, and validation failure above the scale-aware tolerance.
2. Run `npm test -- --run tests/cv-dunn-quality.test.ts` and confirm the new tests fail for missing behavior.
3. Add ordered record and containment diagnostic types.
4. Implement one branch-wise containment helper used by aligned reconstruction and ordered reconstruction.
5. Calculate and validate residual overshoot diagnostics after clipping.
6. Re-run the targeted test until it passes.
7. Commit the focused change.

## Task 2: Make ordered Dunn records canonical for chart geometry

**Files:**

- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvDunnQuality.ts`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/components/ScientificLineChart.tsx`
- Test: `tests/cv-dunn-quality.test.ts`
- Test: `tests/scientific-chart.test.tsx`
- Test: `tests/cv-page.test.tsx`

**Steps:**

1. Add failing tests that the ordered path contains measured/capacitive/diffusion values, preserves branch ownership and turning duplicates, and inserts synchronized raw/capacitive zero crossings.
2. Add failing page/chart tests asserting that original boundaries, capacitive boundaries, and filled polygons report the same shared record/sample identity and that the reverse branch does not borrow a foreign seam point.
3. Implement canonical ordered records from original scan order with PCHIP-evaluated `g(V)` and the final containment helper.
4. Add a small polygon-area capability to the SVG chart component, or a dedicated equivalent, so the inner loop and branch strips can be derived from ordered records without an independent potential grid.
5. Replace independent Dunn series/area sampling with one branch-aware sampled ordered-record set. Retain endpoints, seams, turning duplicates, zero crossings, and selected extrema.
6. Derive measured curve, capacitive branches, inner capacitive polygon, and diffusion strips from that shared sample.
7. Re-run targeted tests and commit.

## Task 3: Synchronize reconstructed-current exports

**Files:**

- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Test: `tests/cv-page.test.tsx`

**Steps:**

1. Add failing tests for ordered export rows containing scan rate, sequence, branch, potential, measured current, capacitive current, diffusion current, and containment diagnostics.
2. Keep the existing aligned input export intact, but make reconstructed-current exports use canonical ordered records rather than independently reconstructed columns.
3. Add bilingual export labels and metadata for overshoot diagnostics.
4. Run the page export tests and commit.

## Task 4: Add near-zero b-value stability classification

**Files:**

- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvAnalysis.ts`
- Modify: `src/lib/cvWorkflow.ts`
- Test: `tests/cv-analysis.test.ts`
- Test: `tests/cv-workflow.test.ts`

**Steps:**

1. Add tests covering scale-invariant near-zero detection on forward and reverse branches, exact-zero precedence, retained finite fit traceability, and unchanged b-value R² filtering in threshold/weighted Dunn modes.
2. Confirm the tests fail because only exact zero is currently checked.
3. Compute a branch current scale and classify any position containing `abs(i) <= 1e-6 * branchScale` as `nearZeroCurrentUnstable`.
4. Preserve that stability status when applying the R² classifier.
5. Update quality summary counts and stable status types.
6. Re-run targeted tests and commit.

## Task 5: Add deterministic representative b-value selection

**Files:**

- Add: `src/lib/cvBValueSelection.ts`
- Modify: `src/pages/CvKineticsPage.tsx`
- Test: `tests/cv-b-value-selection.test.ts`
- Test: `tests/cv-page.test.tsx`

**Steps:**

1. Add unit tests for branch-aware identity, valid shared-grid candidates, near-zero/endpoint avoidance, deterministic fallback, nearest-grid snapping, and four-decimal display formatting with full internal precision.
2. Implement pure selection/scoring/snapping helpers.
3. Replace “first valid b record” initialization with representative selection.
4. Keep a separate selected branch and record identity; allow inspection of finite below-threshold and out-of-range fits.
5. Snap typed potential values on commit to the nearest fitted grid record on the active branch; keep Previous/Next navigation on selectable records.
6. Re-run targeted tests and commit.

## Task 6: Build the b-value overview component

**Files:**

- Add: `src/components/BValueOverviewChart.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Add: `tests/b-value-overview-chart.test.tsx`
- Modify: `tests/cv-page.test.tsx`

**Steps:**

1. Add component tests for independent forward/reverse paths, null-gap breaks, `b=0.5`/`b=1.0` references, marker categories, unique branch-aware selection, accessible labels, and no cross-branch line.
2. Implement a dependency-free responsive SVG overview using existing chart visual conventions.
3. Render stable conventional-range points, stable out-of-range points, below-threshold points, and unstable points with distinct color plus marker form.
4. Add selected-potential vertical line and emphasized selected point/branch.
5. Add compact bilingual interpretation help.
6. Re-run component/page tests and commit.

## Task 7: Reorganize the b-value section and widen the CV introduction

**Files:**

- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Test: `tests/cv-page.test.tsx`

**Steps:**

1. Add failing tests for overview/regression card structure, compact metrics, outside-conventional-range note, selected branch, bilingual strings, and the CV-only full-width header class.
2. Lay out overview and regression as balanced cards on desktop and stacked cards on smaller screens.
3. Keep the complete results table below the cards with existing scrolling/copy-column behavior.
4. Add the selected metrics row and out-of-range note without suppressing finite fits.
5. Scope a `max-width: none` header override to the CV page so subtitle, description, Benefits, and sampling notice use the full content width.
6. Re-run page tests and commit.

## Task 8: NCP/BP150 regression and rendered containment verification

**Files:**

- Modify: `tests/cv-workflow.test.ts`
- Modify: `tests/cv-page.test.tsx`
- Modify: `tests/fixtures/cvRegressionData.ts` only if fixture helpers are required

**Steps:**

1. Add assertions across every scan rate and every aligned/ordered record for signed containment and residual overshoot tolerance.
2. Add high-rate and turning-reconnection assertions for both NCP and BP150 fixtures.
3. Add rendered-geometry checks using the shared record/sample identifiers and zero-crossing records.
4. Run the targeted regression tests and commit.

## Task 9: Full verification, review, and deployment

**Files:**

- Review all changed production/test/locale/spec/plan files.

**Steps:**

1. Run `npm test`.
2. Run `npm run build`.
3. Run `npm run validate:data`.
4. Start the local Vite site and inspect the CV page at desktop and mobile widths in English and Simplified Chinese.
5. Import and analyze the NCP and BP150 regression datasets; inspect the highest scan rates, turning points, b-value overview, selection behavior, and SVG/PNG export.
6. Run `git diff --check` and review the final branch diff for unrelated changes.
7. Apply any review fixes and repeat affected tests.
8. Deploy using the repository’s existing production procedure, verify the live CV route, and report the deployed commit. Do not merge automatically.
