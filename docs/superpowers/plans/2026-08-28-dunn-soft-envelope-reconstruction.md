# Dunn Soft-Envelope Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace branch-wise hard envelope projection with a deterministic shared-`g(V)` soft-envelope refinement that preserves morphology while keeping sign, magnitude, plotting, integration, and export data consistent.

**Architecture:** Keep `optimizeSharedFraction` as the R²-guided baseline generator `g0(V)`. Add a second projected-gradient solver in `cvDunnReconstruction.ts` whose positive objective combines fidelity to `g0`, normalized-potential second-order smoothness, and a scale-normalized squared-hinge envelope penalty. Pass both baseline and refined results into `cvDunnQuality.ts`, remove pointwise branch projection from the final path, and build aligned/native records only as `g(V) * i_raw(V)`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing PCHIP interpolation and projected-gradient utilities.

## Global Constraints

- Work only on `fix-dunn-literature-plot`; do not merge `main` automatically.
- Preserve one shared `g(V)` for forward and reverse branches.
- Preserve `0 <= g(V) <= 1`, current sign, and `abs(i_cap) <= abs(i_raw)`.
- Do not independently smooth or fit capacitive current branches.
- Envelope containment is a soft objective; controlled residual is diagnostic rather than an automatic failure.
- Use normalized potential coordinates for second-order smoothness.
- Use the same final reconstruction for chart lines, shaded polygons, integration, contribution percentages, clipboard data, and CSV export.
- Keep all visible English/Chinese text in the centralized locale resources.
- Do not change import, b-value, peak-analysis, or unrelated layout behavior.

---

### Task 1: Add the shared-`g` soft-envelope optimizer

**Files:**
- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvDunnReconstruction.ts`
- Test: `tests/cv-dunn-reconstruction.test.ts`

**Interfaces:**
- Consumes: `g0: number[]`, `potentials: number[]`, `forwardCurrents: number[]`, `reverseCurrents: number[]`, and the baseline effective smoothness `lambda`.
- Produces: `refineSharedFractionWithSoftEnvelope(input): DunnSoftEnvelopeResult` with `baselineG`, refined `g`, and solver diagnostics.

- [ ] **Step 1: Write failing optimizer tests**

Add tests that request the public API before it exists:

```ts
import {
  envelopePenalty,
  refineSharedFractionWithSoftEnvelope,
  secondDifferenceRoughness
} from "../src/lib/cvDunnReconstruction";

it("softly corrects same-sign envelope violations without forcing a hard boundary", () => {
  const result = refineSharedFractionWithSoftEnvelope({
    baselineG: [0.7, 0.7, 0.7, 0.7, 0.7],
    potentials: [0, 0.25, 0.5, 0.75, 1],
    forwardCurrents: [-45, -44, -43, -42, -41],
    reverseCurrents: [-84, -80, -76, -72, -68],
    baselineLambda: 1e-4
  });

  expect(result.g.every((value) => value > 0.7 && value < 1)).toBe(true);
  expect(result.g.every((value, index) =>
    result.g[index] * -45 !== -45
  )).toBe(true);
  expect(result.diagnostics.maximumSharedFractionAdjustment).toBeGreaterThan(0);
});

it("uses a tolerance dead zone and a quadratic envelope penalty", () => {
  const tolerance = 1e-10;
  expect(envelopePenalty(2 + tolerance / 2, 1, 2, tolerance)).toBe(0);
  const small = envelopePenalty(2.1, 1, 2, tolerance);
  const large = envelopePenalty(2.2, 1, 2, tolerance);
  expect(large).toBeCloseTo(4 * small, 8);
});

it("keeps soft-envelope smoothing stable across potential-grid density", () => {
  const solve = (count: number) => {
    const potentials = Array.from({ length: count }, (_, index) => index / (count - 1));
    const baselineG = potentials.map((x) => 0.55 + 0.08 * Math.sin(2 * Math.PI * x));
    return refineSharedFractionWithSoftEnvelope({
      baselineG,
      potentials,
      forwardCurrents: potentials.map((x) => -2 - x),
      reverseCurrents: potentials.map((x) => -4 - x),
      baselineLambda: 1e-4
    }).g;
  };
  const coarse = solve(51);
  const dense = solve(501);
  for (const position of [0, 0.25, 0.5, 0.75, 1]) {
    expect(Math.abs(sampleNormalized(coarse, position) - sampleNormalized(dense, position))).toBeLessThan(0.02);
  }
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node node_modules/vitest/vitest.mjs run tests/cv-dunn-reconstruction.test.ts
```

Expected: FAIL because `refineSharedFractionWithSoftEnvelope` and `envelopePenalty` are not exported.

- [ ] **Step 3: Add result types and the minimal optimizer**

Add to `cvTypes.ts`:

```ts
export interface DunnSoftEnvelopeDiagnostics {
  fidelityWeight: number;
  smoothnessLambda: number;
  envelopeLambda: number;
  envelopeTolerance: number;
  iterations: number;
  converged: boolean;
  optimalityResidual: number;
  fidelity: number;
  roughness: number;
  envelopePenalty: number;
  maximumSharedFractionAdjustment: number;
}

export interface DunnSoftEnvelopeResult {
  baselineG: number[];
  g: number[];
  diagnostics: DunnSoftEnvelopeDiagnostics;
}
```

Implement and export:

```ts
export interface DunnSoftEnvelopeInput {
  baselineG: number[];
  potentials: number[];
  forwardCurrents: number[];
  reverseCurrents: number[];
  baselineLambda: number;
}

export function envelopePenalty(
  current: number,
  lower: number,
  upper: number,
  tolerance: number
): number {
  const upperViolation = Math.max(0, current - upper - tolerance);
  const lowerViolation = Math.max(0, lower - current - tolerance);
  return upperViolation ** 2 + lowerViolation ** 2;
}
```

Use named constants:

```ts
const SOFT_ENVELOPE_FIDELITY_WEIGHT = 1;
const SOFT_ENVELOPE_SMOOTHNESS_RATIO = 0.1;
const SOFT_ENVELOPE_LAMBDA = 8;
const SOFT_ENVELOPE_TOLERANCE_SCALE = 1e-10;
```

Normalize currents by `max(1, ...abs(forward), ...abs(reverse))`, divide fidelity and envelope sums by point count, and reuse `makeSecondDifferenceOperator(normalizePotentialGrid(potentials))`. Initialize from `baselineG`. Use projected accelerated gradient with monotone backtracking, hard projection only to `[0, 1]`, and the existing `OPTIMALITY_TOLERANCE`/`MAX_ITERATIONS`. Set `smoothnessLambda = max(1e-10, 0.1 * baselineLambda)`.

The envelope gradient for each normalized branch current `raw` is:

```ts
const reconstructed = g[index] * raw;
if (reconstructed > upper + tolerance) {
  gradient[index] += scale * (reconstructed - upper - tolerance) * raw;
}
if (reconstructed < lower - tolerance) {
  gradient[index] += scale * (reconstructed - lower + tolerance) * raw;
}
```

where `scale = 2 * envelopeLambda / pointCount`. Include both forward and reverse branches. Validate finite equal-length arrays, strictly increasing potentials, positive finite `baselineLambda`, bounded `baselineG`, and solver convergence.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same Vitest command. Expected: all `cv-dunn-reconstruction` tests pass, including the existing production-size performance test.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/lib/cvTypes.ts src/lib/cvDunnReconstruction.ts tests/cv-dunn-reconstruction.test.ts
git commit -m "feat: add Dunn soft-envelope shared fraction refinement"
```

---

### Task 2: Replace hard projection with the canonical refined shared fraction

**Files:**
- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvWorkflow.ts`
- Modify: `src/lib/cvDunnQuality.ts`
- Test: `tests/cv-dunn-quality.test.ts`
- Test: `tests/cv-workflow.test.ts`

**Interfaces:**
- Consumes: Task 1 `DunnSoftEnvelopeResult`.
- Produces: every aligned/native capacitive current as `refined.g(V) * originalCurrent` with one canonical fraction.

- [ ] **Step 1: Write failing reconstruction tests**

Add assertions that fail under the current projection:

```ts
it("uses exactly one refined fraction for both same-sign branches", () => {
  const contribution = reconstructDunnContribution(makeSoftEnvelopeContributionInput());
  contribution.g.forEach((fraction, index) => {
    expect(contribution.capacitiveForward[index]).toBeCloseTo(
      fraction * contribution.originalForward[index], 12
    );
    expect(contribution.capacitiveReverse[index]).toBeCloseTo(
      fraction * contribution.originalReverse[index], 12
    );
  });
  expect(contribution.g.some((fraction) => fraction < 1)).toBe(true);
});

it("uses the same refined fraction in original-order records", () => {
  const contribution = reconstructDunnContribution(makeSoftEnvelopeContributionInput());
  for (const record of contribution.plotPath.filter((point) => !point.synthetic)) {
    expect(record.capacitiveCurrent).toBeCloseTo(record.g * record.originalCurrent, 12);
    expect(record.effectiveFraction).toBeCloseTo(record.g, 12);
    expect(record.correctionMagnitude).toBe(0);
  }
});
```

Extend the NCP/BP150 workflow table test to assert, for every scan rate and every aligned/native point, shared-fraction identity, sign preservation, magnitude containment, finite envelope residuals, and restored original turning points.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node node_modules/vitest/vitest.mjs run tests/cv-dunn-quality.test.ts tests/cv-workflow.test.ts
```

Expected: FAIL because the current path independently projects each branch and the workflow does not yet create a soft-envelope result.

- [ ] **Step 3: Wire the soft optimizer into the workflow**

In `cvWorkflow.ts`, after `optimizeSharedFraction`, call:

```ts
const refined = refineSharedFractionWithSoftEnvelope({
  baselineG: optimized.g,
  potentials: alignedGrid.potentials,
  forwardCurrents: alignedGrid.forwardCurrents[seriesIndex],
  reverseCurrents: alignedGrid.reverseCurrents[seriesIndex],
  baselineLambda: optimized.diagnostics.lambda
});
```

Add `refined: DunnSoftEnvelopeResult` to `DunnContributionInput` and pass it to `reconstructDunnContribution`.

- [ ] **Step 4: Remove hard projection from final reconstruction**

In `cvDunnQuality.ts`:

- preserve `projectCapacitiveToEnvelope` only if legacy unit tests or diagnostics still need the standalone helper; do not call it from production reconstruction;
- set `g = [...input.refined.g]`;
- call `reconstructBranchCurrents(originalForward, g)` and `reconstructBranchCurrents(originalReverse, g)`;
- change `makeOrderedRecord` to use `capacitiveCurrent = cleanZero(fraction * point.current)`;
- set `targetCapacitiveCurrent` to the baseline `g0(V) * point.current` evaluated by PCHIP;
- set `effectiveFraction = fraction` and `correctionMagnitude = abs(capacitiveCurrent - targetCapacitiveCurrent)`;
- calculate envelope bounds only for residual measurement, not projection;
- keep synthetic zero crossings at zero and interpolate both baseline and refined fractions consistently.

Remove envelope residual as a hard failure from `validateDunnContribution`. Retain hard validation of finite values, `g` bounds, reconstruction identity, sign, magnitude containment, solver convergence, and array/grid consistency.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Task 2 test command. Expected: all focused tests pass for synthetic, NCP, and BP150 fixtures.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/lib/cvTypes.ts src/lib/cvWorkflow.ts src/lib/cvDunnQuality.ts tests/cv-dunn-quality.test.ts tests/cv-workflow.test.ts
git commit -m "fix: replace Dunn hard clipping with shared soft reconstruction"
```

---

### Task 3: Align diagnostics, UI, and exports with soft reconstruction

**Files:**
- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvDunnQuality.ts`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Test: `tests/cv-page.test.tsx`

**Interfaces:**
- Consumes: Task 2 canonical `DunnContribution` and soft solver diagnostics.
- Produces: bilingual UI and CSV metadata that distinguish fraction adjustment from residual envelope crossing.

- [ ] **Step 1: Write failing page/export tests**

Update tests to require:

```ts
expect(view.querySelector('[data-dunn-envelope-diagnostics="true"]')?.textContent)
  .toContain("Shared g(V) adjustment");
expect(view.querySelector('[data-dunn-envelope-diagnostics="true"]')?.textContent)
  .toContain("Residual envelope crossing");
expect(exportedCapacitiveCsv).toContain("Maximum shared g(V) adjustment");
expect(exportedCapacitiveCsv).toContain("Envelope residual points");
```

Also parse exported ordered rows and compare each `g(V)`, capacitive current, and diffusion current point-for-point with `selectedContribution.plotPath`. Keep the existing chart/polygon/area consistency assertions.

- [ ] **Step 2: Run the page test and verify RED**

```powershell
node node_modules/vitest/vitest.mjs run tests/cv-page.test.tsx
```

Expected: FAIL because the current labels describe hard envelope correction and the new diagnostics are absent.

- [ ] **Step 3: Update diagnostics and bilingual labels**

Add `DunnDiagnostics` fields:

```ts
softEnvelopeTolerance: number;
softEnvelopeIterations: number;
softEnvelopeConverged: boolean;
softEnvelopeOptimalityResidual: number;
maximumSharedFractionAdjustment: number;
envelopeResidualPointCount: number;
envelopeResidualPointPercent: number;
```

Populate them from `input.refined.diagnostics` and residual measurement of the canonical `plotPath`. Keep old CSV columns only when needed for backward compatibility; redefine `Envelope correction magnitude` as the difference from the baseline `g0` current, never as a branch-wise projection.

Use stable locale keys:

```ts
"cv.dunn.sharedFractionAdjustment"
"cv.dunn.envelopeResidual"
"cv.dunn.envelopeResidualPoints"
"cv.export.maximumSharedFractionAdjustment"
"cv.export.envelopeResidualPoints"
```

English wording: `Shared g(V) adjustment`, `Residual envelope crossing`, `Envelope residual points`.

Chinese wording: `共享 g(V) 调整`, `残余包络越界`, `包络残余点`.

- [ ] **Step 4: Make all consumers use the canonical records**

Confirm `makeDunnChart`, `makeDunnPolygons`, `makeDunnAreas`, `dunnRows`, contribution percentages, clipboard selection, and both ordered CSV exports read `selectedContribution.plotPath` without current recomputation. Do not add display smoothing.

- [ ] **Step 5: Run the page test and verify GREEN**

Run the Task 3 test command. Expected: all page tests pass in English and Chinese.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/lib/cvTypes.ts src/lib/cvDunnQuality.ts src/pages/CvKineticsPage.tsx src/locales/en.ts src/locales/zh.ts tests/cv-page.test.tsx
git commit -m "feat: report Dunn soft-envelope diagnostics"
```

---

### Task 4: Regression, visual verification, and deployment readiness

**Files:**
- Modify only if a failing regression exposes a scoped defect.
- Test: `tests/cv-workflow.test.ts`
- Test: `tests/cv-page.test.tsx`

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: fresh evidence that the requested behavior works and unrelated site behavior remains intact.

- [ ] **Step 1: Run focused scientific regressions**

```powershell
node node_modules/vitest/vitest.mjs run tests/cv-dunn-reconstruction.test.ts tests/cv-dunn-quality.test.ts tests/cv-workflow.test.ts tests/cv-page.test.tsx
```

Expected: all focused tests pass. For NCP and BP150 at every rate, log/assert:

- finite bounded refined `g`;
- `i_cap = g * i_raw` for both branches;
- zero sign/magnitude overshoot within tolerance;
- finite envelope residual diagnostics;
- nonzero but bounded adjustment from `g0` in same-sign regions;
- no hard-boundary flattening fixture regression;
- preserved turning-point endpoints and full ordered potential range.

- [ ] **Step 2: Run the complete test suite**

```powershell
node node_modules/vitest/vitest.mjs run
```

Expected: zero failing test files and zero failing tests.

- [ ] **Step 3: Run the production build**

```powershell
node node_modules/typescript/bin/tsc
node node_modules/vite/bin/vite.js build
node scripts/create-route-entries.mjs
```

Expected: exit code 0 and generated CV route assets in `dist`.

- [ ] **Step 4: Perform browser visual verification**

Load the production preview and import the NCP regression dataset. Verify at low and high scan rates:

- the capacitive boundary is smooth and no longer pinned point-by-point to the measured branch;
- the full CV range and turning points remain present;
- the chart, contribution percentage, data table, and export values agree;
- desktop and mobile layouts remain unchanged outside the Dunn diagnostics text;
- English and Chinese diagnostic labels switch correctly.

Repeat the scientific reconstruction checks for BP150 even if only one dataset is shown in the browser.

- [ ] **Step 5: Review diff and commit any test-only fixture updates**

```powershell
git diff --check
git status --short
git diff --stat
```

If Task 4 required no source changes, do not create an empty commit. If fixture assertions changed, commit only those scoped changes:

```powershell
git add tests/cv-workflow.test.ts tests/cv-page.test.tsx
git commit -m "test: verify Dunn soft-envelope regressions"
```

- [ ] **Step 6: Deploy only after explicit authorization**

Push `fix-dunn-literature-plot` and deploy GitHub Pages from that branch using the previously approved temporary branch-policy procedure. Verify the live CV asset hash, then restore both the workflow trigger and `github-pages` environment policy to `main` only. Do not merge `main`.
