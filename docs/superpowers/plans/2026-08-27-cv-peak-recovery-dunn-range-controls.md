# CV Peak Recovery, Dunn Range, and Peak Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover defensible weak peak-family members across scan rates, guarantee full-cycle Dunn x-range presentation, and replace the scattered peak controls with a compact responsive panel.

**Architecture:** Keep strict per-curve peak detection as the source of high-confidence seed candidates, then run a conservative branch-specific guided recovery pass for missing family members using predicted potential windows and original source points. Keep the Dunn reconstruction untouched; pass the selected raw-cycle domain explicitly to the generic chart and make display sampling retain every branch boundary. Restructure only the peak-control markup and CSS.

**Tech Stack:** React 19, TypeScript 5.7, Vite 5, Vitest 2, jsdom, existing SVG chart components and CV analysis modules.

## Global Constraints

- Work only on `fix-dunn-literature-plot`; do not merge `main`.
- Preserve `log(|i_peak|) = log(a) + b log(v)`.
- Preserve the shared Dunn `g(V)` formulation, physical containment, contribution percentages, threshold/weighted modes, and scientific exports.
- Recovered peaks must be actual original branch points; never fabricate or interpolate peak current values.
- Keep at most ten peak families and never match across forward/reverse branches.
- Preserve bilingual English/Simplified Chinese behavior and mobile responsiveness.
- Deploy from this feature branch only after focused tests, the full suite, and the production build pass.

---

## File map

- `src/lib/cvPeakAnalysis.ts`: strict detection, family seeding/matching, and new guided recovery pass.
- `tests/fixtures/cvPeakData.ts`: deterministic weak-shoulder and genuinely-absent peak datasets.
- `tests/cv-peak-analysis.test.ts`: peak recovery, branch/source-index, missing-point, and ten-family regression tests.
- `src/components/ScientificLineChart.tsx`: optional explicit x-domain and readable endpoint tick formatting.
- `src/pages/CvKineticsPage.tsx`: derive selected raw-cycle x-domain and guarantee branch-boundary retention during display sampling.
- `tests/scientific-chart.test.tsx` and `tests/cv-page.test.tsx`: chart-domain, endpoint, and rendering regressions.
- `src/components/CvPeakAnalysisPanel.tsx`: group selectors, point actions, and peak-management actions semantically.
- `src/styles/global.css`: compact desktop grid and mobile wrapping.
- `tests/cv-peak-charts.test.tsx`: control order, grouping, and bilingual-length-safe layout hooks.

---

### Task 1: Recover weak members of an established peak family

**Files:**
- Modify: `tests/fixtures/cvPeakData.ts`
- Modify: `tests/cv-peak-analysis.test.ts`
- Modify: `src/lib/cvPeakAnalysis.ts`

**Interfaces:**
- Consumes: `CvSeries[]`, `NormalizedCvCycle[]`, strict `CvPeakCandidate[]`.
- Produces: `recoverMissingPeakCandidates(groups, series, cycles): CvPeakGroup[]`; accepted candidates retain `sourceIndex`, original `potential`, and original `current`.

- [ ] **Step 1: Add a deterministic 5/4/3 weak-peak fixture and failing recovery test**

Add `makeRecoverablePeakSeries()` with five scan rates and three same-branch peak families. Scale selected shoulders so the strict detector sees family coverage 5, 4, and 3 while a true local extremum still exists in every guided window. Add:

```ts
it("recovers coherent weak peak-family members from original branch points", () => {
  const series = makeRecoverablePeakSeries();
  const cycles = normalizeAlignedCvCycles(series);
  const strict = matchPeakCandidates(detectPeakCandidates(series, cycles), series.map((item) => item.scanRate));
  expect(strict.map((group) => group.candidates.size)).toEqual([5, 4, 3]);

  const result = analyzePeakBValues(series, cycles, 0);
  expect(result.fits.map((fit) => fit.coverageCount)).toEqual([5, 5, 5]);
  for (const fit of result.fits) {
    for (const point of fit.points) {
      expect(point.candidate).not.toBeNull();
      const original = series[point.seriesIndex]!.points[point.candidate!.sourceIndex]!;
      expect(point.candidate!.potential).toBe(original.potential);
      expect(point.candidate!.current).toBe(original.current);
      expect(point.candidate!.branch).toBe(fit.branch);
    }
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/cv-peak-analysis.test.ts`

Expected: FAIL because `analyzePeakBValues` still returns partial 5/4/3 coverage.

- [ ] **Step 3: Select the richest reliable reference series**

In `matchPeakCandidates`, replace the fixed median reference with a helper that ranks each series by candidate count and summed confidence for the current branch/kind:

```ts
function chooseReferenceSeries(
  local: CvPeakCandidate[],
  seriesOrder: Array<{ scanRate: number; seriesIndex: number }>
) {
  return [...seriesOrder].sort((left, right) => {
    const leftCandidates = local.filter((item) => item.seriesIndex === left.seriesIndex);
    const rightCandidates = local.filter((item) => item.seriesIndex === right.seriesIndex);
    return rightCandidates.length - leftCandidates.length
      || sumConfidence(rightCandidates) - sumConfidence(leftCandidates)
      || left.scanRate - right.scanRate;
  })[0]!;
}
```

Extend groups outward by scan-rate order on both sides of that reference and retain the existing monotone assignment and ten-family cap.

- [ ] **Step 4: Implement conservative guided recovery**

After strict matching, call `recoverMissingPeakCandidates`. For each missing series member:

```ts
const predicted = predictPotentialAtRate(group, scanRate);
const halfWindow = Math.min(0.12 * branchSpan, Math.max(4 * nativeInterval, 0.06 * branchSpan));
const recovered = recoverLocalExtremum(branchPoints, predicted, halfWindow, group.kind);
```

`recoverLocalExtremum` must smooth only for locating the extremum, require the expected maximum/minimum direction, enforce family separation and an adaptive guided prominence floor, then return the corresponding original `CvSweepPoint`. Assign recovery confidence below strict detections while keeping all numeric fields finite.

- [ ] **Step 5: Add the genuinely-absent and branch-isolation tests**

Keep `makePartialPeakSeries()` genuinely absent at two rates and assert it remains partial. Add assertions that no recovered forward candidate uses a reverse source index and that `makeManyPeakSeries(12)` still returns exactly ten fits.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- tests/cv-peak-analysis.test.ts tests/cv-workflow.test.ts tests/cv-peak-overrides.test.ts`

Expected: all selected test files pass.

- [ ] **Step 7: Commit the peak recovery**

```powershell
git add -- src/lib/cvPeakAnalysis.ts tests/fixtures/cvPeakData.ts tests/cv-peak-analysis.test.ts
git commit -m "fix: recover weak CV peak family members"
```

---

### Task 2: Make the Dunn chart domain and endpoint coverage explicit

**Files:**
- Modify: `tests/scientific-chart.test.tsx`
- Modify: `tests/cv-page.test.tsx`
- Modify: `src/components/ScientificLineChart.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`

**Interfaces:**
- Produces: optional `xDomain?: [number, number]` on `ScientificLineChartProps`.
- Produces: SVG diagnostic `data-x-domain="minimum,maximum"` using full-precision domain values.

- [ ] **Step 1: Add failing explicit-domain and readable-tick tests**

Render `ScientificLineChart` with points inside `[-0.995, -0.005]` and `xDomain={[-0.9992, -0.000307]}`. Assert the SVG domain attribute contains the explicit endpoints and the outer x tick labels are `-1` and `0`. Add a page test that uploads a complete loop, forces display sampling, and asserts the original, forward capacitive, and reverse capacitive paths reach their respective raw branch endpoints.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/scientific-chart.test.tsx tests/cv-page.test.tsx`

Expected: FAIL because the component has no explicit x-domain prop/diagnostic and endpoint tick snapping is absent.

- [ ] **Step 3: Add a validated explicit x-domain**

Extend the props and resolve the domain without altering y-domain behavior:

```ts
const resolvedXDomain = xDomain
  && xDomain.length === 2
  && xDomain.every(Number.isFinite)
  && xDomain[0] < xDomain[1]
    ? xDomain
    : expandedDomain(domainPoints, "x");
```

Use `resolvedXDomain` for projection, ticks, selection, and `data-x-domain`. Format an endpoint as zero or a nearby integer only when its display difference is within `0.001 * (max - min)`; keep internal values and exported rows unchanged.

- [ ] **Step 4: Pass the raw selected-cycle domain and harden sampling**

In `CvKineticsPage`, calculate:

```ts
const selectedDunnXDomain = selectedOriginalSeries
  ? selectedOriginalSeries.points.reduce<[number, number]>(
      ([minimum, maximum], point) => [Math.min(minimum, point.potential), Math.max(maximum, point.potential)],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    )
  : undefined;
```

Pass it only to the Dunn chart. In `sampleDunnPlotPath`, reserve the first/last record globally plus the first/last record of every contiguous branch run before allocating remaining extreme-preserving samples. Do not change `plotPath`, exports, integrations, or `g(V)`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- tests/scientific-chart.test.tsx tests/cv-page.test.tsx tests/cv-dunn-quality.test.ts`

Expected: all selected test files pass and physical-containment diagnostics remain unchanged.

- [ ] **Step 6: Commit the Dunn presentation fix**

```powershell
git add -- src/components/ScientificLineChart.tsx src/pages/CvKineticsPage.tsx tests/scientific-chart.test.tsx tests/cv-page.test.tsx
git commit -m "fix: preserve full Dunn plot potential range"
```

---

### Task 3: Rebuild the peak controls as a compact responsive panel

**Files:**
- Modify: `tests/cv-peak-charts.test.tsx`
- Modify: `src/components/CvPeakAnalysisPanel.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `data-peak-control-row="selectors|point-actions|peak-actions"` layout hooks.
- Existing callbacks and control names remain unchanged.

- [ ] **Step 1: Add a failing semantic-layout test**

Assert one selector row contains Peak then Scan rate, one point-action row contains Confirm/Exclude/Restore in that order, and one peak-action row contains Add/Remove with `secondary-button` styling. Preserve the existing callback assertions.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/cv-peak-charts.test.tsx`

Expected: FAIL because all five buttons currently share one ungrouped flex container.

- [ ] **Step 3: Group the controls without changing behavior**

Use this structure inside `cv-peak-selection-controls`:

```tsx
<div className="cv-peak-selector-row" data-peak-control-row="selectors">...</div>
<div className="cv-peak-point-actions" data-peak-control-row="point-actions">...</div>
<div className="cv-peak-management-actions" data-peak-control-row="peak-actions">
  <button className="secondary-button" ...>{copy.add}</button>
  <button className="secondary-button" ...>{copy.remove}</button>
</div>
```

Keep button disabled states and handlers exactly as they are.

- [ ] **Step 4: Implement desktop and mobile CSS**

Desktop: one bordered, lightly tinted control panel; two fixed-but-fluid selectors; action rows left-aligned with consistent gaps and no detached right column. Mobile: one column for selectors, action buttons wrap at `minmax(9rem, 1fr)`, and long English/Chinese labels do not overflow.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- tests/cv-peak-charts.test.tsx tests/cv-page.test.tsx tests/i18n.test.tsx`

Expected: all selected test files pass.

- [ ] **Step 6: Commit the layout correction**

```powershell
git add -- src/components/CvPeakAnalysisPanel.tsx src/styles/global.css tests/cv-peak-charts.test.tsx
git commit -m "fix: compact CV peak analysis controls"
```

---

### Task 4: Regression verification and feature-branch deployment

**Files:**
- Temporarily modify and restore: `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: every Vitest file and test passes with no unhandled errors.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully and route entry generation succeeds.

- [ ] **Step 3: Verify the real NCP workflow locally**

Use `NCP-CV——1.csv` and `NCP-CV——1.xlsx` with scan rates `50, 20, 10, 5, 2`. Verify analysis completes, three intended peak families have complete defensible coverage where their branch extrema exist, the Dunn chart domain spans the selected raw cycle, and the compact controls remain aligned in English and Chinese at desktop and mobile widths.

- [ ] **Step 4: Push the feature commits**

Run: `git push origin fix-dunn-literature-plot`

Expected: the remote feature branch advances without updating `main`.

- [ ] **Step 5: Deploy GitHub Pages from the feature branch**

Temporarily add `fix-dunn-literature-plot` beside `main` under `.github/workflows/deploy-pages.yml` push branches, commit and push that workflow change, wait for the Pages workflow to complete successfully, then restore the workflow to `branches: ["main"]`, commit, and push the restoration. Do not merge `main`.

- [ ] **Step 6: Verify production**

Open `https://tmccdb.org/tools/cv-kinetics/` with a cache-busting query. Repeat CSV and XLSX NCP analysis, confirm the three peak families, full Dunn range, and responsive control layout, then report the deployed commit and workflow run.
