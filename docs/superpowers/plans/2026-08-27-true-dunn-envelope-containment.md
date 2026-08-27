# True Dunn CV-Envelope Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every final Dunn capacitive point lie inside the local measured forward/reverse CV envelope, with one canonical constrained record stream shared by integration, plotting, shaded areas, diagnostics, and export.

**Architecture:** Preserve the existing shared regularized `g(V)` optimizer as the target generator. Add a pure minimum-projection primitive, rebuild aligned and native ordered reconstruction through that primitive, integrate canonical ordered records, and expose residual-envelope diagnostics without independently fitting capacitive branches.

**Tech Stack:** React 19, TypeScript 5.7, Vite 5, Vitest 2, existing PCHIP/CV normalization modules, no new dependency.

## Global Constraints

- Keep `i_cap,target,b(V) = g(V) * i_raw,b(V)` with `0 <= g(V) <= 1` as the shared optimization target.
- Preserve R² threshold and weighted modes, low-anchor stabilization, automatic lambda, turning-point trim, PCHIP, complete-cycle order, and sign preservation.
- The final projection is the nearest point in the intersection of the local CV envelope and the branch signed-magnitude interval.
- Plotting, filling, integration, reconstructed-current CSV, figure export, and diagnostics consume the same canonical constrained records.
- Do not independently smooth or fit either capacitive-current branch.
- Residual envelope violation above `1e-10 * max(1, maximum current magnitude)` fails reconstruction visibly.
- Preserve English/Simplified Chinese support and existing imports.
- Do not merge or deploy automatically.

---

### Task 1: Add the envelope projection primitive and diagnostic types

**Files:**
- Modify: `src/lib/cvTypes.ts:96-150`
- Modify: `src/lib/cvDunnQuality.ts:18-80`
- Test: `tests/cv-dunn-quality.test.ts:14-58`

**Interfaces:**
- Produces: `projectCapacitiveToEnvelope(originalCurrent, oppositeCurrent, targetCurrent): EnvelopeProjection`
- Produces: `measureEnvelopeViolation(records): EnvelopeViolationDiagnostics`
- Extends: `DunnOrderedRecord` and `DunnDiagnostics` with envelope/correction fields used by later tasks.

- [ ] **Step 1: Write failing projection tests**

Add imports and these tests to `tests/cv-dunn-quality.test.ts`:

```ts
import {
  measureEnvelopeViolation,
  projectCapacitiveToEnvelope
} from "../src/lib/cvDunnQuality";

it("projects same-sign targets to the nearest feasible CV-envelope value", () => {
  expect(projectCapacitiveToEnvelope(4, 2, 1)).toEqual({
    envelopeLower: 2,
    envelopeUpper: 4,
    feasibleLower: 2,
    feasibleUpper: 4,
    targetCurrent: 1,
    constrainedCurrent: 2,
    correctionMagnitude: 1,
    effectiveFraction: 0.5
  });
  expect(projectCapacitiveToEnvelope(-4, -2, -1)).toEqual({
    envelopeLower: -4,
    envelopeUpper: -2,
    feasibleLower: -4,
    feasibleUpper: -2,
    targetCurrent: -1,
    constrainedCurrent: -2,
    correctionMagnitude: 1,
    effectiveFraction: 0.5
  });
});

it("leaves opposite-sign and already feasible shared-g targets unchanged", () => {
  expect(projectCapacitiveToEnvelope(4, -3, 1).constrainedCurrent).toBe(1);
  expect(projectCapacitiveToEnvelope(-4, 3, -1).constrainedCurrent).toBe(-1);
  expect(projectCapacitiveToEnvelope(4, 2, 3).correctionMagnitude).toBe(0);
});

it("measures signed and absolute residual envelope violation", () => {
  const diagnostics = measureEnvelopeViolation([
    { envelopeLower: -2, envelopeUpper: 3, capacitiveCurrent: 3.25 },
    { envelopeLower: -4, envelopeUpper: -1, capacitiveCurrent: -4.5 }
  ]);
  expect(diagnostics).toEqual({
    maximumUpperViolation: 0.25,
    maximumLowerViolation: 0.5,
    maximumAbsoluteViolation: 0.5,
    worstIndex: 1
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-dunn-quality.test.ts
```

Expected: FAIL because `projectCapacitiveToEnvelope` and `measureEnvelopeViolation` do not exist.

- [ ] **Step 3: Add exact types and the minimal projection implementation**

Add to `src/lib/cvTypes.ts`:

```ts
export interface EnvelopeProjection {
  envelopeLower: number;
  envelopeUpper: number;
  feasibleLower: number;
  feasibleUpper: number;
  targetCurrent: number;
  constrainedCurrent: number;
  correctionMagnitude: number;
  effectiveFraction: number;
}

export interface EnvelopeViolationDiagnostics {
  maximumUpperViolation: number;
  maximumLowerViolation: number;
  maximumAbsoluteViolation: number;
  worstIndex: number | null;
}
```

Extend `DunnOrderedRecord`:

```ts
oppositeCurrent: number;
envelopeLower: number;
envelopeUpper: number;
targetCapacitiveCurrent: number;
effectiveFraction: number;
correctionMagnitude: number;
```

Extend `DunnDiagnostics`:

```ts
maximumEnvelopeCorrection: number;
maximumUpperEnvelopeViolation: number;
maximumLowerEnvelopeViolation: number;
maximumAbsoluteEnvelopeViolation: number;
correctedPointCount: number;
correctedPointPercent: number;
maximumEffectiveFractionDeparture: number;
maximumAdjacentGJump: number;
gSmoothnessWarning: boolean;
```

Add to `src/lib/cvDunnQuality.ts`:

```ts
export function projectCapacitiveToEnvelope(
  originalCurrent: number,
  oppositeCurrent: number,
  targetCurrent: number
): EnvelopeProjection {
  if (![originalCurrent, oppositeCurrent, targetCurrent].every(Number.isFinite)) {
    throw new CvAnalysisError("invalidDataShape");
  }
  const envelopeLower = Math.min(originalCurrent, oppositeCurrent);
  const envelopeUpper = Math.max(originalCurrent, oppositeCurrent);
  const signedLower = Math.min(0, originalCurrent);
  const signedUpper = Math.max(0, originalCurrent);
  const feasibleLower = Math.max(envelopeLower, signedLower);
  const feasibleUpper = Math.min(envelopeUpper, signedUpper);
  if (feasibleLower > feasibleUpper) throw new CvAnalysisError("reconstructionFailed");
  const constrainedCurrent = cleanZero(Math.min(feasibleUpper, Math.max(feasibleLower, targetCurrent)));
  return {
    envelopeLower,
    envelopeUpper,
    feasibleLower,
    feasibleUpper,
    targetCurrent,
    constrainedCurrent,
    correctionMagnitude: Math.abs(constrainedCurrent - targetCurrent),
    effectiveFraction: originalCurrent === 0 ? 0 : constrainedCurrent / originalCurrent
  };
}

export function measureEnvelopeViolation(
  records: Array<Pick<DunnOrderedRecord, "envelopeLower" | "envelopeUpper" | "capacitiveCurrent">>
): EnvelopeViolationDiagnostics {
  return records.reduce<EnvelopeViolationDiagnostics>((result, record, index) => {
    const upper = Math.max(0, record.capacitiveCurrent - record.envelopeUpper);
    const lower = Math.max(0, record.envelopeLower - record.capacitiveCurrent);
    const absolute = Math.max(upper, lower);
    return {
      maximumUpperViolation: Math.max(result.maximumUpperViolation, upper),
      maximumLowerViolation: Math.max(result.maximumLowerViolation, lower),
      maximumAbsoluteViolation: Math.max(result.maximumAbsoluteViolation, absolute),
      worstIndex: absolute > result.maximumAbsoluteViolation ? index : result.worstIndex
    };
  }, {
    maximumUpperViolation: 0,
    maximumLowerViolation: 0,
    maximumAbsoluteViolation: 0,
    worstIndex: null
  });
}
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Task 1 command again. Expected: the new primitive tests pass; older fixture constructors may fail TypeScript only after the new required record fields, which Task 2 updates.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/lib/cvTypes.ts src/lib/cvDunnQuality.ts tests/cv-dunn-quality.test.ts
git commit -m "feat: add Dunn envelope projection primitive"
```

---

### Task 2: Build canonical constrained ordered records and integrate them

**Files:**
- Modify: `src/lib/cvDunnQuality.ts:108-391`
- Modify: `tests/cv-dunn-quality.test.ts:59-473`

**Interfaces:**
- Consumes: `projectCapacitiveToEnvelope` and extended record/diagnostic types from Task 1.
- Produces: `integrateOrderedMagnitude(records, currentField)`.
- Changes: `reconstructDunnContribution` uses envelope projection for aligned arrays and native ordered records, and calculates contribution percentages from ordered records.

- [ ] **Step 1: Write failing canonical-record and integration tests**

Add tests that construct a same-sign loop and assert the exact correction:

```ts
it("uses the local opposite branch to constrain every canonical ordered record", () => {
  const cycle = normalizeCvCycle([
    { potential: -1, current: 2 },
    { potential: 0, current: 4 },
    { potential: 1, current: 6 },
    { potential: 0, current: 3 },
    { potential: -1, current: 1 }
  ]);
  const alignedGrid = makeWideAlignedGrid(cycle);
  const contribution = reconstructDunnContribution(makeContributionInput(alignedGrid, [0.25, 0.25, 0.25]));

  for (const record of contribution.plotPath) {
    expect(record.capacitiveCurrent).toBeGreaterThanOrEqual(record.envelopeLower - 1e-12);
    expect(record.capacitiveCurrent).toBeLessThanOrEqual(record.envelopeUpper + 1e-12);
    expect(record.capacitiveCurrent + record.diffusionCurrent).toBeCloseTo(record.originalCurrent, 12);
  }
  expect(contribution.plotPath.some((record) => record.correctionMagnitude > 0)).toBe(true);
});

it("calculates contribution areas from the same canonical ordered records", () => {
  const contribution = reconstructDunnContribution(makeContributionInputFromPoints([
    { potential: -1, current: 2 },
    { potential: 0, current: 4 },
    { potential: 1, current: 6 },
    { potential: 0, current: 3 },
    { potential: -1, current: 1 }
  ], [0.25, 0.25, 0.25]));
  const total = integrateOrderedMagnitude(contribution.plotPath, "originalCurrent");
  const capacitive = integrateOrderedMagnitude(contribution.plotPath, "capacitiveCurrent");
  expect(contribution.capacitivePercent).toBeCloseTo(100 * capacitive / total, 10);
});

it("keeps synchronized zero-crossing records complete", () => {
  const contribution = reconstructDunnContribution(makeContributionInputFromPoints([
    { potential: -1, current: -2 },
    { potential: 0, current: 2 },
    { potential: 1, current: 4 },
    { potential: 0, current: -2 },
    { potential: -1, current: -4 }
  ], [0.5, 0.5, 0.5]));
  const synthetic = contribution.plotPath.find((record) => record.synthetic)!;
  expect(synthetic).toMatchObject({
    originalCurrent: 0,
    oppositeCurrent: expect.any(Number),
    targetCapacitiveCurrent: 0,
    capacitiveCurrent: 0,
    diffusionCurrent: 0,
    correctionMagnitude: 0
  });
});
```

Add a shared test helper to remove duplicated input literals:

```ts
function makeContributionInput(alignedGrid: CvAlignedBranchGrid, g: number[]): DunnContributionInput {
  return {
    alignedGrid,
    dunnRecords: makeDunnRecords(alignedGrid.potentials),
    optimized: {
      g,
      diagnostics: { baseLambda: 0.1, lambda: 0.1, smoothingMultiplier: 1, iterations: 12, converged: true, optimalityResidual: 0, fidelity: 0, roughness: 0 }
    },
    stabilization: makeStabilizationDiagnostics(),
    fractions: makeFractions(alignedGrid.potentials),
    scanRate: 1,
    seriesIndex: 0,
    mode: "threshold",
    threshold: 0.95,
    resolvedTurningPointTrim: 0.05
  };
}

function makeContributionInputFromPoints(
  points: Array<{ potential: number; current: number }>,
  g: number[]
): DunnContributionInput {
  return makeContributionInput(makeWideAlignedGrid(normalizeCvCycle(points)), g);
}
```

- [ ] **Step 2: Run the test file and verify RED**

Expected failures: missing `integrateOrderedMagnitude`, missing record fields, and same-sign points below/above the local envelope.

- [ ] **Step 3: Implement opposite-branch evaluation and canonical records**

In `cvDunnQuality.ts`, add:

```ts
function branchInterpolation(cycle: NormalizedCvCycle, branch: CvBranchKind) {
  const points = branch === "forward" ? cycle.forward.points : [...cycle.reverse.points].reverse();
  return {
    potentials: points.map((point) => point.potential),
    currents: points.map((point) => point.current)
  };
}

function evaluateOppositeCurrent(
  cycle: NormalizedCvCycle,
  branch: CvBranchKind,
  potential: number
): number {
  const opposite = branchInterpolation(cycle, branch === "forward" ? "reverse" : "forward");
  const minimum = opposite.potentials[0]!;
  const maximum = opposite.potentials.at(-1)!;
  const tolerance = cycle.nativePotentialInterval;
  if (potential < minimum - tolerance || potential > maximum + tolerance) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  const boundedPotential = Math.min(maximum, Math.max(minimum, potential));
  return pchipInterpolate(opposite.potentials, opposite.currents, [boundedPotential])[0]!;
}

function makeOrderedRecord(
  point: { potential: number; current: number },
  branch: CvBranchKind,
  sourceIndex: number,
  cycle: NormalizedCvCycle,
  fraction: number
): DunnOrderedRecord {
  const oppositeCurrent = evaluateOppositeCurrent(cycle, branch, point.potential);
  const projection = projectCapacitiveToEnvelope(point.current, oppositeCurrent, fraction * point.current);
  const capacitiveCurrent = projection.constrainedCurrent;
  return {
    potential: point.potential,
    current: capacitiveCurrent,
    originalCurrent: point.current,
    oppositeCurrent,
    envelopeLower: projection.envelopeLower,
    envelopeUpper: projection.envelopeUpper,
    targetCapacitiveCurrent: projection.targetCurrent,
    capacitiveCurrent,
    diffusionCurrent: cleanZero(point.current - capacitiveCurrent),
    g: fraction,
    effectiveFraction: projection.effectiveFraction,
    correctionMagnitude: projection.correctionMagnitude,
    branch,
    sourceIndex,
    synthetic: false
  };
}
```

Replace the body of `reconstructOriginalOrderPath` so each original record calls `makeOrderedRecord`. Extend `insertSharedZeroCrossings` by linearly interpolating `oppositeCurrent`, envelope bounds, target current, `g`, and effective fraction at the measured-current zero; set constrained/diffusion/correction to zero and preserve branch/source semantics.

- [ ] **Step 4: Constrain aligned arrays and integrate ordered runs**

For every aligned-grid potential, project forward against reverse and reverse against forward:

```ts
function reconstructEnvelopePair(forward: number, reverse: number, g: number) {
  const forwardProjection = projectCapacitiveToEnvelope(forward, reverse, g * forward);
  const reverseProjection = projectCapacitiveToEnvelope(reverse, forward, g * reverse);
  return {
    forward: forwardProjection.constrainedCurrent,
    reverse: reverseProjection.constrainedCurrent
  };
}
```

Export and use canonical integration:

```ts
export function integrateOrderedMagnitude(
  records: DunnOrderedRecord[],
  field: "originalCurrent" | "capacitiveCurrent" | "diffusionCurrent"
): number {
  let area = 0;
  for (let index = 1; index < records.length; index += 1) {
    const left = records[index - 1]!;
    const right = records[index]!;
    if (left.branch !== right.branch) continue;
    const width = Math.abs(right.potential - left.potential);
    area += width * (Math.abs(left[field]) + Math.abs(right[field])) / 2;
  }
  return area;
}
```

Calculate total, capacitive, and diffusion areas from `plotPath` only. Keep aligned arrays for fit-grid traceability, but never use them for contribution percentages or page geometry.

- [ ] **Step 5: Update validation and diagnostics**

Validate every ordered record against envelope and signed branch bounds. Compute:

```ts
const envelope = measureEnvelopeViolation(plotPath);
const corrected = plotPath.filter((record) => record.correctionMagnitude > tolerance);
const maximumEnvelopeCorrection = Math.max(0, ...plotPath.map((record) => record.correctionMagnitude));
const maximumEffectiveFractionDeparture = Math.max(0, ...plotPath.map((record) => Math.abs(record.effectiveFraction - record.g)));
const gDeltas = optimized.g.slice(1).map((value, index) => Math.abs(value - optimized.g[index]!));
const maximumAdjacentGJump = Math.max(0, ...gDeltas);
const medianGJump = medianOrNull(gDeltas) ?? 0;
const gSmoothnessWarning = maximumAdjacentGJump > 0.2 && maximumAdjacentGJump > 8 * medianGJump;
```

Throw `reconstructionFailed` when `maximumAbsoluteEnvelopeViolation` exceeds the scale-aware tolerance. Update `makeCompleteContribution` and `orderedRecord` test helpers with all required zero-valued diagnostics and envelope fields.

- [ ] **Step 6: Run Dunn unit tests and verify GREEN**

Run:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-dunn-quality.test.ts
```

Expected: all Dunn-quality tests pass.

- [ ] **Step 7: Commit Task 2**

```powershell
git add src/lib/cvDunnQuality.ts tests/cv-dunn-quality.test.ts
git commit -m "fix: constrain Dunn currents to the CV envelope"
```

---

### Task 3: Prove NCP/BP150 and high-rate envelope containment

**Files:**
- Modify: `tests/cv-workflow.test.ts:156-310`
- Modify: `tests/fixtures/cvRegressionData.ts:11-85` to add a deterministic same-sign interval while preserving existing fixture traits.

**Interfaces:**
- Consumes: completed `DunnContribution.plotPath` and diagnostics.
- Produces: regression evidence for every scan rate and explicit highest-rate checks.

- [ ] **Step 1: Add a reusable invariant assertion**

```ts
function expectEnvelopeContained(result: CvWorkflowResult) {
  for (const contribution of result.contributions) {
    expect(contribution.g.every((value) => value >= 0 && value <= 1)).toBe(true);
    for (const record of contribution.plotPath) {
      const tolerance = 1e-10 * Math.max(1, Math.abs(record.originalCurrent), Math.abs(record.oppositeCurrent));
      expect(record.capacitiveCurrent).toBeGreaterThanOrEqual(record.envelopeLower - tolerance);
      expect(record.capacitiveCurrent).toBeLessThanOrEqual(record.envelopeUpper + tolerance);
      expect(Math.abs(record.capacitiveCurrent)).toBeLessThanOrEqual(Math.abs(record.originalCurrent) + tolerance);
      expect(record.capacitiveCurrent + record.diffusionCurrent).toBeCloseTo(record.originalCurrent, 10);
    }
    expect(contribution.diagnostics.maximumAbsoluteEnvelopeViolation).toBeLessThanOrEqual(1e-10);
  }
}
```

- [ ] **Step 2: Add NCP/BP150 mode and highest-rate tests**

```ts
it.each([
  ["NCP", makeNcpRegressionSeries],
  ["BP150", makeBp150RegressionSeries]
])("keeps every %s scan rate inside its local CV envelope", (_name, makeSeries) => {
  for (const mode of ["threshold", "weighted"] as const) {
    const result = analyzeCvWorkflow(makeSeries(), makeSettings(mode));
    expectEnvelopeContained(result);
    const highest = result.contributions.reduce((best, item) => item.scanRate > best.scanRate ? item : best);
    expect(highest.diagnostics.maximumAbsoluteEnvelopeViolation).toBeLessThanOrEqual(1e-10);
  }
});
```

- [ ] **Step 3: Verify RED before relying on Task 2**

On the parent commit before Task 2, run the workflow test and confirm a same-sign fixture reports at least one envelope violation. After Task 2, rerun and expect GREEN. Record both outputs in the implementation notes or commit message body.

- [ ] **Step 4: Run the scientific regression subset**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-workflow.test.ts tests/cv-dunn-quality.test.ts tests/cv-dunn-reconstruction.test.ts tests/cv-dunn-stabilization.test.ts
```

Expected: all files pass in threshold and weighted modes.

- [ ] **Step 5: Commit Task 3**

```powershell
git add tests/cv-workflow.test.ts tests/fixtures/cvRegressionData.ts
git commit -m "test: verify Dunn envelope containment at every rate"
```

---

### Task 4: Use constrained records in the page, export, and bilingual diagnostics

**Files:**
- Modify: `src/pages/CvKineticsPage.tsx:220-272, 400-470, 724-832, 1040-1208`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `tests/cv-page.test.tsx:373-577, 728-978, 1159-1251`
- Modify: `tests/i18n.test.tsx`

**Interfaces:**
- Consumes: canonical ordered records and envelope diagnostics.
- Produces: identical plotted, table, CSV, and integrated constrained values.

- [ ] **Step 1: Write failing page/export tests**

Extend the main successful-analysis test:

```ts
const chart = view.querySelector('[data-export-id="cv-dunn-chart"]')!;
expect(chart.querySelectorAll('[data-series-id="original"]')).toHaveLength(1);
expect(chart.querySelectorAll('[data-series-id="capacitive-forward"], [data-series-id="capacitive-reverse"]')).toHaveLength(2);
expect(chart.querySelectorAll('[data-polygon-series-id="capacitive-area"]')).toHaveLength(1);

await click(view, "cv-capacitive-current.csv");
const capacitiveCsv = await readBlob(blobs.at(-1)!);
expect(capacitiveCsv).toContain("Envelope lower current");
expect(capacitiveCsv).toContain("Envelope upper current");
expect(capacitiveCsv).toContain("Target capacitive current");
expect(capacitiveCsv).toContain("Envelope correction magnitude");
expect(capacitiveCsv).toContain("Maximum absolute envelope violation");
```

Export `makeDunnChart`, `makeDunnPolygons`, and `makeDunnAreas` from `CvKineticsPage.tsx` for deterministic tests. Parse the exported ordered rows, call those three helpers with the same `selectedContribution.plotPath`, and assert point-for-point original/capacitive values before SVG scaling. Also assert that the contribution-table percentage equals `100 * integrateOrderedMagnitude(plotPath, "capacitiveCurrent") / integrateOrderedMagnitude(plotPath, "originalCurrent")` for the selected scan rate.

- [ ] **Step 2: Run the page test and verify RED**

Expected: missing new CSV columns and diagnostics.

- [ ] **Step 3: Update page tables and CSV rows**

Use `selectedContribution.plotPath` for the reconstructed-current table instead of combining aligned arrays. Export these columns for both capacitive and diffusion files:

```ts
[
  scanRate,
  sequenceIndex,
  record.sourceIndex,
  localizedBranch,
  record.potential,
  record.originalCurrent,
  record.oppositeCurrent,
  record.envelopeLower,
  record.envelopeUpper,
  record.g,
  record.targetCapacitiveCurrent,
  record.effectiveFraction,
  capacitive ? record.capacitiveCurrent : record.diffusionCurrent,
  record.correctionMagnitude,
  item.diagnostics.maximumAbsoluteEnvelopeViolation,
  ...metadataValues
]
```

Do not add display-only smoothing. Continue calling `sampleDunnPlotPath` once and derive line series and polygons from that same sampled record array.

- [ ] **Step 4: Add stable bilingual keys**

Add matching keys to `en.ts` and `zh.ts`:

```ts
"cv.dunn.envelopeCorrection": "Envelope correction",
"cv.dunn.envelopeViolation": "Residual envelope violation",
"cv.dunn.smoothnessWarning": "The optimized g(V) contains an unusually large adjacent change.",
"cv.export.oppositeCurrent": "Opposite-branch current",
"cv.export.envelopeLower": "Envelope lower current",
"cv.export.envelopeUpper": "Envelope upper current",
"cv.export.targetCapacitiveCurrent": "Target capacitive current",
"cv.export.effectiveFraction": "Effective capacitive fraction",
"cv.export.envelopeCorrection": "Envelope correction magnitude",
"cv.export.maximumEnvelopeViolation": "Maximum absolute envelope violation"
```

Chinese values:

```ts
"cv.dunn.envelopeCorrection": "包络约束修正",
"cv.dunn.envelopeViolation": "残余包络越界",
"cv.dunn.smoothnessWarning": "优化后的 g(V) 存在异常偏大的相邻变化。",
"cv.export.oppositeCurrent": "另一分支电流",
"cv.export.envelopeLower": "包络下边界电流",
"cv.export.envelopeUpper": "包络上边界电流",
"cv.export.targetCapacitiveCurrent": "目标电容电流",
"cv.export.effectiveFraction": "有效电容比例",
"cv.export.envelopeCorrection": "包络修正量",
"cv.export.maximumEnvelopeViolation": "最大绝对包络越界量"
```

- [ ] **Step 5: Run page and i18n tests and verify GREEN**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-page.test.tsx tests/i18n.test.tsx
```

- [ ] **Step 6: Run Task 4 verification and commit**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/typescript/bin/tsc' --noEmit
git diff --check
git add src/pages/CvKineticsPage.tsx src/locales/en.ts src/locales/zh.ts tests/cv-page.test.tsx tests/i18n.test.tsx
git commit -m "feat: expose Dunn envelope diagnostics consistently"
```

Expected: TypeScript and focused tests pass; worktree contains only planned changes.

---

## Plan 1 Completion Checkpoint

Before starting the peak-b-value plan, run:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/vitest/vitest.mjs' run tests/cv-dunn-quality.test.ts tests/cv-workflow.test.ts tests/cv-page.test.tsx
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'node_modules/typescript/bin/tsc' --noEmit
git status --short
```

Expected: all focused tests and TypeScript pass; only intentional uncommitted files, if any, are listed.
