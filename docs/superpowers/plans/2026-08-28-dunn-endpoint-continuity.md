# Dunn Endpoint Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both capacitive boundary curves visibly cover and reconnect across the complete NCP CV potential range without changing shared g(V), Dunn percentages, integration, or exports.

**Architecture:** Keep analysis and ordered scientific data unchanged. Repair only chart representation by sharing a singly recorded reversal point between adjacent boundary displays and reserving eight original points at both ends of every branch before deterministic downsampling.

**Tech Stack:** React 19, TypeScript 5.7, Vite 5.4, Vitest 2.1, existing SVG scientific charts.

## Global Constraints

- Work only on `fix-dunn-literature-plot`; do not merge `main`.
- Preserve `i_cap,f(V) = g(V) * i_f(V)` and `i_cap,r(V) = g(V) * i_r(V)` with one shared `0 <= g(V) <= 1`.
- Do not rotate curves, move potentials, force `g(V) = 1`, hard-clip, delete points, or change percentages.
- A singly recorded reversal is shared only by display boundaries; scientific records remain single and ordered.
- A doubly recorded reversal with different currents remains separate and is not averaged.
- Use NCP as the only requested regression dataset.

---

### Task 1: Share single-record turning points between boundary displays

**Files:**
- Modify: `tests/cv-page.test.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`

**Interfaces:**
- Consumes: ordered `DunnContribution["plotPath"]`.
- Produces: forward and reverse boundary point sequences that share a real single-record reversal.

- [ ] **Step 1: Write the failing page test**

Strengthen `reconnects capacitive boundaries to the selected curve's true turning endpoints` so each dashed boundary independently covers both extremes:

```ts
const originalXs = pathXs(chart.querySelector<SVGPathElement>('[data-series-id="original"]')?.getAttribute("d") ?? "");
const expectedMinimum = Math.min(...originalXs);
const expectedMaximum = Math.max(...originalXs);
for (const id of ["capacitive-forward", "capacitive-reverse"]) {
  const boundaryXs = pathXs(chart.querySelector<SVGPathElement>(`[data-series-id="${id}"]`)?.getAttribute("d") ?? "");
  expect(Math.min(...boundaryXs)).toBeCloseTo(expectedMinimum, 10);
  expect(Math.max(...boundaryXs)).toBeCloseTo(expectedMaximum, 10);
}
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/cv-page.test.tsx -t "reconnects capacitive boundaries"`

Expected: FAIL because the reverse boundary omits the singly recorded maximum turning point.

- [ ] **Step 3: Implement the minimal display-topology fix**

Add this focused helper contract in `CvKineticsPage.tsx`:

```ts
function isDisplaySharedTurningPoint(
  previous: DunnContribution["plotPath"][number] | undefined,
  turning: DunnContribution["plotPath"][number],
  next: DunnContribution["plotPath"][number] | undefined
): boolean
```

Return true only when all three records exist, `turning.synthetic === false`, adjacent branch labels differ, and the potential deltas around `turning` change sign. In `makeBranchBoundaryPoints`, prepend or append that real reversal to the adjacent display run without mutating `plotPath`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/cv-page.test.tsx -t "reconnects capacitive boundaries"`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add tests/cv-page.test.tsx src/pages/CvKineticsPage.tsx`

Run: `git commit -m "fix: share Dunn turning points in boundary plots"`

---

### Task 2: Preserve endpoint neighborhoods during chart sampling

**Files:**
- Modify: `tests/cv-page.test.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`

**Interfaces:**
- Consumes: full ordered path and display limit.
- Produces: sampled path retaining the first and last eight original records of every branch run.

- [ ] **Step 1: Write the failing sampling test**

Extend `preserves branch endpoints while uniformly sampling more than 4,000 synthetic crossings` to build a `Set` of retained original-path positions and assert that positions `0..7`, `forwardOriginalCount-8..forwardOriginalCount-1`, `forwardOriginalCount..forwardOriginalCount+7`, and `originalCount-8..originalCount-1` are all present.

```ts
const retainedPositions = new Set(sampled.map((record) => sourcePositions.get(record)!));
const expectedNeighborhoods = [
  [0, 7],
  [forwardOriginalCount - 8, forwardOriginalCount - 1],
  [forwardOriginalCount, forwardOriginalCount + 7],
  [originalCount - 8, originalCount - 1]
] as const;
for (const [start, end] of expectedNeighborhoods) {
  for (let index = start; index <= end; index += 1) expect(retainedPositions.has(index)).toBe(true);
}
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/cv-page.test.tsx -t "preserves branch endpoints while uniformly sampling"`

Expected: FAIL because only run endpoints are reserved now.

- [ ] **Step 3: Implement eight-point reservation**

Add `const DUNN_ENDPOINT_NEIGHBORHOOD_POINT_COUNT = 8;`. When discovering a branch run `[runStart, runEnd]`, reserve all indices from `runStart` through `min(runEnd, runStart + 7)` and from `max(runStart, runEnd - 7)` through `runEnd`. Calculate the remaining synthetic/extreme-point budget only after these reservations and keep the existing maximum output limit.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/cv-page.test.tsx -t "preserves branch endpoints while uniformly sampling"`

Expected: PASS and sampled length remains at or below `MAX_CHART_OUTPUT_POINTS`.

- [ ] **Step 5: Commit**

Run: `git add tests/cv-page.test.tsx src/pages/CvKineticsPage.tsx`

Run: `git commit -m "fix: retain Dunn endpoint neighborhoods in plots"`

---

### Task 3: Verify the NCP scientific and visual result

**Files:**
- Use: `tests/cv-workflow.test.ts`
- Use: `tests/fixtures/cvRegressionData.ts`
- Use: `C:/Users/ThinkPad/Downloads/NCP-CV——1.csv`

**Interfaces:**
- Consumes: NCP regression fixture and user-provided NCP CSV.
- Produces: automated and visual evidence for full-range, bounded, continuous NCP output.

- [ ] **Step 1: Run the NCP workflow regression**

Run: `npm test -- tests/cv-workflow.test.ts -t "NCP"`

Expected: all NCP scan rates remain finite, bounded, shared-g, and percentage-normalized.

- [ ] **Step 2: Prove scientific values are unchanged**

Record the NCP `capacitivePercent` values before the page-only changes and compare them after Tasks 1–2. Expected: exact equality because analysis and integration code are unchanged.

- [ ] **Step 3: Run the real NCP CSV through the local page**

Select XYXYXY, first-row headers, rates `50, 20, 10, 5, 2`, R² threshold `0.95`, and 50 mV/s. Verify both dashed branches reach the shared reversal potential, endpoint neighborhoods retain curvature, the exact reversal closes naturally, and no multi-point endpoint interval collapses into an artificial bridge.

- [ ] **Step 4: Save the updated PNG**

Save the verified export as `D:/codex_communication/NCP_50mVs_CV_capacitive_contribution_endpoint_fixed.png`.

---

### Task 4: Full verification and handoff

**Files:**
- Review all modified files.
- Do not modify deployment workflow unless deployment is separately requested after review.

- [ ] **Step 1: Run complete tests**

Run: `npm test`

Expected: zero failed tests.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript, Vite, and route-entry generation exit 0.

- [ ] **Step 3: Review branch state**

Run: `git diff origin/fix-dunn-literature-plot...HEAD --check`

Run: `git status --short --branch`

Expected: no whitespace errors and no uncommitted implementation files.

- [ ] **Step 4: Report verified evidence**

Report the shared-turning-point display change, eight-point retention, unchanged NCP percentage, test/build results, commit hashes, and updated PNG. Do not claim deployment without a separately verified deployment run.
