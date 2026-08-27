# Shared g(V) Stabilization and Contribution Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize sparse-anchor shared-g(V) Dunn reconstruction with grid-invariant adaptive regularization and replace the contribution line chart with a labeled 100% stacked bar chart.

**Architecture:** Add a pure stabilization-policy module between Dunn confidence extraction and the existing bounded optimizer. Normalize the optimizer's fidelity and curvature as continuous quantities, then reconstruct both branches only through the same bounded g(V). Render contribution percentages in a dedicated SVG stacked-bar component while preserving existing exports and tables.

**Tech Stack:** React 19, TypeScript 5.7, Vite 5, Vitest 2, native SVG, existing PCHIP CV interpolation.

## Global Constraints

- Work only on the current `fix-dunn-literature-plot` feature worktree; do not merge automatically.
- Keep `CV Kinetics Analysis` as the page title and preserve the approved bilingual advanced Dunn introduction.
- Preserve both Dunn R² modes: threshold remains the default at 0.95 and editable; weighted remains continuous.
- Keep existing b-value R² threshold classification unchanged.
- Keep `i_cap,f(V) = g(V) * i_f(V)`, `i_cap,r(V) = g(V) * i_r(V)`, and `0 <= g(V) <= 1` exactly.
- Do not independently smooth or fit capacitive/diffusion current branches.
- Turning-point trim excludes only unstable reversal fits; the final CV restores original order and original turning-point records.
- Use explicit English/Simplified Chinese resources already present; do not introduce runtime translation.
- Do not redesign unrelated pages or add user controls.
- Use TDD for every behavior change and commit after every independently reviewable task.

---

## File Structure

- Create `src/lib/cvDunnStabilization.ts`: pure coverage, confidence blending, robust-noise, and smoothing-multiplier policy.
- Modify `src/lib/cvTypes.ts`: stabilization and expanded regularization diagnostic types.
- Modify `src/lib/cvDunnReconstruction.ts`: dimensionless fidelity, quadrature-normalized curvature, adaptive lambda, convergence.
- Modify `src/lib/cvWorkflow.ts`: call stabilization before optimization.
- Modify `src/lib/cvDunnQuality.ts`: retain and validate stabilization diagnostics without changing branch reconstruction formulas.
- Create `src/components/ScientificStackedBarChart.tsx`: accessible 100% stacked contribution chart.
- Modify `src/pages/CvKineticsPage.tsx`: use the new chart and remove contribution line-series construction.
- Modify `src/styles/global.css`: count-aware chart width and small-segment label presentation.
- Create `tests/cv-dunn-stabilization.test.ts`: policy unit tests.
- Modify `tests/cv-dunn-reconstruction.test.ts`: continuous-curvature and adaptive-lambda tests.
- Modify `tests/cv-workflow.test.ts`: NCP/BP150, noisy resolution, shared-g, and turning-point regressions.
- Modify `tests/cv-dunn-quality.test.ts`: expanded diagnostics and exact reconstruction invariants.
- Create `tests/scientific-stacked-bar-chart.test.tsx`: SVG bar and label tests.
- Modify `tests/cv-page.test.tsx`: page integration, bilingual labels, export id, table/copy preservation.

---

### Task 1: Pure Dunn Stabilization Policy

**Files:**
- Create: `src/lib/cvDunnStabilization.ts`
- Modify: `src/lib/cvTypes.ts`
- Create: `tests/cv-dunn-stabilization.test.ts`

**Interfaces:**
- Consumes: `makeDunnFractionGrid(fits, scanRate, mode, threshold): DunnFractionGrid`.
- Produces:

```ts
export interface DunnStabilizationDiagnostics {
  forwardAnchorCoverage: number;
  reverseAnchorCoverage: number;
  effectiveAnchorCoverage: number;
  lowerMedianRSquared: number;
  rawFractionNoise: number;
  confidenceBlend: number;
  smoothingMultiplier: number;
}

export interface DunnStabilizationResult {
  fractions: DunnFractionGrid;
  diagnostics: DunnStabilizationDiagnostics;
}

export function stabilizeDunnFractions(
  fits: DunnFitGrid,
  scanRate: number,
  mode: DunnConfidenceMode,
  threshold: number
): DunnStabilizationResult;
```

- [ ] **Step 1: Write failing policy tests**

Create table-driven tests that construct finite untrimmed fits with controlled R² values. Include these exact assertions:

```ts
const sparse = stabilizeDunnFractions(
  makeFits({ forwardTrusted: 0.09, reverseTrusted: 0.05 }),
  10,
  "threshold",
  0.95
);
expect(sparse.diagnostics.confidenceBlend).toBeCloseTo(0.85, 12);

const adequate = stabilizeDunnFractions(
  makeFits({ forwardTrusted: 0.5, reverseTrusted: 0.5 }),
  10,
  "threshold",
  0.95
);
expect(adequate.diagnostics.confidenceBlend).toBe(0);

expect(stabilizeDunnFractions(fits, 10, "weighted", 0.95).diagnostics.confidenceBlend).toBe(0);
expect(noisy.diagnostics.smoothingMultiplier).toBeGreaterThan(clean.diagnostics.smoothingMultiplier);
expect(lowR2.diagnostics.smoothingMultiplier).toBeGreaterThan(highR2.diagnostics.smoothingMultiplier);
expect(sparse.diagnostics.smoothingMultiplier).toBeGreaterThan(adequate.diagnostics.smoothingMultiplier);
expect(sparse.diagnostics.smoothingMultiplier).toBeLessThanOrEqual(30);
```

Also assert that trimmed/failed records do not enter the coverage denominator, the weaker branch affects the geometric coverage, and all effective confidences stay finite and non-negative.

- [ ] **Step 2: Run the new test and verify red**

Run:

```powershell
pnpm exec vitest run tests/cv-dunn-stabilization.test.ts
```

Expected: FAIL because `cvDunnStabilization.ts` and its exported interfaces do not exist.

- [ ] **Step 3: Add the diagnostic types**

Add the interfaces shown above to `src/lib/cvTypes.ts`. Do not add UI strings or settings fields.

- [ ] **Step 4: Implement coverage and evidence blending**

Implement pure helpers with the approved equations:

```ts
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothStep = (value: number) => value * value * (3 - 2 * value);

export function confidenceBlendForCoverage(coverage: number): number {
  const t = clamp01((0.50 - coverage) / 0.40);
  return 0.85 * smoothStep(t);
}

function effectiveCoverage(forward: number, reverse: number): number {
  return Math.sqrt(forward * reverse);
}

function blendPoint(
  thresholdPoint: DunnFractionPoint,
  weightedPoint: DunnFractionPoint,
  beta: number
): DunnFractionPoint {
  return {
    ...thresholdPoint,
    confidence: (1 - beta) * thresholdPoint.confidence + beta * weightedPoint.confidence
  };
}
```

In weighted mode, return the weighted grid unchanged and report `confidenceBlend: 0`. In threshold mode, blend confidence only; do not average two reconstructed g arrays.

- [ ] **Step 5: Implement robust noise and smoothing multiplier**

Use exactly 101 normalized diagnostic nodes, confidence-weighted branch combination, linear gap fill, a centered nine-node running median, MAD, and IQR. Implement the approved formula:

```ts
const coverageDeficiency = clamp01((0.50 - coverage) / 0.50);
const rSquaredDeficiency = clamp01((0.95 - lowerMedianRSquared) / 0.45);
const smoothingMultiplier = Math.min(30, Math.max(1,
  1
  + 12 * coverageDeficiency ** 2
  + 6 * rSquaredDeficiency ** 2
  + 10 * rawFractionNoise ** 2
));
```

Validate every returned scalar. Throw `CvAnalysisError("reconstructionFailed")` for a non-finite policy output or when neither branch contains finite fraction evidence.

- [ ] **Step 6: Run focused tests and existing confidence tests**

Run:

```powershell
pnpm exec vitest run tests/cv-dunn-stabilization.test.ts tests/cv-dunn-confidence.test.ts
```

Expected: both files PASS; existing threshold and weighted confidence assertions remain unchanged.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/lib/cvDunnStabilization.ts src/lib/cvTypes.ts tests/cv-dunn-stabilization.test.ts
git commit -m "feat: stabilize sparse Dunn confidence evidence"
```

---

### Task 2: Grid-Invariant Bounded shared-g(V) Optimizer

**Files:**
- Modify: `src/lib/cvDunnReconstruction.ts`
- Modify: `src/lib/cvTypes.ts`
- Modify: `tests/cv-dunn-reconstruction.test.ts`
- Modify: `tests/cv-dunn-quality.test.ts`

**Interfaces:**
- Consumes: effective `DunnFractionGrid`, strictly increasing potential grid, and `smoothingMultiplier` from Task 1.
- Produces:

```ts
export function optimizeSharedFraction(
  fractions: DunnFractionGrid,
  potentials: number[],
  smoothingMultiplier?: number
): DunnSharedFractionResult;

export interface DunnRegularizationDiagnostics {
  baseLambda: number;
  lambda: number;
  smoothingMultiplier: number;
  iterations: number;
  converged: boolean;
  optimalityResidual: number;
  fidelity: number;
  roughness: number;
}
```

- [ ] **Step 1: Write failing continuous-objective tests**

Add tests for:

```ts
expect(secondDifferenceRoughness(
  coarseX.map((x) => x * x), coarseX
)).toBeCloseTo(secondDifferenceRoughness(
  denseX.map((x) => x * x), denseX
), 3);

const base = optimizeSharedFraction(fractions, potentials, 1);
const strong = optimizeSharedFraction(fractions, potentials, 20);
expect(strong.diagnostics.lambda).toBeCloseTo(strong.diagnostics.baseLambda * 20, 12);
expect(strong.diagnostics.roughness).toBeLessThan(base.diagnostics.roughness);
```

Add a deterministic noisy function sampled at 51 and 501 points. Compare g at normalized positions `0, 0.25, 0.5, 0.75, 1` with tolerance `< 0.02`. Assert an all-zero-confidence grid throws `reconstructionFailed`, rather than returning constant 0.5.

- [ ] **Step 2: Run the reconstruction test and verify red**

```powershell
pnpm exec vitest run tests/cv-dunn-reconstruction.test.ts
```

Expected: FAIL because the current roughness sum and optimizer signature are grid-density dependent.

- [ ] **Step 3: Replace the finite-difference operator with curvature quadrature**

Normalize potential to `[0, 1]`. For each interior point construct a row whose coefficients are the nonuniform second derivative multiplied by the square root of its quadrature width:

```ts
const quadratureWidth = (leftSpacing + rightSpacing) / 2;
const scale = Math.sqrt(quadratureWidth);
const coefficients: [number, number, number] = [
  scale * 2 / (leftSpacing * (leftSpacing + rightSpacing)),
  scale * -2 / (leftSpacing * rightSpacing),
  scale * 2 / (rightSpacing * (leftSpacing + rightSpacing))
];
```

`operatorRoughness` remains the sum of squared row evaluations; with the new rows it approximates `integral(g''(x)^2 dx)`.
Use that integral directly for L-curve roughness and diagnostics; remove the current division by row count because quadrature weights already normalize sampling density.

- [ ] **Step 4: Normalize confidence fidelity**

After combining branch targets, divide all non-negative weights by their positive total before candidate solving:

```ts
const totalWeight = combined.weight.reduce((sum, value) => sum + value, 0);
if (!(totalWeight > 0)) throw new CvAnalysisError("reconstructionFailed");
const normalizedWeight = combined.weight.map((value) => value / totalWeight);
```

Use normalized weights consistently in the objective, gradient, candidate comparison, diagnostics, and optimality residual.

- [ ] **Step 5: Apply adaptive lambda and retain bounded convergence**

Replace the candidate grid with:

```ts
const BASE_LAMBDA_CANDIDATES = [
  1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1
] as const;
```

Select `baseLambda` by the existing deterministic L-curve process, set `lambda = baseLambda * smoothingMultiplier`, and perform a final solve at that effective lambda. Validate `1 <= smoothingMultiplier <= 30`.

Replace the fixed-step accelerated loop with monotone projected FISTA using deterministic backtracking and adaptive restart:

```ts
while (!majorizesObjective(next, accelerated, gradient, localLipschitz)) {
  localLipschitz *= 2;
  projectGradientStep(accelerated, gradient, 1 / localLipschitz, next);
}
if (objective(next, target, weight, lambda, operator) > previousObjective) {
  accelerated = [...g];
  momentum = 1;
  continue;
}
const restart = dotDifference(next, g, accelerated, next) > 0;
momentum = restart ? 1 : (1 + Math.sqrt(1 + 4 * momentum * momentum)) / 2;
```

Warm-start successive L-curve candidates, allow at most 50,000 iterations, use residual `1e-5` while ranking candidates, then solve the selected effective lambda to the existing KKT/box optimality residual `<= 1e-6`. Throw `reconstructionFailed` if the final solve does not converge; do not relax the objective or physical bounds.

Update the three explicit `DunnRegularizationDiagnostics` fixtures in `tests/cv-dunn-quality.test.ts` to include `baseLambda` and `smoothingMultiplier`, while retaining their existing `lambda`, convergence, residual, fidelity, and roughness values.

- [ ] **Step 6: Run reconstruction and type tests**

```powershell
pnpm exec vitest run tests/cv-dunn-reconstruction.test.ts tests/cv-dunn-quality.test.ts
pnpm exec tsc -- --noEmit
```

Expected: focused tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/lib/cvDunnReconstruction.ts src/lib/cvTypes.ts tests/cv-dunn-reconstruction.test.ts tests/cv-dunn-quality.test.ts
git commit -m "fix: normalize shared Dunn smoothing by potential"
```

---

### Task 3: Workflow Integration and NCP/BP150 Regression Gates

**Files:**
- Modify: `src/lib/cvWorkflow.ts`
- Modify: `src/lib/cvDunnQuality.ts`
- Modify: `src/lib/cvTypes.ts`
- Modify: `tests/cv-workflow.test.ts`
- Modify: `tests/cv-dunn-quality.test.ts`
- Modify: `tests/fixtures/cvRegressionData.ts`

**Interfaces:**
- Consumes: `stabilizeDunnFractions(...)` from Task 1 and `optimizeSharedFraction(..., smoothingMultiplier)` from Task 2.
- Produces: each `DunnContribution.diagnostics` retains existing quality fields and adds the stabilization/regularization metrics needed for regression assertions.

- [ ] **Step 1: Write failing workflow regression tests**

Extend the NCP and BP150 table-driven suite for both confidence modes:

```ts
expect(contribution.g.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
contribution.capacitiveForward.forEach((value, index) => {
  expect(value).toBeCloseTo(contribution.g[index]! * contribution.originalForward[index]!, 12);
});
contribution.capacitiveReverse.forEach((value, index) => {
  expect(value).toBeCloseTo(contribution.g[index]! * contribution.originalReverse[index]!, 12);
});
expect(contribution.capacitivePercent + contribution.diffusionPercent).toBeCloseTo(100, 10);
```

For threshold NCP/BP150 fixtures, assert sparse coverage gives `confidenceBlend > 0`, the effective lambda equals base lambda times the multiplier, and the optimized high-frequency residual/roughness is below the raw continuous-weighted target. Add a deterministic potential-defined noise function and low-confidence gap to `makeResolutionStabilitySeries`; preserve `< 0.5` percentage-point and `< 0.02` fixed-potential tolerances across 51/501 grids.

Add direct assertions that every original single/double turning-point record in the normalized cycle has a corresponding final `plotPath` record with the same potential, branch ownership, and `current = originalCurrent * evaluated g`.

- [ ] **Step 2: Run workflow tests and verify red**

```powershell
pnpm exec vitest run tests/cv-workflow.test.ts tests/cv-dunn-quality.test.ts
```

Expected: FAIL because the workflow does not yet call stabilization or expose its diagnostics.

- [ ] **Step 3: Integrate stabilization in the workflow**

Replace the per-rate block with this data flow:

```ts
const stabilized = stabilizeDunnFractions(
  dunnRecords,
  scanRate,
  settings.dunnConfidenceMode,
  settings.rSquaredThreshold
);
const optimized = optimizeSharedFraction(
  stabilized.fractions,
  alignedGrid.potentials,
  stabilized.diagnostics.smoothingMultiplier
);
return reconstructDunnContribution({
  alignedGrid,
  dunnRecords,
  optimized,
  fractions: stabilized.fractions,
  stabilization: stabilized.diagnostics,
  scanRate,
  seriesIndex,
  mode: settings.dunnConfidenceMode,
  threshold: settings.rSquaredThreshold,
  resolvedTurningPointTrim: dunnRecords.resolvedTurningPointTrim
});
```

Do not alter `classifyRecords` or the b-value path.

- [ ] **Step 4: Retain and validate diagnostics**

Add `stabilization: DunnStabilizationDiagnostics` to `DunnContributionInput`. Extend `DunnDiagnostics` with the stabilization metrics and `baseLambda`, `effectiveLambda`, and `smoothingMultiplier`. Populate them from `input.stabilization` and `input.optimized.diagnostics`; validate that coverages/noise/blend are in `[0,1]`, multiplier is in `[1,30]`, and lambdas are finite and positive.

Do not change `reconstructBranchCurrents`, `reconstructOriginalOrderPath`, `evaluateSharedFraction`, or the exact sign/magnitude validation formulas except for type plumbing.

- [ ] **Step 5: Run all CV library tests**

```powershell
pnpm exec vitest run tests/cv-dunn-confidence.test.ts tests/cv-dunn-stabilization.test.ts tests/cv-dunn-reconstruction.test.ts tests/cv-dunn-quality.test.ts tests/cv-workflow.test.ts tests/cv-cycle.test.ts tests/cv-interpolation.test.ts tests/cv-analysis.test.ts
```

Expected: all listed files PASS in threshold and weighted modes.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/lib/cvWorkflow.ts src/lib/cvDunnQuality.ts src/lib/cvTypes.ts tests/cv-workflow.test.ts tests/cv-dunn-quality.test.ts tests/fixtures/cvRegressionData.ts
git commit -m "fix: integrate adaptive shared Dunn reconstruction"
```

---

### Task 4: Labeled 100% Stacked Contribution Chart

**Files:**
- Create: `src/components/ScientificStackedBarChart.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/styles/global.css`
- Create: `tests/scientific-stacked-bar-chart.test.tsx`
- Modify: `tests/cv-page.test.tsx`

**Interfaces:**
- Consumes:

```ts
export interface StackedBarDatum {
  id: string;
  x: number;
  lower: number;
  upper: number;
}
```

- Produces:

```ts
export interface ScientificStackedBarChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  emptyLabel: string;
  legendLabel: string;
  lowerLabel: string;
  upperLabel: string;
  lowerColor: string;
  upperColor: string;
  data: StackedBarDatum[];
  exportId?: string;
  metadata?: string | string[];
}
```

- [ ] **Step 1: Write failing component tests**

Render three unsorted scan rates and assert:

```ts
expect([...view.querySelectorAll('[data-stacked-bar]')].map((bar) => bar.getAttribute("data-x")))
  .toEqual(["2", "10", "50"]);
expect(view.querySelectorAll('[data-bar-segment="capacitive"]')).toHaveLength(3);
expect(view.querySelectorAll('[data-bar-segment="diffusion"]')).toHaveLength(3);
expect(view.textContent).toContain("75.95%");
expect(view.textContent).toContain("24.05%");
expect(view.querySelector('[data-export-id="cv-contribution-chart"]')).not.toBeNull();
```

Assert each bar's numeric segment values sum to 100 within `1e-8`, a segment below 7% receives `data-label-placement="external"`, ordinary segments receive `inside`, and the SVG accessible name contains the localized title.

- [ ] **Step 2: Run the component test and verify red**

```powershell
pnpm exec vitest run tests/scientific-stacked-bar-chart.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the focused SVG component**

Use a fixed 0–100 y-domain and categorical x positions. Sort a copied data array numerically; never mutate props. Normalize only floating-point sum drift:

```ts
const total = datum.lower + datum.upper;
if (!Number.isFinite(total) || total <= 0) return null;
const lower = 100 * datum.lower / total;
const upper = 100 - lower;
```

Render each segment as a `<rect>` with `data-bar-segment`, and each value as `<text>` formatted with `toFixed(2) + "%"`. Place values internally when the segment height is at least 7%; otherwise place them next to the segment boundary with a short `<line>` leader. Include `<title>`, optional `<desc>`, legend swatches, 0/25/50/75/100 ticks, actual scan-rate category labels, and `data-export-id` on the SVG.

- [ ] **Step 4: Integrate the chart on the CV page**

Import `ScientificStackedBarChart`, replace the contribution `ScientificLineChart`, and pass:

```tsx
<ScientificStackedBarChart
  title={t("cv.dunn.contributionChart")}
  xLabel={`${t("cv.table.scanRate")} (mV/s)`}
  yLabel="%"
  emptyLabel={t("cv.chart.empty")}
  legendLabel={t("cv.chart.legend")}
  lowerLabel={t("cv.dunn.capacitive")}
  upperLabel={t("cv.dunn.diffusion")}
  lowerColor="#e07a5f"
  upperColor="#3d405b"
  data={sortedContributions.map((item) => ({
    id: String(item.scanRate),
    x: item.scanRate,
    lower: item.capacitivePercent,
    upper: item.diffusionPercent
  }))}
  exportId="cv-contribution-chart"
  metadata={chartMetadata}
/>
```

Delete `makeContributionChart` and the unused sampled line series. Do not change the result `DataTable`, its headers, rows, or copy toolbar.
Change figure availability for `cv-contribution-chart` from `hasChartPoints(contributionChart)` to `sortedContributions.length > 0`, so existing SVG/PNG export buttons remain enabled after the line series is removed.

- [ ] **Step 5: Add responsive styling**

Reuse `.scientific-chart-shell` and add a dedicated SVG class. Set its minimum width from a CSS custom property computed as `max(560px, 52px * barCount + chart margins)`. Keep horizontal overflow on the shell. Do not change the mobile layout of other charts.

- [ ] **Step 6: Run component and page tests**

```powershell
pnpm exec vitest run tests/scientific-stacked-bar-chart.test.tsx tests/cv-page.test.tsx tests/scientific-chart.test.tsx tests/tool-export.test.ts
```

Expected: all files PASS; current line-chart and export behavior remains intact.

- [ ] **Step 7: Commit Task 4**

```powershell
git add src/components/ScientificStackedBarChart.tsx src/pages/CvKineticsPage.tsx src/styles/global.css tests/scientific-stacked-bar-chart.test.tsx tests/cv-page.test.tsx
git commit -m "feat: show labeled Dunn contribution bars"
```

---

### Task 5: Real-Data Regression and Visual Verification

**Files:**
- Modify only if a failing regression reveals an in-scope defect in files from Tasks 1–4.
- Do not commit absolute local paths or user datasets.

**Interfaces:**
- Consumes the public import and `analyzeCvWorkflow` paths already exercised by the application.
- Produces verification evidence for NCP CSV/XLSX and combined BP150 data without adding production behavior.

- [ ] **Step 1: Run the portable NCP/BP150 regression suite**

```powershell
pnpm exec vitest run tests/cv-workflow.test.ts tests/cv-page.test.tsx
```

Expected: NCP and BP150 threshold/weighted cases PASS, including noisy 51/501 density stability.

- [ ] **Step 2: Run local original-file checks**

Use temporary Vitest coverage that imports these files through the same parser/workflow path, then remove the temporary test before committing:

- `C:\Users\ThinkPad\Downloads\NCP-CV——1.csv`
- `C:\Users\ThinkPad\Downloads\NCP-CV——1.xlsx`
- `D:\codex_communication\BP150-combined-XYXYXY.csv`

For each file, run threshold mode at 0.95 and weighted mode. Assert analysis returns contributions for all scan rates, all g values are bounded, exact shared-g multiplication holds, percentages sum to 100, and the original loop/turning-point path remains complete.

Create `tests/cv-real-files.local.test.ts` with this concrete harness:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { confirmCvSeries, parseCvFile } from "../src/lib/cvParsing";
import { analyzeCvWorkflow } from "../src/lib/cvWorkflow";

const readBinary = readFile as unknown as (path: string) => Promise<Uint8Array>;
const cases = [
  ["NCP CSV", "C:\\Users\\ThinkPad\\Downloads\\NCP-CV——1.csv", [50, 20, 10, 5, 2]],
  ["NCP XLSX", "C:\\Users\\ThinkPad\\Downloads\\NCP-CV——1.xlsx", [50, 20, 10, 5, 2]],
  ["BP150", "D:\\codex_communication\\BP150-combined-XYXYXY.csv", [0.2, 0.4, 0.6, 0.8, 1]]
] as const;

describe.each(cases)("%s real-data regression", (_name, path, fallbackRates) => {
  it.each(["threshold", "weighted"] as const)("runs %s mode", async (dunnConfidenceMode) => {
    const bytes = await readBinary(path);
    const file = new File([bytes], path.split(/[\\/]/).at(-1)!);
    const table = await parseCvFile(file, {
      layout: "pairedPotentialCurrent",
      headerMode: "header"
    });
    const inferredRates = table.currentColumns.map((column) => column.inferredScanRate);
    const scanRates = inferredRates.every((rate) => rate !== null)
      ? inferredRates as number[]
      : [...fallbackRates];
    const series = confirmCvSeries(table, scanRates);
    const result = analyzeCvWorkflow(series, {
      potentialInterval: { mode: "auto" },
      rSquaredThreshold: 0.95,
      dunnConfidenceMode,
      turningPointTrim: { mode: "auto" }
    });
    expect(result.contributions).toHaveLength(series.length);
    result.contributions.forEach((contribution) => {
      expect(contribution.g.every((g) => Number.isFinite(g) && g >= 0 && g <= 1)).toBe(true);
      contribution.capacitiveForward.forEach((current, index) => {
        expect(current).toBeCloseTo(contribution.g[index]! * contribution.originalForward[index]!, 10);
      });
      contribution.capacitiveReverse.forEach((current, index) => {
        expect(current).toBeCloseTo(contribution.g[index]! * contribution.originalReverse[index]!, 10);
      });
      expect(contribution.capacitivePercent + contribution.diffusionPercent).toBeCloseTo(100, 8);
      expect(contribution.plotPath.length).toBeGreaterThanOrEqual(3);
    });
  });
});
```

Run:

```powershell
pnpm exec vitest run tests/cv-real-files.local.test.ts
```

Expected: all available NCP CSV, NCP XLSX, and BP150 cases PASS. Delete `tests/cv-real-files.local.test.ts` with `apply_patch` immediately afterward and confirm `git status --short` does not list it.

- [ ] **Step 3: Visually inspect NCP and BP150 plots**

Start the local site:

```powershell
pnpm run dev -- --port 4173
```

Open `/tools/cv-kinetics`, import each regression dataset, run threshold 0.95 and weighted modes, and capture the Dunn result and contribution chart. Confirm:

- smooth global inner capacitive boundaries without small dents or ripples;
- measured morphology and both forward/reverse branches remain visible;
- no sign reversal or overshoot;
- original turning points are restored;
- stacked bars and two-decimal contribution labels remain readable on desktop and mobile widths.

- [ ] **Step 4: Fix only demonstrated in-scope failures using red-green TDD**

If a real-data or visual check fails, first add the smallest portable failing regression to the relevant existing test file, run it red, modify only the stabilization/optimizer/chart files in scope, then rerun it green. Do not tune by dataset filename and do not weaken bounds, optimality, or grid-density tolerances.

- [ ] **Step 5: Commit any regression-only correction**

If Step 4 changed tracked files:

```powershell
git add src tests
git commit -m "fix: harden Dunn real-data reconstruction"
```

If no tracked files changed, do not create an empty commit.

---

### Task 6: Full Verification and Feature-Branch Deployment

**Files:**
- No planned production changes.

**Interfaces:**
- Consumes the completed branch.
- Produces a verified GitHub Pages deployment without merging.

- [ ] **Step 1: Run repository-wide verification**

```powershell
pnpm test
pnpm exec tsc -- --noEmit
pnpm build
git diff --check
git status --short
```

Expected: all tests pass, TypeScript exits 0, Vite production build succeeds, diff check is clean, and the worktree contains no unintended files.

- [ ] **Step 2: Run an independent whole-branch review**

Review the net implementation diff from `37670bcf` to `HEAD` against the approved design. Resolve every Critical or Important finding with a failing test, implementation fix, rerun, and commit. Minor findings may be documented if they do not affect the approved behavior.

- [ ] **Step 3: Push only the feature branch**

```powershell
git push origin fix-dunn-literature-plot
```

Expected: the remote feature branch advances to the verified local HEAD. Do not merge to `main`.

- [ ] **Step 4: Dispatch the existing Pages workflow from the feature branch**

Use the repository's existing `deploy-pages.yml` workflow with `--ref fix-dunn-literature-plot`. If the `github-pages` environment temporarily requires an exact branch deployment policy, add only this feature branch, dispatch and wait for success, then remove that temporary policy so the environment returns to its original `main`-only state.

```powershell
gh workflow run deploy-pages.yml --ref fix-dunn-literature-plot
gh run list --workflow deploy-pages.yml --branch fix-dunn-literature-plot --limit 1
```

Expected: the newest feature-branch workflow completes successfully.

- [ ] **Step 5: Verify production behavior**

Open `https://tmccdb.org/tools/cv-kinetics` with a cache-busting query. Confirm the deployed asset hash changed to the new build, the approved advanced Dunn introduction is present, NCP analysis produces smooth bounded full-loop results, and the contribution chart is a labeled 100% stacked bar chart. Switch English/Chinese once to confirm the existing language behavior still works.

- [ ] **Step 6: Record final status**

Report only the implemented stabilization, stacked bar chart, NCP/BP150 verification results, test/build counts, deployment workflow URL, and deployed commit. Explicitly state that no merge occurred.
