# Dunn Endpoint Shape Constraints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove reconstruction-created endpoint hooks from Dunn capacitive boundaries while retaining one bounded shared `g(V)`, exact physical endpoints, full potential coverage, and the original CV morphology.

**Architecture:** Keep the existing confidence-aware soft-envelope solve as the baseline. Replace the fixed 5% smoothstep post-processing with a small convex endpoint refinement on each dense endpoint neighborhood: the final 5% carries pairwise direction constraints derived from both raw branches, a 2.5% inner buffer lets the regularizer join the untouched interior smoothly, and the endpoint fraction is fixed to the nearest physically feasible value. The same final `g(V)` continues to drive plots, areas, contribution percentages, and exports.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, existing banded second-difference operator and projected-gradient solver; no new dependencies.

## Global Constraints

- Keep `i_cap,f(V) = g(V) * i_f(V)` and `i_cap,r(V) = g(V) * i_r(V)` unchanged.
- Keep one shared `g(V)` with `0 <= g(V) <= 1`.
- Do not move potential coordinates or independently smooth either capacitive-current branch.
- Preserve raw local extrema; reject only direction reversals that the endpoint reconstruction introduces.
- Preserve exact physical endpoint containment and the complete ordered CV loop.
- Use the same final reconstruction for plotting, area integration, contribution percentages, and CSV/SVG/PNG export.
- Validate all NCP scan rates in threshold and weighted Dunn modes, with focused visual review at 50 and 2 mV/s.
- Do not modify b-value analysis, import parsing, page layout, or translations.
- Do not merge `main`, push, or deploy before the user approves the regenerated figures.

## File Map

- Modify `src/lib/cvDunnReconstruction.ts`: endpoint feasibility, local direction constraints, constrained projection, dense endpoint refinement, and validation.
- Modify `tests/cv-dunn-reconstruction.test.ts`: synthetic RED/GREEN tests for hook removal, exact endpoints, shared fraction, and preservation of genuine raw extrema.
- Modify `tests/cv-workflow.test.ts`: NCP regression assertions for every scan rate and both confidence modes.
- Reuse `tests/fixtures/cvRegressionDatasets.ts`: existing NCP regression data; do not create a duplicate fixture.
- Reuse `src/pages/CvKineticsPage.tsx`: no production change expected; its existing Dunn chart/export path must consume the refined result unchanged.

---

### Task 1: Capture the endpoint-hook regression

**Files:**
- Modify: `tests/cv-dunn-reconstruction.test.ts:59-86`
- Modify: `tests/cv-workflow.test.ts:369-394`

**Interfaces:**
- Consumes: `refineSharedFractionWithSoftEnvelope(input: DunnSoftEnvelopeInput): DunnSoftEnvelopeResult`.
- Produces: test-only `countAddedDirectionReversals(raw, reconstructed, potentials, side)` used by unit and NCP assertions.

- [ ] **Step 1: Replace the smoothstep-shape assertion with a failing no-hook test**

Add this helper near the bottom of `tests/cv-dunn-reconstruction.test.ts`:

```ts
function countAddedDirectionReversals(
  raw: number[],
  reconstructed: number[],
  potentials: number[],
  side: "left" | "right"
): number {
  const minimum = potentials[0]!;
  const maximum = potentials.at(-1)!;
  const span = maximum - minimum;
  const tolerance = 1e-10 * Math.max(1, ...raw.map(Math.abs));
  let count = 0;
  for (let index = 0; index < raw.length - 1; index += 1) {
    const left = (potentials[index]! - minimum) / span;
    const right = (potentials[index + 1]! - minimum) / span;
    const inWindow = side === "left" ? right <= 0.05 : left >= 0.95;
    if (!inWindow) continue;
    const rawDelta = raw[index + 1]! - raw[index]!;
    const reconstructedDelta = reconstructed[index + 1]! - reconstructed[index]!;
    if (Math.abs(rawDelta) <= tolerance || Math.abs(reconstructedDelta) <= tolerance) continue;
    if (rawDelta * reconstructedDelta < 0) count += 1;
  }
  return count;
}
```

Replace `smoothly reconnects a collapsed same-sign endpoint envelope on the shared fraction` with:

```ts
it("reaches a collapsed endpoint without adding a hook to a monotone raw tail", () => {
  const potentials = Array.from({ length: 201 }, (_value, index) => index / 200);
  const forwardCurrents = potentials.map((potential) => 2 - potential);
  const reverseCurrents = potentials.map((potential, index) =>
    index === 0 || index === potentials.length - 1 ? 2 - potential : potential - 2);
  const result = refineSharedFractionWithSoftEnvelope({
    baselineG: potentials.map(() => 0.95),
    potentials,
    forwardCurrents,
    reverseCurrents,
    baselineLambda: 1e-4
  });
  const capacitiveForward = result.g.map((fraction, index) => fraction * forwardCurrents[index]!);

  expect(result.g[0]).toBe(1);
  expect(result.g.at(-1)).toBe(1);
  expect(result.g.every((value) => value >= 0 && value <= 1)).toBe(true);
  expect(countAddedDirectionReversals(
    forwardCurrents,
    capacitiveForward,
    potentials,
    "right"
  )).toBe(0);
});
```

- [ ] **Step 2: Add a failing preservation test for a genuine raw extremum**

```ts
it("preserves a genuine endpoint-tail extremum instead of forcing global monotonicity", () => {
  const potentials = Array.from({ length: 201 }, (_value, index) => index / 200);
  const forwardCurrents = potentials.map((potential) =>
    1 + (1 - potential) + 0.025 * Math.exp(-(((potential - 0.975) / 0.006) ** 2)));
  const reverseCurrents = potentials.map((potential, index) =>
    index === potentials.length - 1 ? forwardCurrents[index]! : -forwardCurrents[index]!);
  const result = refineSharedFractionWithSoftEnvelope({
    baselineG: potentials.map(() => 0.95),
    potentials,
    forwardCurrents,
    reverseCurrents,
    baselineLambda: 1e-4
  });
  const capacitiveForward = result.g.map((fraction, index) => fraction * forwardCurrents[index]!);

  expect(countAddedDirectionReversals(
    forwardCurrents,
    capacitiveForward,
    potentials,
    "right"
  )).toBe(0);
  expect(capacitiveForward.some((value, index, values) =>
    index > 0 && index < values.length - 1
      && potentials[index]! >= 0.95
      && value > values[index - 1]!
      && value > values[index + 1]!
  )).toBe(true);
});
```

- [ ] **Step 3: Strengthen the NCP endpoint regression**

In `tests/cv-workflow.test.ts`, extend the existing endpoint-neighborhood test so each contribution checks both branches:

```ts
for (const [raw, capacitive] of [
  [contribution.originalForward, contribution.capacitiveForward],
  [contribution.originalReverse, contribution.capacitiveReverse]
] as const) {
  expect(countAddedEndpointDirectionReversals(
    raw,
    capacitive,
    contribution.potentialGrid
  )).toBe(0);
}
```

Add the analogous test helper using the same 5% windows and scale-relative `1e-10` tolerance as the unit-test helper.

- [ ] **Step 4: Run tests and verify RED**

Run:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/cv-dunn-reconstruction.test.ts tests/cv-workflow.test.ts
```

Expected: FAIL in the new monotone-tail and/or NCP direction-reversal assertions because the fixed smoothstep creates at least one reconstructed reversal where the corresponding raw tail has none. The genuine-extremum test must not fail because of missing setup or non-finite data.

- [ ] **Step 5: Commit the RED tests**

```powershell
git add tests/cv-dunn-reconstruction.test.ts tests/cv-workflow.test.ts
git commit -m "test: reject Dunn endpoint reconstruction hooks"
```

---

### Task 2: Add the constrained dense-endpoint optimizer

**Files:**
- Modify: `src/lib/cvDunnReconstruction.ts:22-29,196-385,856-1045`
- Test: `tests/cv-dunn-reconstruction.test.ts`

**Interfaces:**
- Consumes: the soft-envelope result on the complete dense potential grid.
- Produces: internal `refineEndpointMorphology(g, normalizedPotentials, forward, reverse, smoothnessLambda, tolerance): number[]`.
- Produces: internal `validateEndpointMorphology(rawG, finalG, normalizedPotentials, forward, reverse, tolerance): void`.

- [ ] **Step 1: Define exact endpoint-refinement constants and constraint types**

Replace `SOFT_ENVELOPE_ENDPOINT_RECONNECTION_WIDTH` with:

```ts
const ENDPOINT_SHAPE_WINDOW = 0.05;
const ENDPOINT_OPTIMIZATION_WINDOW = 0.075;
const ENDPOINT_DIRECTION_TOLERANCE_SCALE = 1e-10;
const ENDPOINT_PROJECTION_TOLERANCE = 1e-12;
const ENDPOINT_PROJECTION_MAXIMUM_ITERATIONS = 2_000;

interface PairwiseCurrentConstraint {
  leftIndex: number;
  rightIndex: number;
  leftCoefficient: number;
  rightCoefficient: number;
  lowerBound: number;
}

interface EndpointProjectionSet {
  lower: number[];
  upper: number[];
  pairwise: PairwiseCurrentConstraint[];
}
```

The pairwise inequality is:

```text
leftCoefficient * g[leftIndex] + rightCoefficient * g[rightIndex] >= lowerBound
```

For a raw branch direction `direction = sign(raw[right] - raw[left])`, use:

```ts
leftCoefficient = -direction * raw[left]
rightCoefficient = direction * raw[right]
lowerBound = -directionTolerance
```

- [ ] **Step 2: Compute exact feasible endpoint fractions**

Add:

```ts
function feasibleFractionInterval(
  forward: number,
  reverse: number,
  tolerance: number
): [number, number] {
  const lowerCurrent = Math.min(forward, reverse);
  const upperCurrent = Math.max(forward, reverse);
  let lowerFraction = 0;
  let upperFraction = 1;
  for (const raw of [forward, reverse]) {
    if (Math.abs(raw) <= Number.EPSILON) {
      if (lowerCurrent > 0 || upperCurrent < 0) throw new CvAnalysisError("reconstructionFailed");
      continue;
    }
    const first = lowerCurrent / raw;
    const second = upperCurrent / raw;
    lowerFraction = Math.max(lowerFraction, Math.min(first, second));
    upperFraction = Math.min(upperFraction, Math.max(first, second));
  }
  lowerFraction = Math.max(0, lowerFraction);
  upperFraction = Math.min(1, upperFraction);
  if (lowerFraction > upperFraction + ENDPOINT_PROJECTION_TOLERANCE) {
    throw new CvAnalysisError("reconstructionFailed");
  }
  return [lowerFraction, upperFraction];
}
```

For each endpoint, clamp the incoming fraction to this interval and set `lower[index] === upper[index]` to that exact value. For a collapsed same-sign NCP endpoint, the interval collapses to `1` within tolerance.

- [ ] **Step 3: Build one shared set of branch-direction inequalities**

Add `makeEndpointProjectionSet(...)`. It must:

1. initialize every local variable with bounds `[0, 1]`;
2. fix the physical endpoint to the selected feasible fraction;
3. fix the two innermost points in the 7.5% optimization window to their incoming `g` values, preserving value and discrete slope at the join;
4. add constraints only for adjacent pairs fully inside the final 5% shape window;
5. add one constraint per significant forward difference and one per significant reverse difference;
6. skip a branch difference only when `abs(rawDelta) <= 1e-10 * max(1, abs(rawLeft), abs(rawRight))`.

Use this exact constraint construction:

```ts
function appendDirectionConstraint(
  pairwise: PairwiseCurrentConstraint[],
  raw: number[],
  leftIndex: number,
  rightIndex: number
) {
  const rawDelta = raw[rightIndex]! - raw[leftIndex]!;
  const scale = Math.max(1, Math.abs(raw[leftIndex]!), Math.abs(raw[rightIndex]!));
  const tolerance = ENDPOINT_DIRECTION_TOLERANCE_SCALE * scale;
  if (Math.abs(rawDelta) <= tolerance) return;
  const direction = Math.sign(rawDelta);
  pairwise.push({
    leftIndex,
    rightIndex,
    leftCoefficient: -direction * raw[leftIndex]!,
    rightCoefficient: direction * raw[rightIndex]!,
    lowerBound: -tolerance
  });
}
```

- [ ] **Step 4: Implement Dykstra projection for box, fixed-value, and pairwise constraints**

Add `projectEndpointSet(values, constraints, output)`. Perform one box/fixed projection followed by cyclic pairwise half-space projections, retaining Dykstra corrections between cycles. For each violated half-space:

```ts
const dot = constraint.leftCoefficient * correctedLeft
  + constraint.rightCoefficient * correctedRight;
const denominator = constraint.leftCoefficient ** 2
  + constraint.rightCoefficient ** 2;
const adjustment = Math.max(0, constraint.lowerBound - dot) / denominator;
projectedLeft = correctedLeft + adjustment * constraint.leftCoefficient;
projectedRight = correctedRight + adjustment * constraint.rightCoefficient;
```

Stop when the maximum coordinate change and maximum constraint violation are both `<= 1e-12`; otherwise throw `CvAnalysisError("reconstructionFailed")` after 2,000 cycles. Store corrections only for the two coordinates touched by each pairwise constraint plus one box-correction vector, so memory remains linear in endpoint-window size.

- [ ] **Step 5: Generalize the existing projected solver with an optional projector**

Change the internal signature to:

```ts
type FractionProjector = (values: number[], output: number[]) => void;

function solveProjected(
  target: number[],
  weight: number[],
  lambda: number,
  operator: SecondDifferenceOperator,
  tolerance: number,
  initial: number[],
  maximumIterations: number,
  projector: FractionProjector = projectUnitBox
): ProjectedSolution
```

Replace direct clamping in `projectGradientStep` with the supplied projector. Compute constrained optimality using the gradient mapping:

```ts
projector(g.map((value, index) => value - gradient[index]! / localLipschitz), projected);
const residual = localLipschitz * Math.max(
  ...g.map((value, index) => Math.abs(value - projected[index]!))
);
```

Keep the existing unit-box projector as the default so `optimizeSharedFraction` behavior and L-curve selection remain unchanged.

- [ ] **Step 6: Replace fixed smoothstep reconnection with local constrained regularization**

Delete `reconnectSharedFractionEndpoints`. Add `refineEndpointMorphology(...)` that independently extracts the left and right 7.5% windows, constructs the local second-difference operator using the original normalized coordinates, and solves:

```text
sum((g - incomingG)^2) / windowLength
+ smoothnessLambda * normalizedSecondDifferenceRoughness(g)
```

with the projector from Steps 3-5. Apply the left and right local solutions back to one copied full-grid `g`; the windows cannot overlap unless the grid is too short, in which case solve the union once. Call this function:

- after a direct full-grid soft-envelope solve;
- after PCHIP expands a reduced support-grid result back to the dense input grid;
- on the zero-envelope-penalty fast path whenever either endpoint is not already feasible or a direction constraint is violated.

All diagnostics must be calculated from the final dense constrained `g`, not the incoming support solution.

- [ ] **Step 7: Add automatic no-hook validation**

Add `validateEndpointMorphology(...)`. For every significant adjacent raw difference inside each 5% window and for both branches, compute the corresponding capacitive difference. Throw `CvAnalysisError("reconstructionFailed")` when:

```ts
Math.sign(rawDelta) * capacitiveDelta < -directionTolerance
```

Also retain the existing checks for finite `g`, `0 <= g <= 1`, endpoint feasibility, shared multiplication, and soft-envelope diagnostics.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/cv-dunn-reconstruction.test.ts tests/cv-workflow.test.ts
```

Expected: both files pass; the synthetic monotone tail has zero added reversals, the genuine raw extremum remains, and every NCP contribution passes endpoint containment and no-hook validation.

- [ ] **Step 9: Commit the optimizer change**

```powershell
git add src/lib/cvDunnReconstruction.ts tests/cv-dunn-reconstruction.test.ts tests/cv-workflow.test.ts
git commit -m "fix: regularize Dunn endpoint morphology"
```

---

### Task 3: Verify complete workflow and generate review figures

**Files:**
- Test: `tests/cv-page.test.tsx`
- Verify: `src/pages/CvKineticsPage.tsx`
- Generate outside Git worktree: `D:\codex_communication\NCP_50mVs_endpoint_constrained.png`
- Generate outside Git worktree: `D:\codex_communication\NCP_2mVs_endpoint_constrained.png`

**Interfaces:**
- Consumes: final `DunnContribution.g`, `capacitiveForward`, `capacitiveReverse`, and `plotPath` from Task 2.
- Produces: user-reviewable 50 and 2 mV/s figures; no deployment.

- [ ] **Step 1: Run the complete automated suite**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run
```

Expected: all test files pass with no failed tests. Record the exact file/test counts from the fresh output.

- [ ] **Step 2: Run the production build as its three package-script stages**

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\typescript\bin\tsc
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vite\bin\vite.js build
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\scripts\create-route-entries.mjs
```

Expected: TypeScript exits 0, Vite reports a successful production build, and route-entry generation exits 0. The existing large-chunk warning is informational unless it changes into an error.

- [ ] **Step 3: Re-run the real NCP browser flow**

Use `C:\Users\ThinkPad\Downloads\NCP-CV——1.csv` with:

- layout: `XYXYXY`;
- first row: headers;
- scan rates: `50, 20, 10, 5, 2` mV/s;
- interval: Auto;
- Dunn mode: R² threshold;
- R² threshold: `0.95`.

Run analysis, select 50 mV/s, export the Dunn SVG; then select 2 mV/s and export again. Confirm both paths span the same complete x-domain as the original curve and both capacitive branches meet the exact original endpoint current.

- [ ] **Step 4: Verify endpoint geometry numerically before showing images**

For each exported SVG:

1. parse `data-series-id="original"`, `capacitive-forward`, and `capacitive-reverse`;
2. confirm identical minimum and maximum projected x values;
3. confirm the capacitive branches equal the original at each shared physical endpoint within `1e-10` current-scaled tolerance;
4. count added direction reversals in each 5% endpoint neighborhood and require zero;
5. confirm any original subpixel branch crossing is preserved rather than newly created.

If any check fails, do not generate review PNGs and return to Task 2.

- [ ] **Step 5: Render complete white-background review PNGs**

Render each verified SVG at 192 DPI with the bundled Sharp package and white flattening, producing:

- `D:\codex_communication\NCP_50mVs_endpoint_constrained.png`
- `D:\codex_communication\NCP_2mVs_endpoint_constrained.png`

Visually inspect both images at original resolution. The 50 mV/s upper purple boundary must descend smoothly through the previously hooked right-end region; neither figure may have clipped metadata, a shortened x-domain, a straight bridge, or a detached endpoint.

- [ ] **Step 6: Check repository state and commit any required page regression assertion**

```powershell
git diff --check
git status --short --branch
```

Expected: no unstaged production changes. If `tests/cv-page.test.tsx` required an assertion update, commit only that verified test change:

```powershell
git add tests/cv-page.test.tsx
git commit -m "test: verify constrained Dunn endpoint plots"
```

- [ ] **Step 7: Stop for user figure approval**

Show both PNGs with the exact test/build evidence and contribution percentages. Explicitly state that the branch has not been pushed or deployed. Do not push or deploy until the user approves these new figures.
