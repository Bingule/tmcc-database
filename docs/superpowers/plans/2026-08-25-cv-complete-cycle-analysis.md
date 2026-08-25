# Complete CV Cycle Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve each imported CV dataset as one sequential cycle, analyze one to three monotonic sweep branches independently, and recombine b-value/Dunn results and plots into the complete original scan order.

**Architecture:** Add a focused cycle-segmentation module that assigns stable source indices, branch indices, directions, and shared-boundary metadata without mutating input. Extend the interpolated grid with explicit branch spans; interpolation, point sampling, fitting, Dunn reconstruction, and integration operate branch-locally, while the page consumes the recombined flat sequence. Existing single-sweep inputs use one branch and remain compatible.

**Tech Stack:** React 18, TypeScript 5, Vite 5, Vitest, existing CV parsing/analysis modules, existing i18n resources; no new runtime dependencies.

## Global Constraints

- Preserve every imported potential/current point in source order; never sort or truncate the confirmed cycle.
- Support zero, one, or two potential-direction changes; reject more than two.
- Never average or merge forward and return currents at the same potential.
- Split only for branch-local interpolation, point sampling, fitting, and integration; recombine outputs in traversal order.
- Apply point interval independently per branch and retain the cycle ends and every turning boundary.
- Integrate Dunn contribution area with branch-local `|ΔE|`; never integrate across branch boundaries.
- Preserve the current b-value and Dunn formulas, R² behavior, bilingual UI, 12-row viewports, column copying, and CSV/TXT/XLSX support.
- Do not add a seventh raw-data export or redesign unrelated pages.
- Use TDD for every production change: observe the requested focused test fail for the intended reason before implementation.
- Use the bundled Node runtime at `C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`; the shared dependency entry is `D:\codex_communication\tmcc-database\node_modules`.

## File Responsibility Map

- Create `src/lib/cvCycle.ts`: detect/validate branches and retain source-index identity.
- Modify `src/lib/cvTypes.ts`: define branch-aware grid and fit-record metadata.
- Modify `src/lib/cvParsing.ts`: retain full confirmed series and translate cycle-structure errors.
- Modify `src/lib/cvImport.ts`: add the stable import/UI error code.
- Modify `src/lib/cvAnalysis.ts`: branch-local interpolation, branch-aware validation, fitting identities, and Dunn integration.
- Modify `src/lib/cvWorkflow.ts`: branch-local point interval and full-cycle summaries.
- Modify `src/pages/CvKineticsPage.tsx`: branch-aware navigation, tables, plots, and exports.
- Modify `src/components/CvImportPanel.tsx`: map the new visible error.
- Modify `src/locales/en.ts` and `src/locales/zh.ts`: branch labels, help, and error text.
- Modify `README.md`: document complete-cycle behavior.
- Create `tests/cv-cycle.test.ts`; modify existing parsing, analysis, workflow, page, i18n, and markup tests.

---

### Task 1: Preserve and segment complete cycles

**Files:**
- Create: `src/lib/cvCycle.ts`
- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvImport.ts`
- Modify: `src/lib/cvParsing.ts`
- Create: `tests/cv-cycle.test.ts`
- Modify: `tests/cv-parsing.test.ts`

**Interfaces:**
- Produces `SweepDirection`, `CvSweepBranch`, `CvCycleStructureReason`, `CvCycleStructureError`, `splitCvCycle(points)`, and `splitAlignedCvCycles(series)`.
- `CvSweepBranch.points` contains `{ potential, current, sourceIndex }` and may share a source index with the preceding branch only when the turning point was recorded once.
- `confirmCvSeries(table, scanRates)` returns all `CvSeries.points` in source order and throws `CvParseError("invalidCycleStructure", detail)` for an invalid cycle.

- [ ] **Step 1: Add branch types and failing segmentation tests**

Add these exported types to `src/lib/cvTypes.ts`:

```ts
export type SweepDirection = 1 | -1;

export interface CvSweepPoint {
  potential: number;
  current: number;
  sourceIndex: number;
}

export interface CvSweepBranch {
  branchIndex: number;
  direction: SweepDirection;
  points: CvSweepPoint[];
  sharesStartWithPrevious: boolean;
}
```

Create `tests/cv-cycle.test.ts` with real-data assertions for:

```ts
expect(splitCvCycle(points([0, 1, 2, 1, 0]))).toMatchObject([
  { branchIndex: 0, direction: 1, sharesStartWithPrevious: false },
  { branchIndex: 1, direction: -1, sharesStartWithPrevious: true }
]);
expect(branches[0].points.map((point) => point.sourceIndex)).toEqual([0, 1, 2]);
expect(branches[1].points.map((point) => point.sourceIndex)).toEqual([2, 3, 4]);
```

Also assert:

- `0, 1, 2, 2, 1, 0` assigns source indices `[0,1,2]` and `[3,4,5]` with `sharesStartWithPrevious: false`.
- `0, 1, -1, 0` produces directions `1, -1, 1`.
- monotonic ascending and descending inputs produce one branch.
- more than two turns, an internal duplicate without a reversal, or a branch with fewer than two distinct potentials throws `CvCycleStructureError` with a stable reason.
- aligned series with different branch counts/directions throws `CvCycleStructureError("inconsistentBranches")`.

- [ ] **Step 2: Run the segmentation test and confirm RED**

Run:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\vitest\vitest.mjs' run tests/cv-cycle.test.ts
```

Expected: FAIL because `src/lib/cvCycle.ts` and its exports do not exist.

- [ ] **Step 3: Implement deterministic segmentation**

Create `src/lib/cvCycle.ts` with these public declarations:

```ts
import type { CvSeries, CvSweepBranch } from "./cvTypes";

export type CvCycleStructureReason =
  | "tooManyTurningPoints"
  | "duplicatePotential"
  | "branchPointCount"
  | "inconsistentBranches";

export class CvCycleStructureError extends Error {
  constructor(
    readonly reason: CvCycleStructureReason,
    readonly detail: Readonly<Record<string, unknown>> = {}
  ) {
    super(reason);
    this.name = "CvCycleStructureError";
  }
}

export function splitCvCycle(points: CvSeries["points"]): CvSweepBranch[];
export function splitAlignedCvCycles(series: CvSeries[]): CvSweepBranch[][];
```

Implement one pass over consecutive potential differences:

- validate finite values without mutating `points`
- a non-zero sign change at source index `i` closes the old branch at `i` and starts the new branch at the same source index (`sharesStartWithPrevious: true`)
- one zero-width edge is accepted only when the nearest non-zero directions on its two sides are opposite; close at the left source point and start at the right source point (`sharesStartWithPrevious: false`)
- reject any other zero-width edge
- reject a third direction change
- validate two distinct potentials per branch
- in `splitAlignedCvCycles`, compare branch count, direction, and `sharesStartWithPrevious` across all scan rates

- [ ] **Step 4: Preserve full points in `confirmCvSeries`**

Add `"invalidCycleStructure"` to `CvParseErrorCode`. Replace `selectFirstMonotonicSweep` and the whole-cycle `.sort(...)` call with:

```ts
const series = table.pairs.map((pair, seriesIndex) => ({
  label: pair.currentHeader,
  scanRate: confirmedRates[seriesIndex],
  points: collectPointsInRowOrder(table, pair)
}));

try {
  splitAlignedCvCycles(series);
} catch (error) {
  if (error instanceof CvCycleStructureError) {
    throw new CvParseError("invalidCycleStructure", {
      reason: error.reason,
      ...error.detail
    });
  }
  throw error;
}
return series;
```

Keep the existing cell validation and minimum-series checks. Delete `selectFirstMonotonicSweep` and `findNextPotentialDirection` after no callers remain.

- [ ] **Step 5: Replace first-sweep parsing expectations**

Update the complete-cycle CSV/XLSX tests to assert the exact five-point order:

```ts
[
  { potential: 0, current: 1 },
  { potential: 1, current: 2 },
  { potential: 2, current: 3 },
  { potential: 1, current: 20 },
  { potential: 0, current: 10 }
]
```

Add one two-turn parsed cycle and one invalid inconsistent-branch dataset.

- [ ] **Step 6: Run Task 1 tests and confirm GREEN**

Run:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\vitest\vitest.mjs' run tests/cv-cycle.test.ts tests/cv-parsing.test.ts
```

Expected: both files pass; no existing first-sweep assertion remains.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/lib/cvCycle.ts src/lib/cvTypes.ts src/lib/cvImport.ts src/lib/cvParsing.ts tests/cv-cycle.test.ts tests/cv-parsing.test.ts
git commit -m "feat: preserve complete CV cycles"
```

---

### Task 2: Build and sample branch-aware common grids

**Files:**
- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvAnalysis.ts`
- Modify: `src/lib/cvWorkflow.ts`
- Modify: `tests/cv-analysis.test.ts`
- Modify: `tests/cv-workflow.test.ts`

**Interfaces:**
- Adds `CvGridBranch` and required `branches` metadata to `InterpolatedCvData`.
- `interpolateCommonGrid(series)` consumes aligned cycle branches and returns one recombined sequential grid.
- `selectPointInterval(data, interval)` samples within every branch and returns valid rebased/overlapping branch spans.

- [ ] **Step 1: Add failing one-turn and two-turn interpolation tests**

Extend `src/lib/cvTypes.ts` with:

```ts
export interface CvGridBranch {
  branchIndex: number;
  direction: SweepDirection;
  startIndex: number;
  endIndex: number;
}

export interface InterpolatedCvData {
  potentials: number[];
  scanRates: number[];
  currents: number[][];
  branches?: CvGridBranch[];
}
```

The optional field keeps direct single-sweep fixtures compatible; analysis helpers treat an absent field as one ascending branch over the full array.

Add tests proving:

```ts
expect(grid.potentials).toEqual([0, 1, 2, 1, 0]);
expect(grid.branches).toEqual([
  { branchIndex: 0, direction: 1, startIndex: 0, endIndex: 2 },
  { branchIndex: 1, direction: -1, startIndex: 2, endIndex: 4 }
]);
expect(grid.currents[0]).toEqual([1, 2, 3, 20, 10]);
```

For a duplicated turning potential, expect `[0,1,2,2,1,0]` and non-overlapping branch spans `{0..2}` and `{3..5}`. Add a two-turn branch order test and a test whose branch grids require linear interpolation at different measured potentials.

- [ ] **Step 2: Run interpolation tests and confirm RED**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\vitest\vitest.mjs' run tests/cv-analysis.test.ts
```

Expected: FAIL because the current implementation globally sorts potentials and rejects duplicates.

- [ ] **Step 3: Implement branch-local interpolation**

Refactor `interpolateCommonGrid` to:

```ts
const cycles = splitAlignedCvCycles(series);
const branchResults = cycles[0].map((reference, branchIndex) =>
  interpolateAlignedBranch(
    cycles.map((cycle) => cycle[branchIndex]),
    series.map((item) => item.scanRate)
  )
);
return recombineBranchGrids(branchResults);
```

`interpolateAlignedBranch` must sort only a temporary branch copy ascending for binary interpolation, compute the overlap/union exactly as the current single-grid function does, and reverse the completed grid when `direction === -1`.

`recombineBranchGrids` omits the next branch's first sample only when `sharesStartWithPrevious` is true. Its `CvGridBranch` span starts at the preceding output index in that case; separately recorded equal-potential boundary rows remain separate indices.

Export or keep a focused `resolveGridBranches(data)` helper that supplies one full-array branch when `data.branches` is absent. Update `validateInterpolatedCvData` to require strict monotonicity inside each branch span, not globally. Add `"invalidCycleStructure"` to `CvAnalysisErrorCode`; if direct library input fails `splitAlignedCvCycles`, translate `CvCycleStructureError` to `CvAnalysisError("invalidCycleStructure")` so callers never receive a private helper error.

- [ ] **Step 4: Add failing per-branch point-interval tests**

For a recombined `0,1,2,3,2,1,0` grid and interval `2`, assert:

```ts
expect(selected.potentials).toEqual([0, 2, 3, 1, 0]);
expect(selected.branches).toEqual([
  { branchIndex: 0, direction: 1, startIndex: 0, endIndex: 2 },
  { branchIndex: 1, direction: -1, startIndex: 2, endIndex: 4 }
]);
```

Add a two-turn test proving all three branch boundaries remain selected even when the interval is `30`.

- [ ] **Step 5: Implement branch-local sampling**

In `selectPointInterval`, resolve branch spans, calculate `start, start + interval, ... end` for each span, always include `end`, union repeated shared-boundary indices, sort selected flat indices in original sequential order, and map every branch's original endpoints to their new indices.

Do not sample `data.potentials` as one global array.

- [ ] **Step 6: Run Task 2 tests and confirm GREEN**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\vitest\vitest.mjs' run tests/cv-cycle.test.ts tests/cv-analysis.test.ts tests/cv-workflow.test.ts
```

Expected: all branch interpolation and point-interval tests pass.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/lib/cvTypes.ts src/lib/cvAnalysis.ts src/lib/cvWorkflow.ts tests/cv-analysis.test.ts tests/cv-workflow.test.ts
git commit -m "feat: interpolate CV sweep branches"
```

---

### Task 3: Fit and integrate the recombined full loop

**Files:**
- Modify: `src/lib/cvTypes.ts`
- Modify: `src/lib/cvAnalysis.ts`
- Modify: `src/lib/cvWorkflow.ts`
- Modify: `tests/cv-analysis.test.ts`
- Modify: `tests/cv-workflow.test.ts`

**Interfaces:**
- Every `CvFitRecord<T>` gains required `sequenceIndex` and `branchIndex` identity.
- b-value and Dunn records remain in flat traversal order and may share potential values across branches.
- Dunn contributions integrate valid adjacent samples branch by branch with absolute widths.

- [ ] **Step 1: Add failing branch-identity fit tests**

Change `CvFitRecord<T>` to:

```ts
export interface CvFitRecord<T> {
  sequenceIndex: number;
  branchIndex: number;
  potential: number;
  fit: T | null;
  status: CvFitStatus;
}
```

Add a full-loop fixture in which potential `1` has different forward and return currents. Assert both b-value and Dunn attempts return two records at potential `1`, in scan order, with distinct `sequenceIndex` and branch indices `0` and `1`. Assert the two fits use only their own branch currents.

- [ ] **Step 2: Run fitting tests and confirm RED**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\vitest\vitest.mjs' run tests/cv-analysis.test.ts tests/cv-workflow.test.ts
```

Expected: FAIL because records do not yet expose branch or sequence identity.

- [ ] **Step 3: Attach branch identity to every fit record**

Resolve the branch for each flat potential index once, then include:

```ts
{
  sequenceIndex: potentialIndex,
  branchIndex: branchForSequenceIndex(data, potentialIndex).branchIndex,
  potential,
  fit,
  status
}
```

Apply this to success, insufficient-data, zero-current, and regression-failure paths. Update workflow classification by spreading the original record so identities survive R² classification.

- [ ] **Step 4: Add failing complete-loop Dunn integration tests**

Use coefficients with analytically simple constant capacitive/diffusion currents on an ascending and descending branch. Assert:

- descending widths contribute positively through `Math.abs(rightPotential - leftPotential)`
- both branches contribute to the final percentages
- a shared turning index is not double-integrated
- a separately duplicated turning potential creates no artificial cross-branch interval
- null coefficients break only intervals inside their own branch
- `validPointCount`, `sampledPointCount`, and coverage use the recombined flat grid

- [ ] **Step 5: Implement branch-local Dunn area integration**

Replace the single `for (index = 0; index < potentials.length - 1; ...)` loop with nested branch loops:

```ts
for (const branch of resolveGridBranches(data)) {
  for (let index = branch.startIndex; index < branch.endIndex; index += 1) {
    const width = Math.abs(data.potentials[index + 1] - data.potentials[index]);
    // retain existing null checks and trapezoidal magnitude integration
  }
}
```

Do not integrate from one non-overlapping branch's end index to the next branch's start index.

- [ ] **Step 6: Run Task 3 tests and confirm GREEN**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\vitest\vitest.mjs' run tests/cv-analysis.test.ts tests/cv-workflow.test.ts
```

Expected: all complete-loop fitting, R²-mask, and integration tests pass.

- [ ] **Step 7: Commit Task 3**

```powershell
git add src/lib/cvTypes.ts src/lib/cvAnalysis.ts src/lib/cvWorkflow.ts tests/cv-analysis.test.ts tests/cv-workflow.test.ts
git commit -m "feat: analyze complete CV loops"
```

---

### Task 4: Display, navigate, copy, and export branch-aware results

**Files:**
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/components/CvImportPanel.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `tests/cv-page.test.tsx`
- Modify: `tests/cv-import-panel.test.tsx`
- Modify: `tests/i18n.test.tsx`
- Modify: `tests/tools-markup.test.tsx`

**Interfaces:**
- Fitted tables and fitted-record CSVs include a branch column.
- Selected b fit is identified by `sequenceIndex`, not potential alone.
- Original, reconstructed, b-value, and Dunn chart point arrays retain flat traversal order.
- `invalidCycleStructure` maps to a visible bilingual message.

- [ ] **Step 1: Add failing full-loop page tests**

Expand the existing complete-cycle XLSX page test and add equivalent CSV/TXT coverage. For `0 → 1 → 2 → 1 → 0`, assert:

- original-current table rows are exactly `0,1,2,1,0`
- b-value and Dunn result rows contain both potential-`1` occurrences in branch order
- reconstructed arrays and their SVG path data traverse forward and return branches
- the tables expose `Sweep branch`, keep the 12-row viewport behavior, and copy the branch column plus all filtered rows
- b/Dunn fitted CSV headers include `Sweep branch`; rows preserve sequential order
- typing repeated potential `1` selects its first valid occurrence; Next advances to the later occurrence

- [ ] **Step 2: Run page tests and confirm RED**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\vitest\vitest.mjs' run tests/cv-page.test.tsx tests/cv-import-panel.test.tsx tests/i18n.test.tsx tests/tools-markup.test.tsx
```

Expected: FAIL because the page has no branch column/identity and the old complete-cycle expectations do not verify the return sweep.

- [ ] **Step 3: Add localized branch and cycle-error resources**

Add stable keys:

```ts
// en.ts
"cv.table.sweepBranch": "Sweep branch",
"cv.table.branchValue": "Branch {{branch}}",
"cv.error.invalidCycleStructure": "Each dataset must be one complete CV cycle with no more than two turning points and the same sweep structure at every scan rate.",

// zh.ts
"cv.table.sweepBranch": "扫描分支",
"cv.table.branchValue": "分支 {{branch}}",
"cv.error.invalidCycleStructure": "每组数据必须是一个完整 CV 周期，转折点不超过两个，且各扫描速率的扫描分支结构必须一致。",
```

Map `invalidCycleStructure` in `errorMessage` and verify both languages.

- [ ] **Step 4: Make record selection branch-aware**

Replace potential-only selected state with `selectedBSequenceIndex: number | undefined`. Derive the selected record by exact sequence identity. Keep `potentialInput` for manual entry; typed potential chooses the first valid record in traversal order. Previous/Next steps through `validBResultRecords` and updates both sequence identity and displayed potential.

`runAnalysis` initializes the first valid b record by its `sequenceIndex`; the all-low-R² behavior remains an empty selection with the quality summary visible.

- [ ] **Step 5: Add branch columns and preserve plot order**

Prepend or append the localized branch value consistently in `bRecordRow` and `dunnRecordRow`:

```ts
t("cv.table.branchValue", { branch: record.branchIndex + 1 })
```

Use `record.sequenceIndex` when mapping b-chart values to the recombined grid. Keep original and reconstructed chart arrays unsorted. Do not call `.sort(...)` on potentials or chart points; scan-rate lists may remain numerically sorted.

- [ ] **Step 6: Update fitted-record CSVs and clipboard expectations**

Add the localized branch header and branch value to `cv-b-value-results.csv` and `cv-dunn-k1-k2.csv`. Preserve the existing R² filter before serialization. The generic `DataTable` automatically copies the same branch-aware rows; keep its full-source-row behavior unchanged.

- [ ] **Step 7: Run Task 4 tests and confirm GREEN**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\vitest\vitest.mjs' run tests/cv-page.test.tsx tests/cv-import-panel.test.tsx tests/i18n.test.tsx tests/tools-markup.test.tsx
```

Expected: full-loop UI, branch identity, copy, CSV, error, and bilingual tests pass.

- [ ] **Step 8: Commit Task 4**

```powershell
git add src/pages/CvKineticsPage.tsx src/components/CvImportPanel.tsx src/locales/en.ts src/locales/zh.ts tests/cv-page.test.tsx tests/cv-import-panel.test.tsx tests/i18n.test.tsx tests/tools-markup.test.tsx
git commit -m "feat: present complete CV loop results"
```

---

### Task 5: Document and verify the complete-cycle workflow

**Files:**
- Modify: `README.md`
- Modify: `tests/cv-parsing.test.ts`
- Modify: `tests/cv-page.test.tsx`
- Verify: all source and test files changed in Tasks 1–4

**Interfaces:**
- Provides end-to-end evidence for equivalent CSV, UTF-16 TXT, and XLSX complete-cycle workflows.
- Produces a clean, buildable, reviewed branch ready for the already authorized merge and deployment.

- [ ] **Step 1: Add equivalent-format end-to-end assertions**

Use the same one-turn numeric dataset in CSV, UTF-16 TXT, and generated XLSX tests. For each format assert the imported/confirmed original sequence, branch metadata, b/Dunn result row counts/order, and complete-loop Dunn chart availability. Keep the existing header/headerless and `XYYYYY`/`XYXYXY` tests intact.

- [ ] **Step 2: Update README scientific behavior**

Replace the first-sweep description with explicit statements that:

- one dataset is retained as one sequential cycle
- zero to two turning points are supported
- branches are split only internally
- equal-potential forward/return currents are never averaged
- point interval applies per branch
- Dunn areas sum branch-local `|ΔE|`
- plots and existing exports represent the complete recombined loop
- more than two turns or inconsistent sweep structures produce a visible error

- [ ] **Step 3: Run all tests**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\vitest\vitest.mjs' run
```

Expected: zero failed files and zero failed tests.

- [ ] **Step 4: Run the production build**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\typescript\bin\tsc'; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'D:\codex_communication\tmcc-database\node_modules\vite\bin\vite.js' build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' '.\scripts\create-route-entries.mjs'
```

Expected: TypeScript, Vite, and route generation pass. The existing large-chunk warning is non-blocking.

- [ ] **Step 5: Audit scope and whitespace**

```powershell
git diff main...HEAD --check
git diff main...HEAD --stat
git status --short --branch
```

Expected: no whitespace errors, no unrelated files, and a clean named branch.

- [ ] **Step 6: Commit documentation/test completion**

```powershell
git add README.md tests/cv-parsing.test.ts tests/cv-page.test.tsx
git commit -m "docs: describe complete CV cycle workflow"
```

- [ ] **Step 7: Request final independent review**

The reviewer must inspect the full `main...HEAD` diff and confirm: no first-sweep truncation remains; branch identity prevents forward/return mixing; one- and two-turn cycles preserve order; point sampling retains boundaries; Dunn integration uses branch-local absolute widths without cross-boundary intervals; R² filtering, 12-row scrolling, copy behavior, bilingual UI, and all three import formats remain intact.

- [ ] **Step 8: Integrate and deploy after review**

Because the user explicitly authorized option 1 and online deployment: merge the reviewed feature branch into `main`, rerun the full suite on merged `main`, push `main`, monitor `.github/workflows/deploy-pages.yml` to success, and verify `https://tmccdb.org/tools/cv-kinetics/` loads the new complete-cycle asset and behavior. Only then remove the owned `.worktrees/cv-result-table-usability` worktree and delete the merged feature branch.
