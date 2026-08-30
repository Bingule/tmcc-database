# Peak b-Value Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default literature-style peak-current b-value mode with automatic detection, cross-rate matching, manual branch-limited correction, full-width charts, bilingual tables/exports, while retaining the existing potential-resolved method unchanged except for vertical full-width layout.

**Architecture:** Add a pure peak-analysis module for localization, matching, and regression; a separate immutable override module; and focused chart/panel components. `cvWorkflow` produces immutable automatic peak results, while the page applies reversible overrides without rerunning import or Dunn reconstruction.

**Tech Stack:** React 19, TypeScript 5.7, Vite 5, Vitest 2, existing PCHIP/regression/chart/export utilities, no new dependency.

## Global Constraints

- `Peak b-value` is the default b-value analysis mode; `Potential-resolved b-value` remains available.
- Detect the significant peaks actually present, from one to ten; never pad to a fixed count.
- NCP resolves three principal peak groups: two increasing-branch oxidation peaks and one decreasing-branch reduction peak.
- Retain a peak group with at least three usable scan rates; disclose missing rates independently of R² status.
- Candidate localization may use smoothed interpolated data, but potential/current values used for fitting, display rows, and export must be original source points.
- Peak-current regressions never combine sweep branches and use `log(|i_peak|) = log(a) + b log(v)`.
- Preserve existing potential-resolved R² and near-zero behavior.
- Both b-value chart workflows use vertical full-width cards on desktop and mobile.
- All strings are bilingual and centralized; no runtime translation.
- Do not merge or deploy automatically.

---

### Task 1: Define peak types, deterministic fixtures, and candidate localization

**Files:**
- Modify: `src/lib/cvTypes.ts`
- Create: `src/lib/cvPeakAnalysis.ts`
- Create: `tests/fixtures/cvPeakData.ts`
- Create: `tests/cv-peak-analysis.test.ts`

**Interfaces:**
- Produces: `detectPeakCandidates(series, cycles): CvPeakCandidate[]`.
- Produces: peak domain types used by matching, overrides, workflow, UI, and export.

- [ ] **Step 1: Create deterministic peak fixtures**

Create `tests/fixtures/cvPeakData.ts`:

```ts
import type { CvSeries } from "../../src/lib/cvTypes";

type PeakDefinition = {
  branch: "forward" | "reverse";
  center: number;
  width: number;
  exponent: number;
  amplitude: number;
  shiftPerLogRate: number;
};

export function makeThreePeakNcpLikeSeries(): CvSeries[] {
  return makePeakSeries([
    { branch: "forward", center: -0.54, width: 0.045, exponent: 0.72, amplitude: 0.35, shiftPerLogRate: 0.004 },
    { branch: "forward", center: -0.41, width: 0.09, exponent: 0.81, amplitude: 1.4, shiftPerLogRate: 0.035 },
    { branch: "reverse", center: -0.68, width: 0.10, exponent: 0.66, amplitude: 1.2, shiftPerLogRate: -0.04 }
  ]);
}

export function makePartialPeakSeries(): CvSeries[] {
  return makePeakSeries([
    { branch: "forward", center: -0.3, width: 0.07, exponent: 0.75, amplitude: 1, shiftPerLogRate: 0.01 },
    { branch: "reverse", center: 0.2, width: 0.06, exponent: 0.6, amplitude: 0.7, shiftPerLogRate: -0.01 }
  ], new Set(["reverse:2", "reverse:20"]));
}

export function makeManyPeakSeries(count = 12): CvSeries[] {
  return makePeakSeries(Array.from({ length: count }, (_, index) => ({
    branch: index % 2 === 0 ? "forward" as const : "reverse" as const,
    center: -0.9 + 1.8 * (index + 1) / (count + 1),
    width: 0.025,
    exponent: 0.55 + 0.03 * (index % 8),
    amplitude: 0.8 + 0.05 * index,
    shiftPerLogRate: (index % 3 - 1) * 0.004
  })));
}

function makePeakSeries(definitions: PeakDefinition[], missing = new Set<string>()): CvSeries[] {
  const rates = [1, 2, 5, 10, 20];
  const grid = Array.from({ length: 401 }, (_, index) => -1 + 2 * index / 400);
  return rates.map((scanRate, seriesIndex) => ({
    label: `${scanRate} mV/s`,
    scanRate,
    points: [...grid, ...grid.slice(0, -1).reverse()].map((potential, pointIndex, potentials) => {
      const delta = pointIndex === 0 ? potentials[1]! - potential : potential - potentials[pointIndex - 1]!;
      const branch = delta >= 0 ? "forward" : "reverse";
      const sign = branch === "forward" ? 1 : -1;
      const baseline = sign * (0.04 + 0.015 * potential) * Math.sqrt(scanRate);
      const peakCurrent = definitions
        .filter((peak) => peak.branch === branch && !missing.has(`${branch}:${scanRate}`))
        .reduce((sum, peak) => {
          const center = peak.center + peak.shiftPerLogRate * Math.log(scanRate);
          const shape = Math.exp(-Math.pow((potential - center) / peak.width, 2));
          return sum + sign * peak.amplitude * Math.pow(scanRate, peak.exponent) * shape;
        }, 0);
      const ripple = 1e-5 * Math.sin((pointIndex + 1) * (seriesIndex + 2));
      return { potential, current: baseline + peakCurrent + ripple };
    })
  }));
}
```

- [ ] **Step 2: Write failing candidate tests**

Create `tests/cv-peak-analysis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";
import { detectPeakCandidates } from "../src/lib/cvPeakAnalysis";
import { makeThreePeakNcpLikeSeries } from "./fixtures/cvPeakData";

describe("detectPeakCandidates", () => {
  it("finds two oxidation and one reduction candidates in NCP-like loops", () => {
    const series = makeThreePeakNcpLikeSeries();
    const candidates = detectPeakCandidates(series, normalizeAlignedCvCycles(series));
    for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex += 1) {
      const local = candidates.filter((candidate) => candidate.seriesIndex === seriesIndex);
      expect(local.filter((candidate) => candidate.kind === "oxidation")).toHaveLength(2);
      expect(local.filter((candidate) => candidate.kind === "reduction")).toHaveLength(1);
      expect(local.every((candidate) => series[seriesIndex]!.points[candidate.sourceIndex]!.potential === candidate.potential)).toBe(true);
      expect(local.every((candidate) => series[seriesIndex]!.points[candidate.sourceIndex]!.current === candidate.current)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run the new test and verify RED**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-peak-analysis.test.ts
```

Expected: FAIL because `cvPeakAnalysis.ts` does not exist.

- [ ] **Step 4: Add peak domain types**

Add to `cvTypes.ts`:

```ts
export type CvPeakKind = "oxidation" | "reduction";
export type CvPeakPointStatus = "auto" | "confirmed" | "adjusted" | "missing" | "excluded" | "nearZeroCurrentUnstable";
export type CvPeakCoverageStatus = "complete" | "partial";
export type CvPeakFitStatus = "valid" | "belowRSquaredThreshold" | "insufficientData" | "nearZeroCurrentUnstable" | "regressionFailed";

export interface CvPeakCandidate {
  seriesIndex: number;
  scanRate: number;
  branch: CvBranchKind;
  kind: CvPeakKind;
  sourceIndex: number;
  potential: number;
  current: number;
  prominence: number;
  normalizedProminence: number;
  confidence: number;
}

export interface CvPeakRatePoint {
  seriesIndex: number;
  scanRate: number;
  candidate: CvPeakCandidate | null;
  status: CvPeakPointStatus;
}

export interface CvPeakFit {
  peakId: string;
  labelIndex: number;
  branch: CvBranchKind;
  kind: CvPeakKind;
  points: CvPeakRatePoint[];
  b: number | null;
  intercept: number | null;
  rSquared: number | null;
  pointCount: number;
  coverageCount: number;
  coverageStatus: CvPeakCoverageStatus;
  fitStatus: CvPeakFitStatus;
}

export interface CvPeakAnalysisResult {
  candidates: CvPeakCandidate[];
  fits: CvPeakFit[];
  maximumPeakCount: 10;
}
```

- [ ] **Step 5: Implement candidate localization exactly as specified**

Create `cvPeakAnalysis.ts` with exported `detectPeakCandidates` and private helpers:

```ts
export function detectPeakCandidates(series: CvSeries[], cycles: NormalizedCvCycle[]): CvPeakCandidate[] {
  if (series.length !== cycles.length) throw new CvAnalysisError("invalidDataShape");
  return series.flatMap((item, seriesIndex) => [
    ...detectBranch(item, cycles[seriesIndex]!, seriesIndex, "forward", "oxidation"),
    ...detectBranch(item, cycles[seriesIndex]!, seriesIndex, "reverse", "reduction")
  ]);
}
```

Implement `detectBranch` in this order:

1. sort a copied normalized branch by potential ascending;
2. create `ceil(span / nativeInterval) + 1` uniform potentials and PCHIP currents;
3. smooth with the centered local-quadratic intercept formula for symmetric `x = -m..m`:

```ts
const denominator = count * sumX4 - sumX2 * sumX2;
const fittedCenter = (sumX4 * sumY - sumX2 * sumX2Y) / denominator;
```

4. compute residual MAD and 10%-span prominence;
5. retain maxima for `forward`, minima for `reverse`, using `max(5 * residualMad, 0.02 * robustCurrentSpan)`;
6. enforce 3%-span separation by descending prominence;
7. for each retained region, select the maximum/minimum original branch point inside half the separation window;
8. set confidence to `min(1, prominence / max(threshold, Number.EPSILON))` and return candidates in potential order.

- [ ] **Step 6: Run candidate tests and verify GREEN**

Run the Task 3 command. Expected: the NCP-like fixture yields exactly three original-source candidates at every rate.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/lib/cvTypes.ts src/lib/cvPeakAnalysis.ts tests/fixtures/cvPeakData.ts tests/cv-peak-analysis.test.ts
git commit -m "feat: detect CV peak-current candidates"
```

---

### Task 2: Match peaks across scan rates and fit peak-current b values

**Files:**
- Modify: `src/lib/cvPeakAnalysis.ts`
- Modify: `tests/cv-peak-analysis.test.ts`

**Interfaces:**
- Consumes: Task 1 candidates.
- Produces: `analyzePeakBValues(series, cycles, threshold): CvPeakAnalysisResult`.
- Produces: `fitPeakGroups(groups, series, threshold): CvPeakFit[]` for override recomputation.

- [ ] **Step 1: Write failing matching and fitting tests**

```ts
import { analyzePeakBValues } from "../src/lib/cvPeakAnalysis";
import { makeManyPeakSeries, makePartialPeakSeries } from "./fixtures/cvPeakData";

it("matches shifted NCP-like peaks without combining branches", () => {
  const series = makeThreePeakNcpLikeSeries();
  const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0.95);
  expect(result.fits).toHaveLength(3);
  expect(result.fits.map((fit) => fit.kind)).toEqual(["oxidation", "oxidation", "reduction"]);
  expect(result.fits.every((fit) => fit.points.every((point) => point.candidate === null || point.candidate.branch === fit.branch))).toBe(true);
  expect(result.fits.every((fit) => fit.b !== null && fit.rSquared !== null)).toBe(true);
});

it("fits a peak present at only three rates and discloses partial coverage", () => {
  const series = makePartialPeakSeries();
  const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0);
  const partial = result.fits.find((fit) => fit.kind === "reduction")!;
  expect(partial.coverageCount).toBe(3);
  expect(partial.coverageStatus).toBe("partial");
  expect(partial.pointCount).toBe(3);
  expect(partial.fitStatus).toBe("valid");
});

it("caps automatically matched peak groups at ten", () => {
  const series = makeManyPeakSeries(12);
  const result = analyzePeakBValues(series, normalizeAlignedCvCycles(series), 0);
  expect(result.fits).toHaveLength(10);
  expect(result.fits.map((fit) => fit.labelIndex)).toEqual([1,2,3,4,5,6,7,8,9,10]);
});
```

Add an explicit near-zero fit test so the stability rule is independent of candidate detection:

```ts
it("marks a high-R² peak fit unstable when every peak current is negligible", () => {
  const scanRates = [1, 2, 5, 10, 20];
  const group = makePeakGroup("forward", scanRates.map((scanRate, seriesIndex) => ({
    seriesIndex,
    scanRate,
    potential: -0.4,
    current: 1e-12 * Math.pow(scanRate, 0.75),
    sourceIndex: 10
  })));
  const series = makeSeriesWithBranchScale(scanRates, 1);
  const [fit] = fitPeakGroups([group], series, 0.95);
  expect(fit.rSquared).toBeGreaterThan(0.999);
  expect(fit.fitStatus).toBe("nearZeroCurrentUnstable");
});
```

Add these deterministic test-only helpers in `tests/cv-peak-analysis.test.ts` (import `CvBranchKind`, `CvPeakCandidate`, and `CvSeries` from `cvTypes`):

```ts
function makePeakGroup(
  branch: CvBranchKind,
  points: Array<Pick<CvPeakCandidate, "seriesIndex" | "scanRate" | "potential" | "current" | "sourceIndex">>
) {
  return {
    peakId: "peak-1",
    labelIndex: 1,
    branch,
    kind: branch === "forward" ? "oxidation" as const : "reduction" as const,
    candidates: new Map(points.map((point) => [point.seriesIndex, {
      ...point,
      branch,
      kind: branch === "forward" ? "oxidation" as const : "reduction" as const,
      prominence: Math.abs(point.current),
      normalizedProminence: 1,
      confidence: 1
    }]))
  };
}

function makeSeriesWithBranchScale(scanRates: number[], scale: number): CvSeries[] {
  return scanRates.map((scanRate) => ({
    label: `${scanRate} mV/s`,
    scanRate,
    points: [
      { potential: -1, current: scale },
      { potential: 0, current: scale },
      { potential: 1, current: scale },
      { potential: 0, current: -scale },
      { potential: -1, current: -scale }
    ]
  }));
}
```

- [ ] **Step 2: Run tests and verify RED**

Expected: missing `analyzePeakBValues` and grouping/fitting behavior.

- [ ] **Step 3: Implement monotone matching**

Represent mutable construction history privately:

```ts
type PeakGroupBuilder = {
  branch: CvBranchKind;
  kind: CvPeakKind;
  candidates: Map<number, CvPeakCandidate>;
};
```

For each branch/kind:

1. sort series indices by scan rate;
2. choose the median-rate index as reference and seed one group per candidate;
3. walk toward higher rates, then lower rates;
4. predict each group's potential from its last two matches, or use its last potential when only one exists;
5. fill a dynamic-programming matrix over predicted groups and sorted candidates with match, skip-group, and skip-candidate transitions;
6. reject matches beyond 25% branch span; otherwise use the exact design cost and `0.35` gap penalty;
7. start a new group for an unmatched candidate, then allow it to accumulate support in subsequent rates;
8. discard groups with support below three;
9. rank more than ten groups by support, median normalized prominence, and confidence;
10. assign deterministic ids `peak-1` through `peak-10` after forward-potential then reverse-potential ordering.

Export the pure matcher for direct testing:

```ts
export function matchPeakCandidates(
  candidates: CvPeakCandidate[],
  scanRates: number[]
): Array<{ peakId: string; labelIndex: number; branch: CvBranchKind; kind: CvPeakKind; candidates: Map<number, CvPeakCandidate> }>;
```

- [ ] **Step 4: Implement branch-specific fitting**

Use the existing `linearRegression` utility. Build one `CvPeakRatePoint` per imported series, including explicit missing records. Exclude exact/near-zero candidates from logs using the branch scale `max(abs(current)) * 1e-6`. Require three distinct positive scan rates. Apply threshold after stability:

```ts
const fitStatus: CvPeakFitStatus = unstable
  ? "nearZeroCurrentUnstable"
  : regression === null
    ? "insufficientData"
    : threshold === 0 || regression.rSquared >= threshold
      ? "valid"
      : "belowRSquaredThreshold";
```

Set `coverageStatus` independently from `fitStatus`.

- [ ] **Step 5: Run tests and verify GREEN**

Run all of `tests/cv-peak-analysis.test.ts`. Expected: matching, partial coverage, cap, branch separation, and near-zero tests pass.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/lib/cvPeakAnalysis.ts tests/cv-peak-analysis.test.ts
git commit -m "feat: match and fit peak b-values"
```

---

### Task 3: Add immutable manual peak overrides and snapping

**Files:**
- Create: `src/lib/cvPeakOverrides.ts`
- Create: `tests/cv-peak-overrides.test.ts`

**Interfaces:**
- Produces: `applyPeakOverrides(automatic, series, cycles, threshold, state)`.
- Produces: `snapPeakPoint(series, cycle, branch, potential)`.
- Produces: immutable state operations for confirm, adjust, exclude, restore, add, and remove.

- [ ] **Step 1: Write failing override tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";
import { analyzePeakBValues } from "../src/lib/cvPeakAnalysis";
import {
  CvPeakOverrideError,
  addManualPeakOverride,
  applyPeakOverrides,
  createPeakOverrideState,
  removePeakOverride,
  restorePeakPointOverride,
  setPeakPointOverride,
  snapPeakPoint
} from "../src/lib/cvPeakOverrides";
import { makeManyPeakSeries, makeThreePeakNcpLikeSeries } from "./fixtures/cvPeakData";

it("snaps only to an original point on the selected branch", () => {
  const series = makeThreePeakNcpLikeSeries();
  const cycle = normalizeAlignedCvCycles(series)[0]!;
  const snapped = snapPeakPoint(series[0]!, cycle, "reverse", -0.7);
  expect(snapped.branch).toBe("reverse");
  expect(series[0]!.points[snapped.sourceIndex]).toEqual({ potential: snapped.potential, current: snapped.current });
});

it("adjusts one peak/rate without mutating automatic results", () => {
  const series = makeThreePeakNcpLikeSeries();
  const cycles = normalizeAlignedCvCycles(series);
  const automatic = analyzePeakBValues(series, cycles, 0);
  const peak = automatic.fits[0]!;
  const snapped = snapPeakPoint(series[0]!, cycles[0]!, peak.branch, peak.points[0]!.candidate!.potential + 0.02);
  const initial = createPeakOverrideState();
  const overrides = setPeakPointOverride(initial, { peakId: peak.peakId, seriesIndex: 0, action: "adjust", sourceIndex: snapped.sourceIndex });
  const adjusted = applyPeakOverrides(automatic, series, cycles, 0, overrides);
  expect(adjusted.fits[0]!.points[0]!.candidate!.sourceIndex).toBe(snapped.sourceIndex);
  expect(automatic.fits[0]!.points[0]!.candidate!.sourceIndex).not.toBe(snapped.sourceIndex);
  expect(initial).toEqual(createPeakOverrideState());
});

it("supports confirm, exclude, restore, add, and the ten-peak limit", () => {
  const series = makeThreePeakNcpLikeSeries();
  const cycles = normalizeAlignedCvCycles(series);
  const automatic = analyzePeakBValues(series, cycles, 0);
  const peak = automatic.fits[0]!;
  const sourceIndex = peak.points[0]!.candidate!.sourceIndex;
  const confirmed = setPeakPointOverride(createPeakOverrideState(), {
    peakId: peak.peakId, seriesIndex: 0, action: "confirm", sourceIndex
  });
  const excluded = setPeakPointOverride(confirmed, {
    peakId: peak.peakId, seriesIndex: 1, action: "exclude"
  });
  const applied = applyPeakOverrides(automatic, series, cycles, 0, excluded);
  expect(applied.fits[0]!.points[0]!.status).toBe("confirmed");
  expect(applied.fits[0]!.points[1]!.status).toBe("excluded");

  const restored = restorePeakPointOverride(excluded, peak.peakId, 1);
  expect(applyPeakOverrides(automatic, series, cycles, 0, restored).fits[0]!.points[1]!.status).toBe("auto");
  const removed = removePeakOverride(restored, peak.peakId);
  expect(applyPeakOverrides(automatic, series, cycles, 0, removed).fits.some((fit) => fit.peakId === peak.peakId)).toBe(false);

  const tenSeries = makeManyPeakSeries(10);
  const tenCycles = normalizeAlignedCvCycles(tenSeries);
  const ten = analyzePeakBValues(tenSeries, tenCycles, 0);
  expect(ten.fits).toHaveLength(10);
  expect(() => addManualPeakOverride(
    createPeakOverrideState(), ten, tenSeries, tenCycles, {
      anchorSeriesIndex: 0,
      branch: "forward",
      sourceIndex: tenCycles[0]!.forward.points[10]!.sourceIndex
    }
  )).toThrowError(new CvPeakOverrideError("peakLimit"));
});
```

- [ ] **Step 2: Run the override test and verify RED**

Expected: missing module and functions.

- [ ] **Step 3: Implement override types and pure operations**

Add in `cvPeakOverrides.ts`:

```ts
export type CvPeakPointOverride = {
  peakId: string;
  seriesIndex: number;
  action: "confirm" | "adjust" | "exclude";
  sourceIndex?: number;
};

export type CvManualPeakAnchor = {
  manualPeakId: string;
  anchorSeriesIndex: number;
  branch: CvBranchKind;
  sourceIndex: number;
};

export type CvPeakOverrideState = {
  pointOverrides: CvPeakPointOverride[];
  manualPeaks: CvManualPeakAnchor[];
  removedPeakIds: string[];
};

export class CvPeakOverrideError extends Error {
  constructor(readonly code: "invalidPeak" | "invalidBranch" | "invalidSourceIndex" | "peakLimit") {
    super(code);
  }
}
```

Use these exact operation signatures:

```ts
export function createPeakOverrideState(): CvPeakOverrideState;
export function setPeakPointOverride(state: CvPeakOverrideState, override: CvPeakPointOverride): CvPeakOverrideState;
export function restorePeakPointOverride(state: CvPeakOverrideState, peakId: string, seriesIndex: number): CvPeakOverrideState;
export function addManualPeakOverride(
  state: CvPeakOverrideState,
  automatic: CvPeakAnalysisResult,
  series: CvSeries[],
  cycles: NormalizedCvCycle[],
  anchor: Omit<CvManualPeakAnchor, "manualPeakId">
): CvPeakOverrideState;
export function removePeakOverride(state: CvPeakOverrideState, peakId: string): CvPeakOverrideState;
```

`snapPeakPoint` filters the normalized branch's `sourceIndex` set, selects the minimum absolute potential distance, and breaks ties by smaller source index. `applyPeakOverrides` deep-clones automatic fits, removes ids in `removedPeakIds`, expands manual anchors by matching same-kind candidates at other rates, applies point overrides, and calls `fitPeakGroups` from Task 2. Manual ids are the smallest unused `manual-1`, `manual-2`, and so on. Adding when `automatic active - removed + manual active >= 10` throws `CvPeakOverrideError("peakLimit")`. Every operation must return new arrays and never mutate its inputs.

- [ ] **Step 4: Run tests and verify GREEN**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-peak-overrides.test.ts tests/cv-peak-analysis.test.ts
```

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/lib/cvPeakOverrides.ts tests/cv-peak-overrides.test.ts
git commit -m "feat: support reversible peak-point adjustments"
```

---

### Task 4: Integrate automatic peak analysis into the workflow

**Files:**
- Modify: `src/lib/cvWorkflow.ts:1-68`
- Modify: `src/lib/cvTypes.ts:CvWorkflowResult`
- Modify: `tests/cv-workflow.test.ts:76-155`

**Interfaces:**
- Consumes: `analyzePeakBValues`.
- Produces: immutable `CvWorkflowResult.peakAnalysis` without changing current `bRecords` or Dunn semantics.

- [ ] **Step 1: Write a failing workflow test**

```ts
it("adds peak b-value results without changing potential-resolved or Dunn filtering", () => {
  const series = makeThreePeakNcpLikeSeries();
  const result = analyzeCvWorkflow(series, makeSettings("threshold"));
  expect(result.peakAnalysis.fits).toHaveLength(3);
  expect(result.bRecords.some((record) => record.status === "belowRSquaredThreshold")).toBe(true);
  expect(result.contributions).toHaveLength(series.length);
});
```

- [ ] **Step 2: Run and verify RED**

Expected: `peakAnalysis` is missing.

- [ ] **Step 3: Implement the minimal workflow integration**

After cycle normalization and before return:

```ts
const peakAnalysis = analyzePeakBValues(series, cycles, settings.rSquaredThreshold);
```

Return it on `CvWorkflowResult`. Do not gate Dunn contributions on peak fits and do not feed peak records into the current potential-resolved summary counters.

- [ ] **Step 4: Run workflow and scientific tests**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-workflow.test.ts tests/cv-analysis.test.ts tests/cv-peak-analysis.test.ts
```

- [ ] **Step 5: Commit Task 4**

```powershell
git add src/lib/cvWorkflow.ts src/lib/cvTypes.ts tests/cv-workflow.test.ts
git commit -m "feat: include peak b-values in CV workflow"
```

---

### Task 5: Build full-width peak charts and interaction panel

**Files:**
- Create: `src/components/CvPeakOverviewChart.tsx`
- Create: `src/components/CvPeakRegressionChart.tsx`
- Create: `src/components/CvPeakAnalysisPanel.tsx`
- Create: `tests/cv-peak-charts.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- `CvPeakOverviewChart` consumes original series, peak fits, active peak/rate, and emits a clicked potential.
- `CvPeakRegressionChart` consumes fits and renders independent point/line series.
- `CvPeakAnalysisPanel` composes selection controls, both charts, summary table, adjustment table, and pure callback props.

- [ ] **Step 1: Write failing chart tests**

Render NCP-like peak results and assert:

```ts
expect(view.querySelectorAll('[data-peak-marker]')).toHaveLength(15);
expect(view.querySelectorAll('[data-peak-kind="oxidation"]')).toHaveLength(10);
expect(view.querySelectorAll('[data-peak-kind="reduction"]')).toHaveLength(5);
expect(view.querySelectorAll('[data-peak-regression-line]')).toHaveLength(3);
expect(view.querySelector('[data-peak-label="Peak 1"]')).not.toBeNull();
```

Dispatch pointer/click at a known SVG x coordinate and assert `onSelectPotential` receives the domain potential, while the parent-selected branch/rate remains unchanged. Assert keyboard-selectable markers expose localized accessible labels.

- [ ] **Step 2: Run chart tests and verify RED**

Expected: component modules do not exist.

- [ ] **Step 3: Implement `CvPeakOverviewChart`**

Follow the existing scientific SVG dimensions and metadata conventions. Render:

- one sampled complete-loop series per scan rate;
- marker shapes: triangle/circle for oxidation/reduction plus outline for missing/excluded states;
- Peak N text adjacent to active-rate markers and compact labels elsewhere;
- `data-peak-marker`, `data-peak-kind`, `data-peak-id`, `data-series-index`, and `data-source-index` attributes;
- one transparent plot rectangle whose click maps SVG x to potential and calls `onSelectPotential`.

Sampling may reduce loop lines to 2,000 points per series but must always retain every peak source index and all turning points.

- [ ] **Step 4: Implement `CvPeakRegressionChart`**

Build measured point and fit line per finite fit:

```ts
const measured = fit.points.flatMap((point) => point.candidate && isUsable(point)
  ? [{ x: Math.log(point.scanRate), y: Math.log(Math.abs(point.candidate.current)) }]
  : []);
const line = fit.b === null || fit.intercept === null || measured.length < 2
  ? []
  : [Math.min(...measured.map((point) => point.x)), Math.max(...measured.map((point) => point.x))]
      .map((x) => ({ x, y: fit.intercept! + fit.b! * x }));
```

Use one stable color per peak; measured points and line share the color. Legend text is `Peak N · b = value` plus localized branch/kind.

- [ ] **Step 5: Implement `CvPeakAnalysisPanel` and vertical styles**

The panel props must be state-free except local table expansion:

```ts
interface CvPeakAnalysisPanelProps {
  series: CvSeries[];
  result: CvPeakAnalysisResult;
  selectedPeakId: string | null;
  selectedSeriesIndex: number;
  onPeakChange(id: string): void;
  onSeriesChange(index: number): void;
  onPotentialSelect(potential: number): void;
  onConfirm(): void;
  onExclude(): void;
  onRestore(): void;
  onAddPeak(): void;
  onRemovePeak(): void;
}
```

Add `.cv-b-vertical-stack { display:grid; grid-template-columns:1fr; gap:14px; }`. Do not add a desktop two-column override.

- [ ] **Step 6: Run chart tests and verify GREEN**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-peak-charts.test.tsx
```

- [ ] **Step 7: Commit Task 5**

```powershell
git add src/components/CvPeakOverviewChart.tsx src/components/CvPeakRegressionChart.tsx src/components/CvPeakAnalysisPanel.tsx src/styles/global.css tests/cv-peak-charts.test.tsx
git commit -m "feat: add full-width peak b-value dashboard"
```

---

### Task 6: Compose both modes in the page and add bilingual controls

**Files:**
- Modify: `src/pages/CvKineticsPage.tsx:1-482`
- Modify: `src/styles/global.css:2500-3250`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `tests/cv-page.test.tsx`
- Modify: `tests/i18n.test.tsx`

**Interfaces:**
- Consumes: workflow peak results, override functions, and Task 5 panel.
- Produces: default peak mode, reversible manual interaction, and retained potential-resolved mode.

- [ ] **Step 1: Write failing page-mode and layout tests**

After a valid analysis, assert:

```ts
expect(view.querySelector<HTMLSelectElement>('select[name="bAnalysisMode"]')?.value).toBe("peak");
expect(view.querySelector('[data-panel-id="cv-peak-analysis"]')).not.toBeNull();
expect(view.querySelector('[data-panel-id="cv-potential-b-analysis"]')).toBeNull();

await setSelect(view.querySelector<HTMLSelectElement>('select[name="bAnalysisMode"]')!, "potential");
expect(view.querySelector('[data-panel-id="cv-peak-analysis"]')).toBeNull();
expect(view.querySelector('[data-panel-id="cv-potential-b-analysis"]')).not.toBeNull();
expect(view.querySelector('.cv-b-dashboard-grid')?.classList.contains('cv-b-vertical-stack')).toBe(true);
```

Add this click-adjustment flow in the successful page test:

```ts
await setSelect(view.querySelector<HTMLSelectElement>('select[name="selectedPeakId"]')!, "peak-1");
await setSelect(view.querySelector<HTMLSelectElement>('select[name="selectedPeakSeriesIndex"]')!, "3");
const row = view.querySelector<HTMLElement>('[data-peak-id="peak-1"][data-series-index="3"]')!;
const sourceBefore = row.getAttribute("data-source-index");
const currentBefore = row.getAttribute("data-current");
const importRowsBefore = view.querySelectorAll('[data-table-id="cv-import-preview"] tbody tr').length;
const dunnRowsBefore = view.querySelectorAll('[data-table-id="cv-dunn-results"] tbody tr').length;
const chart = view.querySelector<SVGSVGElement>('[data-export-id="cv-peak-overview-chart"]')!;
vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
  x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500,
  toJSON: () => ({})
});
await act(async () => chart.querySelector<SVGRectElement>('[data-peak-click-target]')!
  .dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 420, clientY: 250 })));
const adjusted = view.querySelector<HTMLElement>('[data-peak-id="peak-1"][data-series-index="3"]')!;
expect(adjusted.getAttribute("data-source-index")).not.toBe(sourceBefore);
expect(adjusted.getAttribute("data-current")).not.toBe(currentBefore);
expect(view.querySelectorAll('[data-table-id="cv-import-preview"] tbody tr')).toHaveLength(importRowsBefore);
expect(view.querySelectorAll('[data-table-id="cv-dunn-results"] tbody tr')).toHaveLength(dunnRowsBefore);
```

Expose the named `data-*` attributes from Task 5 exactly as used here. Choose the fixture/chart domain so `clientX = 420` maps to a different original source point on the selected forward branch.

- [ ] **Step 2: Run page tests and verify RED**

Expected: mode selector and peak panel are absent.

- [ ] **Step 3: Add page state and override application**

Add state:

```ts
const [bAnalysisMode, setBAnalysisMode] = useState<"peak" | "potential">("peak");
const [peakOverrides, setPeakOverrides] = useState<CvPeakOverrideState>(() => createPeakOverrideState());
const [selectedPeakId, setSelectedPeakId] = useState<string | null>(null);
const [selectedPeakSeriesIndex, setSelectedPeakSeriesIndex] = useState(0);
```

Use `useMemo` to apply overrides to `analysis.peakAnalysis`. Reset mode to `peak`, select its first fit/rate, and clear overrides after new imported data analysis. Preserve overrides across a pure R² reclassification of the same imported table identity; clear them when layout, header, rate mapping, or source content changes.

Render the compact localized mode selector below the b-value heading. Wrap the existing potential-resolved markup in `data-panel-id="cv-potential-b-analysis"` and change its two-card grid class to include `cv-b-vertical-stack`. Render `CvPeakAnalysisPanel` for peak mode.

- [ ] **Step 4: Add all locale keys**

Add parallel stable keys covering:

```ts
"cv.b.mode.label": "Analysis mode",
"cv.b.mode.peak": "Peak b-value",
"cv.b.mode.potential": "Potential-resolved b-value",
"cv.peak.overview": "Multi-scan-rate CV peak overview",
"cv.peak.regression": "Peak-current b-value regressions",
"cv.peak.oxidation": "Oxidation peak",
"cv.peak.reduction": "Reduction peak",
"cv.peak.partial": "Partial scan-rate coverage",
"cv.peak.noPeaks": "No significant peaks were detected.",
"cv.peak.confirm": "Confirm point",
"cv.peak.exclude": "Exclude point",
"cv.peak.restore": "Restore automatic point",
"cv.peak.add": "Add peak",
"cv.peak.remove": "Remove peak",
"cv.peak.limit": "A maximum of 10 active peaks is supported.",
"cv.peak.snapError": "Choose a potential on the selected scan rate and sweep branch.",
"cv.peak.sourceIndex": "Original source index",
"cv.peak.coverage": "Scan-rate coverage"
```

Add natural Simplified Chinese equivalents, including `峰值 b 值`, `电位分辨 b 值`, `氧化峰`, `还原峰`, and `部分扫速缺失`.

- [ ] **Step 5: Make both modes full width on every viewport**

Set `.cv-b-dashboard-grid { grid-template-columns: 1fr; }` outside media queries and remove/override the prior two-column desktop declaration. Keep controls responsive and prevent chart/table overflow.

- [ ] **Step 6: Run page and i18n tests and verify GREEN**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-page.test.tsx tests/i18n.test.tsx tests/cv-peak-charts.test.tsx
```

- [ ] **Step 7: Commit Task 6**

```powershell
git add src/pages/CvKineticsPage.tsx src/styles/global.css src/locales/en.ts src/locales/zh.ts tests/cv-page.test.tsx tests/i18n.test.tsx
git commit -m "feat: add bilingual b-value analysis modes"
```

---

### Task 7: Add peak CSV/figure exports and complete regression verification

**Files:**
- Modify: `src/pages/CvKineticsPage.tsx:28-35, 267-272, 475-482, 1040-1208`
- Modify: `tests/cv-page.test.tsx:948-1005`
- Modify: `README.md` only if its export inventory is explicit.

**Interfaces:**
- Produces: `cv-peak-b-value-results.csv`, `cv-peak-points.csv`, `cv-peak-overview-chart.svg/png`, and `cv-peak-regression-chart.svg/png`.

- [ ] **Step 1: Write failing export tests**

Update the export inventory assertion from six to eight CSVs and assert exact peak schemas:

```ts
expect(csvFilenames).toContain("cv-peak-b-value-results.csv");
expect(csvFilenames).toContain("cv-peak-points.csv");
for (const filename of csvFilenames) await click(view, filename);
const exported = await Promise.all(blobs.map(readBlob));
const csvByFilename = new Map(downloaded.map((filename, index) => [filename, exported[index]!]));
const peakSummaryCsv = csvByFilename.get("cv-peak-b-value-results.csv")!;
const peakPointsCsv = csvByFilename.get("cv-peak-points.csv")!;
expect(peakSummaryCsv).toContain("Peak label,Sweep branch,Peak kind,b value,Intercept,R²,Fit point count,Scan-rate coverage,Fit status");
expect(peakPointsCsv).toContain("Peak label,Scan rate (mV/s),Peak potential (V),Peak current,Original source index,Point status");
expect([...view.querySelectorAll<HTMLButtonElement>('.cv-export button')]
  .filter((button) => button.textContent?.endsWith(".csv"))).toHaveLength(8);
```

Assert missing rates export blank potential/current with `Partial scan-rate coverage`, manual adjusted rows export the new original source index, and the two peak figure buttons embed current import/settings metadata.

- [ ] **Step 2: Run export tests and verify RED**

Expected: filenames, schemas, and figure ids are absent.

- [ ] **Step 3: Implement peak exports**

Append the two filenames to `csvFiles`. Add explicit `exportCsv` branches using the currently override-applied peak result rather than immutable automatic results. Summary rows contain one row per peak; point rows contain one row per peak per imported scan rate, including missing/excluded statuses.

Add figure ids to availability/export controls:

```ts
"cv-peak-overview-chart": peakResult.fits.length > 0,
"cv-peak-regression-chart": peakResult.fits.some((fit) => fit.b !== null)
```

- [ ] **Step 4: Run the complete focused CV suite**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-peak-analysis.test.ts tests/cv-peak-overrides.test.ts tests/cv-peak-charts.test.tsx tests/cv-analysis.test.ts tests/cv-dunn-quality.test.ts tests/cv-workflow.test.ts tests/cv-page.test.tsx tests/cv-parsing.test.ts tests/cv-import.test.ts tests/cv-import-panel.test.tsx
```

Expected: all peak, potential-resolved, Dunn, CSV, TXT, XLSX, and page tests pass.

- [ ] **Step 5: Run full verification**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/typescript/bin/tsc' --noEmit
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'scripts/validate-data.js'
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vite/bin/vite.js' build
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'scripts/create-route-entries.mjs'
git diff --check
```

Expected: all tests pass, TypeScript emits no errors, 6,761 material records validate, production build and route generation succeed, and `git diff --check` is clean.

- [ ] **Step 6: Perform browser-level scientific/layout verification**

Run the local Vite server and check English/Chinese at desktop and mobile widths:

- Peak mode is default.
- NCP-like regression data shows three labeled peaks.
- Click adjustment snaps to the selected original branch point.
- Potential-resolved mode remains branch-separated and vertically full width.
- Highest-rate Dunn fill remains inside the original loop.
- Peak and Dunn CSV/SVG/PNG controls are enabled only when their source result exists.

- [ ] **Step 7: Commit Task 7**

```powershell
git add src/pages/CvKineticsPage.tsx tests/cv-page.test.tsx README.md
git commit -m "feat: export peak b-value analysis results"
```

Do not push, merge, change GitHub Pages rules, or deploy without a separate explicit user instruction after verification.
