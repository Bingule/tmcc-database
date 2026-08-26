# Dunn R²-Guided Constrained Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragmented row-sampled Dunn contribution output with branch-normalized PCHIP interpolation and a confidence-weighted, explicitly regularized, bounded shared `g(V)` reconstruction while preserving both Dunn R² modes and existing b-value threshold behavior.

**Architecture:** Keep parsing and page infrastructure, but insert focused numerical modules between confirmed `CvSeries` input and UI output. Normalize every complete loop into logical increasing/decreasing branches, align them on a common PCHIP grid, run branch-separated Dunn fits, derive branch confidence, optimize one bounded shared `g(V)` per target rate, validate it, and adapt the existing workflow/plot/export layers to consume continuous results.

**Tech Stack:** React 19, TypeScript 5.7 strict mode, Vite 5, Vitest 2/jsdom, existing `linearRegression`, existing `read-excel-file`; no new runtime dependencies.

## Global Constraints

- Work only in the existing `fix-dunn-literature-plot` worktree until verification is complete.
- Keep one production upload file using existing XYYYYY or XYXYXY layouts; do not add multi-file upload.
- Use PCHIP separately for logical forward/increasing and reverse/decreasing branches; never interpolate by row index or extrapolate Dunn fits.
- Remove “Point interval / 取点间隔” and add Auto/manual potential interval in mV.
- Preserve the existing b-value R²-threshold classification/filtering in both Dunn modes.
- Dunn threshold mode uses default editable threshold `0.95` as trusted-anchor confidence; it does not delete low-R² Dunn regions.
- Dunn weighted mode uses continuous positive R² confidence without a hard Dunn cutoff.
- Optimize one shared `g(V)` with both a confidence-weighted fidelity term and an explicit second-difference smoothness term.
- Enforce `0 <= g(V) <= 1`, sign preservation, and `abs(i_cap) <= abs(i_CV)`.
- Smooth/regularize `g(V)`, never the forward/reverse current curves independently.
- Preserve true turning samples, original sequence, and separately recorded turning currents; never average opposite sweep currents.
- Keep existing CSV/TXT/XLSX import, bilingual support, tables, CSV exports, SVG/PNG exports, and unrelated pages working.
- Do not hard-code scan rates, voltage windows, 2 mV grids, 5 mV trims, dataset names, or expected percentages.
- Do not deploy unless focused tests, full tests, TypeScript, production build, real-data checks, and browser checks pass.

---

## File Structure

### New numerical modules

- `src/lib/cvInterpolation.ts` — robust native interval, common range, PCHIP, aligned logical branch grids.
- `src/lib/cvDunnFit.ts` — Auto/manual trim and branch-separated standard Dunn fits.
- `src/lib/cvDunnConfidence.ts` — local fractions and threshold/weighted R² confidence.
- `src/lib/cvDunnReconstruction.ts` — adaptive regularization and bounded projected optimization of shared `g(V)`.
- `src/lib/cvDunnQuality.ts` — endpoint/path reconstruction, magnitude integration, diagnostics, warnings, validation.

### Existing modules to modify

- `src/lib/cvTypes.ts` — approved settings, normalized-cycle, aligned-grid, reconstruction, diagnostic types.
- `src/lib/cvCycle.ts` — complete-loop selection and cyclic-seam normalization.
- `src/lib/cvAnalysis.ts` — retain b-value compatibility helpers and delegate new Dunn calculations.
- `src/lib/cvWorkflow.ts` — orchestrate new grid, fits, confidence, reconstruction, quality, and old b filtering.
- `src/components/CvImportPanel.tsx` — replace point interval with potential interval and add compact Dunn controls.
- `src/pages/CvKineticsPage.tsx` — render diagnostics, continuous areas, updated tables, warnings, and exports.
- `src/components/ScientificLineChart.tsx` — only minimal area/boundary support needed by continuous inner-loop rendering.
- `src/locales/en.ts`, `src/locales/zh.ts` — all new UI, help, diagnostic, warning, error, and export text.
- `src/styles/global.css` — compact responsive controls, diagnostics, warning, and balanced plot/result layout.

### Tests and fixtures

- `tests/cv-cycle.test.ts` — cycle selection and seam normalization.
- `tests/cv-interpolation.test.ts` — interval resolution and PCHIP.
- `tests/cv-dunn-fit.test.ts` — trim and known Dunn coefficients.
- `tests/cv-dunn-confidence.test.ts` — local fractions and both R² modes.
- `tests/cv-dunn-reconstruction.test.ts` — explicit regularizer, constraints, adaptive smoothing.
- `tests/cv-dunn-quality.test.ts` — endpoint paths, validation, contribution integration, warnings.
- `tests/fixtures/cvRegressionData.ts` — deterministic NCP-like, BP150-derived, and synthetic data builders without large binary fixtures.
- Modify `tests/cv-workflow.test.ts`, `tests/cv-analysis.test.ts`, `tests/cv-page.test.tsx`, `tests/tools-markup.test.tsx`, `tests/scientific-chart.test.tsx`.

---

### Task 0: Baseline and Confidence Gate

**Files:**
- Read: `docs/superpowers/specs/2026-08-26-dunn-r2-guided-constrained-reconstruction-design.md`
- Read: current CV modules and tests listed above
- No production edits

**Interfaces:**
- Consumes: approved design and clean branch `e94afed6`
- Produces: recorded baseline results and implementation confidence at least 90%

- [ ] **Step 1: Confirm branch and duplicate scope**

Run:

```powershell
git status --short --branch
rg -n "pointInterval|interpolateCommonGrid|attemptDunnFits|integrateDunnContributions|makeDunnAreas" src tests
```

Expected: clean `fix-dunn-literature-plot` branch; existing implementations found only in the known CV files and tests.

- [ ] **Step 2: Run the existing focused baseline**

Run:

```powershell
pnpm exec vitest run tests/cv-analysis.test.ts tests/cv-workflow.test.ts tests/cv-parsing.test.ts tests/cv-page.test.tsx
```

Expected: all existing focused tests pass before changes.

- [ ] **Step 3: Run the Confidence Check skill**

Record evidence for:

```text
Duplicate check: existing cycle/interpolation/Dunn locations mapped.
Architecture: new modules follow the approved spec and reuse parsing/export/chart infrastructure.
Official/primary references: Fritsch–Carlson/Fritsch–Butland PCHIP and Eilers penalized least squares.
Root cause: seam fragments are not normalized; low-R² Dunn fits are nulled; no shared bounded regularized g(V).
Readiness threshold: >= 90%.
```

Expected: confidence at least 90%. Stop before Task 1 if lower.

---

### Task 1: Complete-Cycle Selection and Logical Branch Normalization

**Files:**
- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvCycle.ts`
- Create: `tests/cv-cycle.test.ts`

**Interfaces:**
- Consumes: `CvSeries["points"]`
- Produces:

```ts
export type CvBranchKind = "forward" | "reverse";

export interface NormalizedCvBranch {
  kind: CvBranchKind;
  direction: 1 | -1;
  points: CvSweepPoint[];
}

export interface NormalizedCvCycle {
  originalPoints: CvSeries["points"];
  selectedStartIndex: number;
  selectedEndIndex: number;
  ignoredPointCount: number;
  nativePotentialInterval: number;
  forward: NormalizedCvBranch;
  reverse: NormalizedCvBranch;
  turningPotentials: number[];
}

export function normalizeCvCycle(points: CvSeries["points"]): NormalizedCvCycle;
export function normalizeAlignedCvCycles(series: CvSeries[]): NormalizedCvCycle[];
```

- [ ] **Step 1: Write failing one-turn, seam-start, and extra-partial tests**

Create `tests/cv-cycle.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { normalizeAlignedCvCycles, normalizeCvCycle } from "../src/lib/cvCycle";

const points = (potentials: number[]) => potentials.map((potential, index) => ({
  potential,
  current: index + 1
}));

describe("normalizeCvCycle", () => {
  it("normalizes an endpoint-started one-turn loop", () => {
    const cycle = normalizeCvCycle(points([-1, -0.5, 0, -0.5, -1]));
    expect(cycle.forward.points.map((p) => p.potential)).toEqual([-1, -0.5, 0]);
    expect(cycle.reverse.points.map((p) => p.potential)).toEqual([0, -0.5, -1]);
    expect(cycle.ignoredPointCount).toBe(0);
  });

  it("joins same-direction seam fragments into one logical branch", () => {
    const cycle = normalizeCvCycle(points([-0.5, 0, -0.5, -1, -0.75, -0.5]));
    expect(cycle.forward.points.map((p) => p.potential)).toEqual([-1, -0.75, -0.5, 0]);
    expect(cycle.reverse.points.map((p) => p.potential)).toEqual([0, -0.5, -1]);
    expect(cycle.originalPoints.map((p) => p.potential)).toEqual([-0.5, 0, -0.5, -1, -0.75, -0.5]);
  });

  it("ignores only an incomplete next cycle after closure", () => {
    const cycle = normalizeCvCycle(points([-1, -0.5, 0, -0.5, -1, -0.8, -0.6]));
    expect(cycle.selectedEndIndex).toBe(4);
    expect(cycle.ignoredPointCount).toBe(2);
  });

  it("retains double-recorded turning currents on opposite branches", () => {
    const input = [
      { potential: -1, current: -1 },
      { potential: 0, current: 3 },
      { potential: 0, current: 2 },
      { potential: -1, current: -2 }
    ];
    const cycle = normalizeCvCycle(input);
    expect(cycle.forward.points.at(-1)).toMatchObject({ potential: 0, current: 3 });
    expect(cycle.reverse.points[0]).toMatchObject({ potential: 0, current: 2 });
  });
});

describe("normalizeAlignedCvCycles", () => {
  it("accepts mixed one-turn and seam-started cycles with matching directions", () => {
    const cycles = normalizeAlignedCvCycles([
      { label: "2", scanRate: 2, points: points([-1, -0.5, 0, -0.5, -1]) },
      { label: "5", scanRate: 5, points: points([-0.5, 0, -0.5, -1, -0.5]) }
    ]);
    expect(cycles).toHaveLength(2);
    expect(cycles.every((cycle) => cycle.forward.direction === 1 && cycle.reverse.direction === -1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the cycle tests and verify failure**

Run:

```powershell
pnpm exec vitest run tests/cv-cycle.test.ts
```

Expected: FAIL because `normalizeCvCycle` and new types do not exist.

- [ ] **Step 3: Implement loop selection and normalization**

Add the interfaces above to `cvTypes.ts`. In `cvCycle.ts`, implement:

```ts
export function normalizeCvCycle(points: CvSeries["points"]): NormalizedCvCycle {
  validateFinitePoints(points);
  const nativePotentialInterval = robustNativeInterval(points);
  const span = potentialSpan(points);
  const directionTolerance = Math.max(Number.EPSILON * Math.max(1, span) * 32, nativePotentialInterval * 1e-6);
  const runs = directionRuns(points, directionTolerance);
  const selection = selectFirstClosedLoop(points, runs, nativePotentialInterval, span);
  const selected = points.slice(selection.startIndex, selection.endIndex + 1);
  const selectedRuns = directionRuns(selected, directionTolerance);
  const normalized = normalizeRunsAtCyclicSeam(selected, selectedRuns);
  return {
    originalPoints: selected.map((point) => ({ ...point })),
    selectedStartIndex: selection.startIndex,
    selectedEndIndex: selection.endIndex,
    ignoredPointCount: points.length - selection.endIndex - 1,
    nativePotentialInterval,
    forward: normalized.forward,
    reverse: normalized.reverse,
    turningPotentials: normalized.turningPotentials
  };
}
```

Implement helpers with these exact rules:

```ts
type DirectionRun = { direction: SweepDirection; startIndex: number; endIndex: number };

function closureTolerance(native: number, span: number) {
  return Math.min(Math.max(2.5 * native, 0.001 * span), 0.01 * span);
}

function joinSeamRuns(first: CvSweepPoint[], last: CvSweepPoint[]) {
  const joined = [...last, ...first];
  return joined.filter((point, index) => index === 0 || point.sourceIndex !== joined[index - 1].sourceIndex);
}
```

`selectFirstClosedLoop` must require both directions, accept one or two reversals, and choose the earliest post-reversal endpoint within `closureTolerance` of the start. `normalizeRunsAtCyclicSeam` must assign duplicated turning samples to their incoming/outgoing branches and sort the derived forward branch by increasing potential and reverse branch by decreasing potential without changing `sourceIndex`.

- [ ] **Step 4: Run cycle and existing cycle-related tests**

Run:

```powershell
pnpm exec vitest run tests/cv-cycle.test.ts tests/cv-analysis.test.ts tests/cv-parsing.test.ts
```

Expected: PASS. Existing parsing behavior remains intact.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/cvTypes.ts src/lib/cvCycle.ts tests/cv-cycle.test.ts
git commit -m "feat: normalize complete CV cycles"
```

---

### Task 2: PCHIP Branch Alignment and Potential Interval

**Files:**
- Create: `src/lib/cvInterpolation.ts`
- Create: `tests/cv-interpolation.test.ts`
- Modify: `src/lib/cvTypes.ts`

**Interfaces:**
- Consumes: `CvSeries[]`, `NormalizedCvCycle[]`, `PotentialIntervalSetting`
- Produces:

```ts
export type PotentialIntervalSetting =
  | { mode: "auto" }
  | { mode: "manual"; millivolts: number };

export interface CvAlignedBranchGrid {
  potentials: number[]; // ascending and shared by both directions
  scanRates: number[];
  forwardCurrents: number[][];
  reverseCurrents: number[][];
  commonMinimum: number;
  commonMaximum: number;
  nativePotentialInterval: number;
  resolvedPotentialInterval: number;
  cycles: NormalizedCvCycle[];
}

export function pchipInterpolate(x: number[], y: number[], query: number[]): number[];
export function alignCvBranches(
  series: CvSeries[],
  cycles: NormalizedCvCycle[],
  interval: PotentialIntervalSetting
): CvAlignedBranchGrid;
export function toSequentialGrid(grid: CvAlignedBranchGrid): InterpolatedCvData;
```

- [ ] **Step 1: Write failing PCHIP and grid tests**

Create tests covering exact nodes, no overshoot, no extrapolation, independent branch interpolation, and Auto/manual intervals:

```ts
import { describe, expect, it } from "vitest";
import { alignCvBranches, pchipInterpolate } from "../src/lib/cvInterpolation";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";

it("returns exact PCHIP node values and stays within local monotone bounds", () => {
  const values = pchipInterpolate([0, 1, 2, 3], [0, 2, 2.5, 4], [0, 0.5, 1, 1.5, 2, 2.5, 3]);
  expect(values[0]).toBe(0);
  expect(values[2]).toBe(2);
  expect(values[4]).toBe(2.5);
  expect(values[6]).toBe(4);
  expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...values)).toBeLessThanOrEqual(4);
});

it("rejects PCHIP extrapolation", () => {
  expect(() => pchipInterpolate([0, 1], [1, 2], [-0.01])).toThrow("noCommonPotentialRange");
});

it("uses a common Auto grid close to native resolution", () => {
  const series = [1, 4, 9].map((scanRate, rateIndex) => ({
    label: String(scanRate),
    scanRate,
    points: [-1, -0.5, 0, -0.5, -1].map((potential, index) => ({ potential, current: rateIndex + index }))
  }));
  const grid = alignCvBranches(series, normalizeAlignedCvCycles(series), { mode: "auto" });
  expect(grid.potentials).toEqual([-1, -0.5, 0]);
  expect(grid.resolvedPotentialInterval).toBeCloseTo(0.5, 12);
  expect(grid.forwardCurrents).toHaveLength(3);
  expect(grid.reverseCurrents).toHaveLength(3);
});

it("honors a finite manual interval in mV without row alignment", () => {
  const series = [
    { label: "1", scanRate: 1, points: [-1, -0.5, 0, -0.5, -1].map((potential) => ({ potential, current: potential + 1 })) },
    { label: "2", scanRate: 2, points: [-0.99, -0.49, -0.01, -0.51, -0.99].map((potential) => ({ potential, current: potential + 2 })) },
    { label: "4", scanRate: 4, points: [-0.98, -0.48, -0.02, -0.52, -0.98].map((potential) => ({ potential, current: potential + 4 })) }
  ];
  const grid = alignCvBranches(series, normalizeAlignedCvCycles(series), { mode: "manual", millivolts: 250 });
  expect(grid.commonMinimum).toBeCloseTo(-0.98, 12);
  expect(grid.commonMaximum).toBeCloseTo(-0.02, 12);
  expect(grid.potentials[0]).toBe(grid.commonMinimum);
  expect(grid.potentials.at(-1)).toBe(grid.commonMaximum);
  expect(grid.resolvedPotentialInterval).toBeLessThanOrEqual(0.25);
});
```

- [ ] **Step 2: Run interpolation tests and verify failure**

```powershell
pnpm exec vitest run tests/cv-interpolation.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement PCHIP and branch alignment**

Implement Fritsch–Butland weighted harmonic interior slopes:

```ts
if (deltaLeft === 0 || deltaRight === 0 || Math.sign(deltaLeft) !== Math.sign(deltaRight)) {
  derivative[index] = 0;
} else {
  const weight1 = 2 * widthRight + widthLeft;
  const weight2 = widthRight + 2 * widthLeft;
  derivative[index] = (weight1 + weight2) / (weight1 / deltaLeft + weight2 / deltaRight);
}
```

Use one-sided shape-preserving endpoint slopes and cubic Hermite basis:

```ts
const t = (queryX - x0) / h;
const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
const h10 = t ** 3 - 2 * t ** 2 + t;
const h01 = -2 * t ** 3 + 3 * t ** 2;
const h11 = t ** 3 - t ** 2;
return h00 * y0 + h10 * h * d0 + h01 * y1 + h11 * h * d1;
```

For Auto interval, take the median branch-native interval, choose `intervalCount = max(1, round(span / native))`, and set `resolved = span / intervalCount`. For manual, use `intervalCount = max(1, ceil(span / requestedVolts))`. Build exact endpoints with `minimum + index * resolved`. Reject non-finite/non-positive manual values.

- [ ] **Step 4: Run interpolation and focused compatibility tests**

```powershell
pnpm exec vitest run tests/cv-interpolation.test.ts tests/cv-cycle.test.ts tests/cv-analysis.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/cvTypes.ts src/lib/cvInterpolation.ts tests/cv-interpolation.test.ts
git commit -m "feat: align CV branches with PCHIP"
```

---

### Task 3: Branch-Separated Dunn Fitting and Turning Trim

**Files:**
- Create: `src/lib/cvDunnFit.ts`
- Create: `tests/cv-dunn-fit.test.ts`
- Modify: `src/lib/cvTypes.ts`

**Interfaces:**
- Consumes: `CvAlignedBranchGrid`, `TurningPointTrimSetting`
- Produces:

```ts
export type TurningPointTrimSetting =
  | { mode: "auto" }
  | { mode: "manual"; millivolts: number };

export type DunnFitStatus = CvFitStatus | "trimmed";

export interface DunnBranchFitRecord {
  branch: CvBranchKind;
  potential: number;
  fit: DunnPoint | null;
  status: DunnFitStatus;
  trimmed: boolean;
}

export interface DunnFitGrid {
  forward: DunnBranchFitRecord[];
  reverse: DunnBranchFitRecord[];
  resolvedTurningPointTrim: number;
}

export function resolveTurningPointTrim(grid: CvAlignedBranchGrid, setting: TurningPointTrimSetting): number;
export function fitDunnBranches(grid: CvAlignedBranchGrid, setting: TurningPointTrimSetting): DunnFitGrid;
```

- [ ] **Step 1: Write failing known-coefficient and trim tests**

```ts
import { expect, it } from "vitest";
import { fitDunnBranches, resolveTurningPointTrim } from "../src/lib/cvDunnFit";

it("recovers branch-specific Dunn coefficients at arbitrary scan rates", () => {
  const scanRates = [0.2, 0.6, 1.4, 3.1];
  const potentials = [-1, -0.5, 0];
  const make = (k1: number, k2: number) => scanRates.map((v) => potentials.map(() => k1 * v + k2 * Math.sqrt(v)));
  const result = fitDunnBranches({
    potentials,
    scanRates,
    forwardCurrents: make(2, 3),
    reverseCurrents: make(-1, 4),
    commonMinimum: -1,
    commonMaximum: 0,
    nativePotentialInterval: 0.5,
    resolvedPotentialInterval: 0.5,
    cycles: []
  }, { mode: "manual", millivolts: 0 });
  expect(result.forward[1].fit).toMatchObject({ k1: 2, k2: 3, rSquared: 1 });
  expect(result.forward[1].trimmed).toBe(false);
  expect(result.reverse[1].fit).toMatchObject({ k1: -1, k2: 4, rSquared: 1 });
  expect(result.reverse[1].trimmed).toBe(false);
});

it("uses max(3 native intervals, 0.5% span) before sensible bounds", () => {
  const trim = resolveTurningPointTrim({
    potentials: Array.from({ length: 1001 }, (_, index) => index / 1000),
    scanRates: [1, 2, 4], forwardCurrents: [], reverseCurrents: [],
    commonMinimum: 0, commonMaximum: 1,
    nativePotentialInterval: 0.001, resolvedPotentialInterval: 0.001, cycles: []
  }, { mode: "auto" });
  expect(trim).toBeCloseTo(0.005, 12);
});

it("marks reversal trim points without deleting them from the fit grid", () => {
  const scanRates = [1, 4, 9];
  const potentials = [0, 0.25, 0.5, 0.75, 1];
  const currents = scanRates.map((v) => potentials.map(() => 2 * v + 3 * Math.sqrt(v)));
  const result = fitDunnBranches({
    potentials, scanRates,
    forwardCurrents: currents, reverseCurrents: currents,
    commonMinimum: 0, commonMaximum: 1,
    nativePotentialInterval: 0.25, resolvedPotentialInterval: 0.25, cycles: []
  }, { mode: "manual", millivolts: 200 });
  expect(result.forward).toHaveLength(5);
  expect(result.reverse).toHaveLength(5);
  expect(result.forward[0]).toMatchObject({ trimmed: true, fit: null, status: "trimmed" });
  expect(result.forward[4]).toMatchObject({ trimmed: true, fit: null, status: "trimmed" });
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
pnpm exec vitest run tests/cv-dunn-fit.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement Auto/manual trim and fits**

Use:

```ts
const raw = Math.max(3 * grid.nativePotentialInterval, 0.005 * span);
const lower = 2 * grid.nativePotentialInterval;
const upper = Math.max(lower, Math.min(10 * grid.nativePotentialInterval, 0.02 * span));
return Math.min(Math.max(raw, lower), upper);
```

For every untrimmed branch/potential, regress `current / sqrt(v)` against `sqrt(v)` using the existing `linearRegression`. Preserve a record at every grid potential; trimmed records use `status: "trimmed"`, `trimmed: true`, and non-finite coefficient fields are represented through the project’s nullable fit-record pattern rather than silently becoming zero.

- [ ] **Step 4: Run fit and regression tests**

```powershell
pnpm exec vitest run tests/cv-dunn-fit.test.ts tests/regression.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/cvTypes.ts src/lib/cvDunnFit.ts tests/cv-dunn-fit.test.ts
git commit -m "feat: fit trimmed Dunn branches"
```

---

### Task 4: Local Fractions and Both R² Confidence Modes

**Files:**
- Create: `src/lib/cvDunnConfidence.ts`
- Create: `tests/cv-dunn-confidence.test.ts`
- Modify: `src/lib/cvTypes.ts`

**Interfaces:**
- Consumes: `DunnFitGrid`, target scan rate, mode, threshold
- Produces:

```ts
export type DunnConfidenceMode = "threshold" | "weighted";

export interface DunnFractionPoint {
  fraction: number | null;
  confidence: number;
  rSquared: number | null;
  trustedAnchor: boolean;
}

export interface DunnFractionGrid {
  forward: DunnFractionPoint[];
  reverse: DunnFractionPoint[];
}

export function localCapacitiveFraction(k1: number, k2: number, scanRate: number): number | null;
export function rSquaredConfidence(rSquared: number, mode: DunnConfidenceMode, threshold: number): number;
export function makeDunnFractionGrid(fits: DunnFitGrid, scanRate: number, mode: DunnConfidenceMode, threshold: number): DunnFractionGrid;
```

- [ ] **Step 1: Write failing fraction and confidence tests**

```ts
import { expect, it } from "vitest";
import { localCapacitiveFraction, rSquaredConfidence } from "../src/lib/cvDunnConfidence";

it("calculates and bounds the local Dunn fraction", () => {
  expect(localCapacitiveFraction(2, 3, 4)).toBeCloseTo(8 / 14, 12);
  expect(localCapacitiveFraction(2, -3, 4)).toBeCloseTo(8 / 14, 12);
  expect(localCapacitiveFraction(0, 0, 4)).toBeNull();
});

it("makes threshold anchors strong without deleting low R² fits", () => {
  expect(rSquaredConfidence(0.97, "threshold", 0.95)).toBeGreaterThanOrEqual(1);
  expect(rSquaredConfidence(0.5, "threshold", 0.95)).toBeGreaterThan(0);
  expect(rSquaredConfidence(0.5, "threshold", 0.95)).toBeLessThan(0.1);
});

it("uses continuous positive confidence in weighted mode", () => {
  const low = rSquaredConfidence(0.1, "weighted", 0.95);
  const mid = rSquaredConfidence(0.5, "weighted", 0.95);
  const high = rSquaredConfidence(0.9, "weighted", 0.95);
  expect(0).toBeLessThan(low);
  expect(low).toBeLessThan(mid);
  expect(mid).toBeLessThan(high);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
pnpm exec vitest run tests/cv-dunn-confidence.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic confidence mapping**

Use the same general mapping for all datasets:

```ts
const EPSILON_CONFIDENCE = 0.02;
const r = Math.min(1, Math.max(0, rSquared));
if (mode === "weighted") return EPSILON_CONFIDENCE + (1 - EPSILON_CONFIDENCE) * r * r;
if (threshold === 0 || r >= threshold) {
  const normalized = threshold >= 1 ? 0 : (r - threshold) / (1 - threshold);
  return 1 + 4 * normalized * normalized;
}
const normalized = threshold === 0 ? r : r / threshold;
return EPSILON_CONFIDENCE * normalized * normalized;
```

Failed/trimmed fits have confidence zero. `trustedAnchor` is true only in threshold mode when finite `R² >= threshold`.

- [ ] **Step 4: Run confidence tests**

```powershell
pnpm exec vitest run tests/cv-dunn-confidence.test.ts tests/cv-dunn-fit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/cvTypes.ts src/lib/cvDunnConfidence.ts tests/cv-dunn-confidence.test.ts
git commit -m "feat: add Dunn R2 confidence modes"
```

---

### Task 5: Explicitly Regularized Bounded Shared `g(V)`

**Files:**
- Create: `src/lib/cvDunnReconstruction.ts`
- Create: `tests/cv-dunn-reconstruction.test.ts`
- Modify: `src/lib/cvTypes.ts`

**Interfaces:**
- Consumes: `DunnFractionGrid`, uniform potential grid
- Produces:

```ts
export interface DunnRegularizationDiagnostics {
  lambda: number;
  iterations: number;
  converged: boolean;
  fidelity: number;
  roughness: number;
}

export interface DunnSharedFractionResult {
  g: number[];
  diagnostics: DunnRegularizationDiagnostics;
}

export function secondDifferenceRoughness(values: number[]): number;
export function optimizeSharedFraction(
  fractions: DunnFractionGrid,
  potentials: number[]
): DunnSharedFractionResult;
```

- [ ] **Step 1: Write failing constraint and regularization tests**

```ts
import { expect, it } from "vitest";
import { optimizeSharedFraction, secondDifferenceRoughness } from "../src/lib/cvDunnReconstruction";

const point = (fraction: number, confidence = 1) => ({ fraction, confidence, rSquared: 1, trustedAnchor: true });

it("uses one bounded shared fraction influenced by both branches", () => {
  const result = optimizeSharedFraction({
    forward: [point(0.2), point(0.4), point(0.6)],
    reverse: [point(0.4), point(0.6), point(0.8)]
  }, [0, 0.01, 0.02]);
  expect(result.g).toHaveLength(3);
  expect(result.g.every((value) => value >= 0 && value <= 1)).toBe(true);
  expect(result.g[1]).toBeCloseTo(0.5, 1);
});

it("explicit second-difference regularization suppresses an isolated spike", () => {
  const raw = [0.3, 0.3, 0.95, 0.3, 0.3];
  const result = optimizeSharedFraction({
    forward: raw.map((value) => point(value, 0.2)),
    reverse: raw.map((value) => point(value, 0.2))
  }, [0, 0.002, 0.004, 0.006, 0.008]);
  expect(result.g[2]).toBeLessThan(0.95);
  expect(secondDifferenceRoughness(result.g)).toBeLessThan(secondDifferenceRoughness(raw));
  expect(result.diagnostics.lambda).toBeGreaterThan(0);
});

it("bridges zero-confidence regions without holes", () => {
  const missing = { fraction: null, confidence: 0, rSquared: null, trustedAnchor: false };
  const result = optimizeSharedFraction({
    forward: [point(0.2), missing, missing, point(0.8)],
    reverse: [point(0.2), missing, missing, point(0.8)]
  }, [0, 0.01, 0.02, 0.03]);
  expect(result.g.every(Number.isFinite)).toBe(true);
  expect(result.g[1]).toBeGreaterThan(0.2);
  expect(result.g[2]).toBeLessThan(0.8);
});

it("is deterministic", () => {
  const input = { forward: [point(0.1), point(0.9)], reverse: [point(0.2), point(0.8)] };
  expect(optimizeSharedFraction(input, [0, 0.01])).toEqual(optimizeSharedFraction(input, [0, 0.01]));
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
pnpm exec vitest run tests/cv-dunn-reconstruction.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the convex objective and projected solver**

Implement the objective exactly as:

```ts
function objective(g: number[], target: number[], weight: number[], lambda: number) {
  let fidelity = 0;
  for (let index = 0; index < g.length; index += 1) {
    fidelity += weight[index] * (g[index] - target[index]) ** 2;
  }
  return fidelity + lambda * secondDifferenceRoughness(g);
}
```

Combine branch targets before solving by summing weights and weighted fractions. Initialize missing spans with linear interpolation between nearest defined weighted targets, using the nearest boundary target outside anchored spans. Project every iteration with `Math.min(1, Math.max(0, value))`.

Use the gradient of the fidelity term plus `2 * lambda * D2ᵀD2 g`. Use a conservative Lipschitz step `1 / (2 * maxWeight + 32 * lambda + Number.EPSILON)`, convergence when max absolute update is below `1e-9`, and a 10,000-iteration guard. Throw `CvAnalysisError("reconstructionFailed")` on non-finite objective or non-convergence.

Normalize the supplied potential grid to `[0, 1]` and calculate the second difference in normalized-potential units, so point count, physical interval, and voltage span are reflected without dataset-specific constants. Select Auto lambda from deterministic dimensionless candidates `[1e-4, 1e-3, 1e-2, 1e-1, 1, 10, 100]`. For each candidate, calculate mean normalized fidelity and mean normalized second-difference roughness; choose the interior log-log L-curve point with maximum discrete curvature. Use the central candidate if fewer than three finite candidates exist. This provides an explicit adaptive balance without scan-rate or dataset tuning.

- [ ] **Step 4: Run reconstruction tests**

```powershell
pnpm exec vitest run tests/cv-dunn-reconstruction.test.ts tests/cv-dunn-confidence.test.ts
```

Expected: PASS in under two seconds for the focused suite.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/cvTypes.ts src/lib/cvDunnReconstruction.ts tests/cv-dunn-reconstruction.test.ts
git commit -m "feat: optimize bounded shared Dunn fraction"
```

---

### Task 6: Reconstruction Quality, Original-Order Path, and Contribution Area

**Files:**
- Create: `src/lib/cvDunnQuality.ts`
- Create: `tests/cv-dunn-quality.test.ts`
- Modify: `src/lib/cvTypes.ts`

**Interfaces:**
- Consumes: aligned grid, normalized cycle, target series, shared `g`, fits/settings
- Produces:

```ts
export interface DunnDiagnostics {
  mode: DunnConfidenceMode;
  threshold: number;
  resolvedPotentialInterval: number;
  resolvedTurningPointTrim: number;
  commonMinimum: number;
  commonMaximum: number;
  medianForwardRSquared: number | null;
  medianReverseRSquared: number | null;
  forwardAboveThresholdPercent: number;
  reverseAboveThresholdPercent: number;
  lowFitQuality: boolean;
  scanRateWarning: boolean;
  qualityPassed: boolean;
}

export interface DunnContribution {
  scanRate: number;
  potentialGrid: number[];
  g: number[];
  originalForward: number[];
  originalReverse: number[];
  capacitiveForward: number[];
  capacitiveReverse: number[];
  diffusionForward: number[];
  diffusionReverse: number[];
  plotPath: Array<{ potential: number; current: number; branch: CvBranchKind }>;
  capacitivePercent: number;
  diffusionPercent: number;
  diagnostics: DunnDiagnostics;
}

export interface DunnContributionInput {
  alignedGrid: CvAlignedBranchGrid;
  dunnRecords: DunnFitGrid;
  optimized: DunnSharedFractionResult;
  fractions: DunnFractionGrid;
  scanRate: number;
  seriesIndex: number;
  mode: DunnConfidenceMode;
  threshold: number;
  resolvedTurningPointTrim: number;
}

export function reconstructBranchCurrents(original: number[], g: number[]): { capacitive: number[]; diffusion: number[] };
export function integrateMagnitude(potentials: number[], currents: number[]): number;
export function isLowFitQuality(forwardRSquared: number[], reverseRSquared: number[], threshold: number): boolean;
export function reconstructDunnContribution(input: DunnContributionInput): DunnContribution;
export function validateDunnContribution(contribution: DunnContribution): void;
```

- [ ] **Step 1: Write failing quality and area tests**

```ts
import { expect, it } from "vitest";
import { integrateMagnitude, isLowFitQuality, reconstructBranchCurrents } from "../src/lib/cvDunnQuality";

it("reconstructs signed bounded currents from the same g", () => {
  const g = [0.25, 0.5, 0.75];
  const forward = [-4, 2, 8];
  const reverse = [-8, -2, 4];
  expect(reconstructBranchCurrents(forward, g).capacitive).toEqual([-1, 1, 6]);
  expect(reconstructBranchCurrents(reverse, g).capacitive).toEqual([-2, -1, 3]);
});

it("uses magnitude trapezoidal integration on both branches", () => {
  const potentials = [0, 1];
  const totalArea = integrateMagnitude(potentials, [2, 2]) + integrateMagnitude(potentials, [-2, -2]);
  const capacitiveArea = integrateMagnitude(potentials, [0.5, 0.5]) + integrateMagnitude(potentials, [-0.5, -0.5]);
  expect(totalArea).toBe(4);
  expect(capacitiveArea).toBe(1);
  expect(100 * capacitiveArea / totalArea).toBe(25);
});

it("rejects magnitude or sign violations", () => {
  expect(() => reconstructBranchCurrents([1], [-0.5])).toThrow("reconstructionFailed");
});

it("flags low fit quality below 50% coverage without deleting the result", () => {
  const forward = Array.from({ length: 100 }, (_, index) => index < 49 ? 0.96 : 0.5);
  const reverse = Array.from({ length: 100 }, () => 0.97);
  expect(isLowFitQuality(forward, reverse, 0.95)).toBe(true);
  expect(isLowFitQuality(reverse, reverse, 0.95)).toBe(false);
});
```

- [ ] **Step 2: Run and verify failure**

```powershell
pnpm exec vitest run tests/cv-dunn-quality.test.ts
```

Expected: FAIL because the module and new contribution type do not exist.

- [ ] **Step 3: Implement reconstruction, reconnection, integration, and validation**

Use:

```ts
const capacitiveForward = grid.forwardCurrents[seriesIndex].map((current, index) => g[index] * current);
const capacitiveReverse = grid.reverseCurrents[seriesIndex].map((current, index) => g[index] * current);
const diffusionForward = grid.forwardCurrents[seriesIndex].map((current, index) => current - capacitiveForward[index]);
const diffusionReverse = grid.reverseCurrents[seriesIndex].map((current, index) => current - capacitiveReverse[index]);
```

Integrate `abs(current)` by trapezoids on the ascending potential grid for both branch arrays. Reconnect raw original order by evaluating `g(V)` inside the common range with PCHIP and using the nearest bounded endpoint `g` only for restored turning samples outside the fit range. Use the normalized cycle’s `sourceIndex` and branch ownership; never average separately recorded turning currents.

Validate with numerical tolerance `1e-10 * max(1, abs(original))`. `lowFitQuality` is true when either branch has less than 50% of finite fit R² values at/above the configured threshold. `scanRateWarning` is true for exactly three distinct rates.

- [ ] **Step 4: Run quality and all numerical tests**

```powershell
pnpm exec vitest run tests/cv-cycle.test.ts tests/cv-interpolation.test.ts tests/cv-dunn-fit.test.ts tests/cv-dunn-confidence.test.ts tests/cv-dunn-reconstruction.test.ts tests/cv-dunn-quality.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/cvTypes.ts src/lib/cvDunnQuality.ts tests/cv-dunn-quality.test.ts
git commit -m "feat: validate continuous Dunn contributions"
```

---

### Task 7: Integrate the New Core into the Existing CV Workflow

**Files:**
- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvAnalysis.ts`
- Modify: `src/lib/cvWorkflow.ts`
- Modify: `tests/cv-workflow.test.ts`
- Modify: `tests/cv-analysis.test.ts`

**Interfaces:**
- Consumes: all Tasks 1–6 interfaces
- Produces:

```ts
export interface CvAnalysisSettings {
  potentialInterval: PotentialIntervalSetting;
  rSquaredThreshold: number;
  dunnConfidenceMode: DunnConfidenceMode;
  turningPointTrim: TurningPointTrimSetting;
}

export interface CvWorkflowResult {
  series: CvSeries[];
  alignedGrid: CvAlignedBranchGrid;
  analysisGrid: InterpolatedCvData;
  bRecords: Array<CvFitRecord<BValuePoint>>;
  dunnRecords: DunnFitGrid;
  contributions: DunnContribution[];
  summary: CvQualitySummary;
  settings: CvAnalysisSettings;
}
```

- [ ] **Step 1: Replace old point-interval workflow tests with approved behavior**

Add tests asserting:

```ts
function makeLowQualitySeries(): CvSeries[] {
  const scanRates = [1, 4, 9, 16];
  const amplitudes = [1, 10, 2, 20];
  const potentials = [-1, -0.5, 0, -0.5, -1];
  return scanRates.map((scanRate, seriesIndex) => ({
    label: String(scanRate),
    scanRate,
    points: potentials.map((potential, pointIndex) => ({
      potential,
      current: amplitudes[seriesIndex] * (1.5 + potential) + 0.1 * pointIndex
    }))
  }));
}

const settings = {
  potentialInterval: { mode: "auto" } as const,
  rSquaredThreshold: 0.95,
  dunnConfidenceMode: "threshold" as const,
  turningPointTrim: { mode: "auto" } as const
};

it("keeps b-value threshold filtering while retaining low-R² Dunn fits", () => {
  const result = analyzeCvWorkflow(makeLowQualitySeries(), settings);
  expect(result.bRecords.some((record) => record.status === "belowRSquaredThreshold")).toBe(true);
  expect(result.dunnRecords.forward.some((record) => (record.fit?.rSquared ?? 1) < 0.95)).toBe(true);
  expect(result.contributions.every((item) => item.g.every(Number.isFinite))).toBe(true);
});

it("weighted Dunn mode does not change b-value filtering", () => {
  const threshold = analyzeCvWorkflow(makeLowQualitySeries(), settings);
  const weighted = analyzeCvWorkflow(makeLowQualitySeries(), { ...settings, dunnConfidenceMode: "weighted" });
  expect(weighted.bRecords.map(({ status }) => status)).toEqual(threshold.bRecords.map(({ status }) => status));
  expect(weighted.contributions).toHaveLength(threshold.contributions.length);
});
```

Remove tests whose required behavior is specifically deletion/null holes from low-R² Dunn fits. Keep tests for regression failures and b-value status.

- [ ] **Step 2: Run workflow tests and verify failure**

```powershell
pnpm exec vitest run tests/cv-workflow.test.ts tests/cv-analysis.test.ts
```

Expected: FAIL because workflow settings and contribution output still use `pointInterval` and coefficient masking.

- [ ] **Step 3: Implement orchestration**

Use this exact sequence in `analyzeCvWorkflow`:

```ts
const cycles = normalizeAlignedCvCycles(series);
const alignedGrid = alignCvBranches(series, cycles, settings.potentialInterval);
const analysisGrid = toSequentialGrid(alignedGrid);
const bRecords = classifyRecords(attemptBValueFits(analysisGrid), settings.rSquaredThreshold);
const dunnRecords = fitDunnBranches(alignedGrid, settings.turningPointTrim);
const contributions = alignedGrid.scanRates.map((scanRate, seriesIndex) => {
  const fractions = makeDunnFractionGrid(
    dunnRecords,
    scanRate,
    settings.dunnConfidenceMode,
    settings.rSquaredThreshold
  );
  const optimized = optimizeSharedFraction(fractions, alignedGrid.potentials);
  return reconstructDunnContribution({
    alignedGrid, dunnRecords, optimized, fractions, scanRate, seriesIndex,
    mode: settings.dunnConfidenceMode,
    threshold: settings.rSquaredThreshold,
    resolvedTurningPointTrim: dunnRecords.resolvedTurningPointTrim
  });
});
```

Delete `selectPointInterval` from the active workflow. Retain a compatibility export only if another non-CV caller still imports it; otherwise remove it and update all tests. Map cycle/interpolation/reconstruction errors to existing localized `CvAnalysisError` infrastructure, adding `invalidPotentialInterval`, `invalidTurningPointTrim`, and `reconstructionFailed` codes.

- [ ] **Step 4: Run numerical and workflow tests**

```powershell
pnpm exec vitest run tests/cv-*.test.ts
```

Expected: all non-page CV tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/cvTypes.ts src/lib/cvAnalysis.ts src/lib/cvWorkflow.ts tests/cv-workflow.test.ts tests/cv-analysis.test.ts
git commit -m "refactor: route CV workflow through constrained Dunn core"
```

---

### Task 8: Bilingual Controls, Diagnostics, Warnings, and Responsive Layout

**Files:**
- Modify: `src/components/CvImportPanel.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `src/styles/global.css`
- Modify: `tests/tools-markup.test.tsx`
- Modify: `tests/cv-page.test.tsx`

**Interfaces:**
- Consumes: new `CvAnalysisSettings`, `DunnDiagnostics`
- Produces: Auto/manual controls and bilingual visible status/error UI

- [ ] **Step 1: Update UI tests first**

Replace point-interval selectors with assertions for:

```ts
expect(view.querySelector("#cv-point-interval")).toBeNull();
expect(view.querySelector("#cv-potential-interval-mode")).not.toBeNull();
expect(view.querySelector("#cv-dunn-method-threshold")).not.toBeNull();
expect(view.querySelector("#cv-dunn-method-weighted")).not.toBeNull();
expect(view.querySelector("#cv-turning-trim-mode")).not.toBeNull();
expect(view.textContent).toContain("Smoothing: Auto");
```

Add a page flow that runs threshold mode, switches to weighted mode, confirms the threshold input value remains unchanged/editable, reruns, and verifies the b-value row statuses are unchanged. Add Chinese assertions for `电位间隔`, `R² 加权`, `转折点裁剪`, `平滑：自动`, and the low-fit-quality warning.

- [ ] **Step 2: Run markup/page tests and verify failure**

```powershell
pnpm exec vitest run tests/tools-markup.test.tsx tests/cv-page.test.tsx
```

Expected: FAIL on obsolete point interval UI and missing new controls/diagnostics.

- [ ] **Step 3: Implement the compact controls**

Use controlled values with these names/IDs:

```tsx
<select id="cv-potential-interval-mode" name="cv-potential-interval-mode" />
<input id="cv-potential-interval-mv" name="cv-potential-interval-mv" type="number" min="0" step="any" />
<input id="cv-dunn-method-threshold" name="cv-dunn-method" type="radio" value="threshold" />
<input id="cv-dunn-method-weighted" name="cv-dunn-method" type="radio" value="weighted" />
<input id="cv-r-squared-threshold" name="cv-r-squared-threshold" type="number" min="0" max="1" step="any" />
<select id="cv-turning-trim-mode" name="cv-turning-trim-mode" />
<input id="cv-turning-trim-mv" name="cv-turning-trim-mv" type="number" min="0" step="any" />
```

Keep the threshold input enabled in weighted mode because b-value filtering still uses it. Add the approved compact method explanation and benefits entirely through stable locale keys. Render diagnostics as a compact definition list and warnings with `role="status"`; blocking errors retain the existing visible live region.

- [ ] **Step 4: Add responsive styling and run UI tests**

Desktop: two-column compact settings/diagnostics where space allows. Mobile: one column. Do not change homepage styles.

Run:

```powershell
pnpm exec vitest run tests/tools-markup.test.tsx tests/cv-page.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/components/CvImportPanel.tsx src/pages/CvKineticsPage.tsx src/locales/en.ts src/locales/zh.ts src/styles/global.css tests/tools-markup.test.tsx tests/cv-page.test.tsx
git commit -m "feat: add bilingual constrained Dunn controls"
```

---

### Task 9: Continuous Dunn Plot, Tables, and Traceable Exports

**Files:**
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/components/ScientificLineChart.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `tests/scientific-chart.test.tsx`
- Modify: `tests/cv-page.test.tsx`

**Interfaces:**
- Consumes: `DunnContribution` continuous forward/reverse arrays and `plotPath`
- Produces: continuous inner-loop area, diffusion bands, diagnostics/raw CSV columns

- [ ] **Step 1: Replace fragmented-area assertions with continuous-loop assertions**

Add assertions that, for a contribution with low-R² interior points:

```ts
const chart = view.querySelector('[data-export-id="cv-dunn-chart"]')!;
expect(chart.querySelectorAll('[data-area-series-id="capacitive-area"]')).toHaveLength(1);
expect(chart.querySelector('[data-area-series-id="excluded-area"]')).toBeNull();
expect(chart.querySelectorAll('[data-area-series-id="diffusion-area"]')).toHaveLength(2);
expect(chart.querySelectorAll('[data-series-id="capacitive-forward"], [data-series-id="capacitive-reverse"]')).toHaveLength(2);
```

Update CSV assertions so raw Dunn export contains branch, `k1`, `k2`, R², fit status, local fraction/confidence where rate-specific, and reconstructed exports contain finite capacitive/diffusion currents with `g(V)` metadata. Keep all six filenames.

- [ ] **Step 2: Run chart/page tests and verify failure**

```powershell
pnpm exec vitest run tests/scientific-chart.test.tsx tests/cv-page.test.tsx
```

Expected: FAIL because old code renders valid/excluded segments from `k1 v` masks.

- [ ] **Step 3: Build continuous area series**

Construct one capacitive area over ascending potential with:

```ts
const capacitiveArea = contribution.potentialGrid.map((potential, index) => ({
  x: potential,
  lower: Math.min(contribution.capacitiveForward[index], contribution.capacitiveReverse[index]),
  upper: Math.max(contribution.capacitiveForward[index], contribution.capacitiveReverse[index])
}));
```

Construct two diffusion bands: original-forward to capacitive-forward and original-reverse to capacitive-reverse. Draw original raw `CvSeries.points` in original order and thin capacitive boundary series in closed loop order. Remove final excluded/hatch series while retaining generic chart pattern support if used elsewhere.

Keep result tables scroll-limited to 12 visible rows and column selection/copy support. Update export metadata from point interval to resolved interval, mode, threshold, trim, smoothing, common range, R² medians, and coverage.

- [ ] **Step 4: Run chart/page/export tests**

```powershell
pnpm exec vitest run tests/scientific-chart.test.tsx tests/cv-page.test.tsx tests/tool-export.test.ts
```

Expected: PASS with no fragmented excluded area.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/CvKineticsPage.tsx src/components/ScientificLineChart.tsx src/locales/en.ts src/locales/zh.ts tests/scientific-chart.test.tsx tests/cv-page.test.tsx
git commit -m "feat: render continuous constrained Dunn areas"
```

---

### Task 10: NCP, BP150, and Synthetic Regression Coverage

**Files:**
- Create: `tests/fixtures/cvRegressionData.ts`
- Modify: `tests/cv-workflow.test.ts`
- Modify: `tests/cv-page.test.tsx`
- Modify: `.gitignore` only if fixture policy requires excluding generated local artifacts

**Interfaces:**
- Consumes: existing parsers and complete new workflow
- Produces: deterministic real-shape and synthetic regression gates

- [ ] **Step 1: Add compact deterministic fixture builders**

Implement:

```ts
export function makeBp150RegressionSeries(): CvSeries[];
export function makeNcpRegressionSeries(): CvSeries[];
export function makeSyntheticConstrainedDunnSeries(seed?: number): CvSeries[];
```

`makeBp150RegressionSeries` must preserve the verified structural traits: rates `[0.2, 0.4, 0.6, 0.8, 1]`, approximately 1.98 mV native resolution, two-turn seam-started loop, slightly mismatched 0.8 mV/s potentials, and variable R². Store a representative decimated subset sufficient to preserve peaks and fit-quality behavior, not all 7,570 source rows.

`makeNcpRegressionSeries` must preserve rates `[50, 20, 10, 5, 2]`, mixed one/two-turn seams, different point counts/endpoints, and approximately 0.92 mV resolution.

`makeSyntheticConstrainedDunnSeries` must use a seeded linear-congruential generator and construct currents from known smooth `gTrue(V)`, differing endpoints/point counts, arbitrary rates `[0.7, 1.9, 4.3, 8.8]`, and mild noise.

- [ ] **Step 2: Add regression tests and verify they expose any remaining gaps**

For every fixture and both Dunn modes, assert:

```ts
expect(result.contributions).toHaveLength(series.length);
for (const contribution of result.contributions) {
  expect(contribution.g.every((value) => value >= 0 && value <= 1)).toBe(true);
  expect(contribution.capacitiveForward.every(Number.isFinite)).toBe(true);
  expect(contribution.capacitiveReverse.every(Number.isFinite)).toBe(true);
  expect(contribution.capacitivePercent).toBeGreaterThanOrEqual(0);
  expect(contribution.capacitivePercent).toBeLessThanOrEqual(100);
}
```

For BP150, assert `diagnostics.lowFitQuality === true` and no special expected percentage. For synthetic data, assert no magnitude/sign violations and stable results under slightly changed point counts.

Run:

```powershell
pnpm exec vitest run tests/cv-workflow.test.ts tests/cv-page.test.tsx
```

Expected: FAIL only if a generality issue remains; fix the responsible numerical module, not the fixture.

- [ ] **Step 3: Validate the local full BP150 combined CSV through the parser**

Run a temporary test or existing parser harness against:

```text
D:\codex_communication\BP150-combined-XYXYXY.csv
```

Use layout `pairedPotentialCurrent`, header mode `header`, inferred rates, and settings Auto/0.95/threshold/Auto. Repeat weighted mode. Do not commit an absolute local path or the large source data.

Expected: one complete analysis for both modes; resolved interval near 1.98 mV; low-fit-quality warning; finite continuous contributions.

- [ ] **Step 4: Validate NCP CSV and XLSX equivalence locally**

Use:

```text
C:\Users\ThinkPad\Downloads\NCP-CV——1.csv
C:\Users\ThinkPad\Downloads\NCP-CV——1.xlsx
```

Expected: both imports resolve five compatible logical branch pairs and produce equivalent qualitative diagnostics/contributions within parsing precision.

- [ ] **Step 5: Run all CV tests and commit**

```powershell
pnpm exec vitest run tests/cv-*.test.ts tests/scientific-chart.test.tsx tests/tools-markup.test.tsx
git add tests/fixtures/cvRegressionData.ts tests/cv-workflow.test.ts tests/cv-page.test.tsx
git commit -m "test: add constrained Dunn regression datasets"
```

Expected: all listed tests pass before commit.

---

### Task 11: Full Verification, Browser Acceptance, Review, and Deployment

**Files:**
- Verify all changed files
- Update documentation only if implementation differs from approved naming without changing scientific behavior

**Interfaces:**
- Consumes: completed feature branch
- Produces: verified commit, integrated `main`, GitHub Pages deployment, live tmccdb.org acceptance

- [ ] **Step 1: Run formatter-independent checks and focused suites**

```powershell
git diff --check
pnpm exec vitest run tests/cv-cycle.test.ts tests/cv-interpolation.test.ts tests/cv-dunn-fit.test.ts tests/cv-dunn-confidence.test.ts tests/cv-dunn-reconstruction.test.ts tests/cv-dunn-quality.test.ts tests/cv-workflow.test.ts tests/cv-page.test.tsx tests/scientific-chart.test.tsx tests/cv-parsing.test.ts
```

Expected: no whitespace errors; all focused tests pass.

- [ ] **Step 2: Run complete verification**

```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Expected: all tests pass, TypeScript exits 0, production build exits 0 and generates route entries.

- [ ] **Step 3: Perform browser acceptance locally**

Start the Vite server and verify in the browser:

```text
English default and Chinese switch both work.
CSV/TXT/XLSX imports still preview and analyze.
Point interval is absent.
Potential interval Auto/manual works.
Threshold defaults to 0.95 and remains freely editable.
Threshold and weighted modes both run.
b-value filtering is unchanged between Dunn modes.
NCP and BP150 show continuous inner loops with no low-R² holes.
Low-fit-quality warning is visible for BP150.
Diagnostics show interval, trim, common range, R² medians, and coverage.
All six CSV exports and SVG/PNG exports work.
Desktop is compact and mobile remains stacked/readable.
```

Expected: every item passes; capture screenshots only as local evidence, not as product assets.

- [ ] **Step 4: Invoke verification and code-review skills**

Use `verification-before-completion`, then `requesting-code-review`. Fix every accepted issue with a failing regression test first and rerun Steps 1–2.

Expected: no unresolved blocking or high-priority findings.

- [ ] **Step 5: Commit final fixes and confirm a clean branch**

```powershell
git status --short
git log --oneline --decorate -12
```

Expected: clean worktree; commits are small and ordered by the tasks above.

- [ ] **Step 6: Integrate only the verified branch into local main**

Use the finishing-development-branch procedure. Because the user explicitly requested online deployment, fast-forward or merge the verified feature branch into local `main` without discarding unrelated user work. Re-run:

```powershell
pnpm test
pnpm build
```

Expected: both pass from the exact `main` commit that will be pushed.

- [ ] **Step 7: Push main and monitor GitHub Pages**

```powershell
git push origin main
```

Expected: push succeeds and `.github/workflows/deploy-pages.yml` starts. Monitor the resulting workflow until the Pages deployment succeeds; do not report completion while it is queued or running.

- [ ] **Step 8: Verify the live site**

Open:

```text
https://tmccdb.org/tools/cv-kinetics
```

Verify the deployed commit exposes the new bilingual controls, threshold default, weighted mode, compact layout, successful sample analysis, continuous Dunn result, and visible diagnostics. Confirm unrelated homepage and other tools still load.

Expected: live checks pass. If deployment or live checks fail, diagnose the root cause, fix on the feature/main flow with tests, redeploy, and reverify before reporting completion.

---

## Final Acceptance Checklist

- [ ] One production upload file only; XYYYYY and XYXYXY retained.
- [ ] Complete loops with one/two turning points normalize correctly.
- [ ] Extra incomplete next-cycle data is ignored only after closure.
- [ ] PCHIP is branch-separated and performs no extrapolation.
- [ ] Auto/manual potential interval replaces point interval.
- [ ] Auto/manual turning trim affects Dunn fitting only.
- [ ] Existing b-value threshold behavior is unchanged.
- [ ] Dunn threshold and weighted modes both work.
- [ ] Shared `g(V)` uses confidence fidelity plus explicit smoothness regularization.
- [ ] `0 <= g <= 1`, sign and magnitude constraints pass.
- [ ] Low-R² Dunn regions remain continuous.
- [ ] True turning points and original sequence are retained.
- [ ] Contribution percentages use magnitude trapezoidal integration.
- [ ] Diagnostics and warnings are bilingual and visible.
- [ ] NCP CSV/XLSX, BP150, and synthetic tests pass without special tuning.
- [ ] Existing CSV/TXT/XLSX, exports, layout, and unrelated site behavior pass.
- [ ] Full tests, TypeScript, build, code review, deployment, and live checks pass.
