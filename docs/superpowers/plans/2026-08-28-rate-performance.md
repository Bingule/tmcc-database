# TMCC Rate Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight modular, bilingual Rate Performance routes to the existing tmccdb.org Tools system, with validated scientific calculations, safe model gating, shared input/export infrastructure, and no unrelated CV refactor.

**Architecture:** Each route is lazy-loaded and delegates to framework-independent functions under `src/tools/rate-performance/analysis` and a typed model registry under `models`. A narrowly extracted generic tabular reader is shared with the existing CV adapter, while raw, normalized, fitted, and display data remain distinct. Only literature-validated models can execute; pending models are visible but disabled.

**Tech Stack:** React 19, TypeScript 5.7, Vite 5, Vitest/jsdom, existing inline-SVG `ScientificLineChart`, existing typed EN/ZH i18n, `read-excel-file` 9.3.10, `ml-levenberg-marquardt` 5.1.0.

## Global Constraints

- This extends the existing tmccdb.org Tools section; it is not a standalone application or redesign.
- Do not change existing CV scientific behavior, b-value calculations, Dunn calculations, cycle logic, or in-progress CV layout.
- New scientific logic must not live in React page components.
- Fits always use every valid selected scientific point; display sampling never changes fit inputs.
- C-rate, measured rate `R`, and specific current are not interchangeable without explicit conversion inputs.
- Unverified models remain disabled and cannot return numerical results.
- Failed fits and unavailable statistics are explicit.
- No arbitrary transport percentages or unsupported mechanism claims are permitted.
- Every production behavior is developed through a failing test followed by the smallest passing implementation.
- Stage and commit only task-owned paths because unrelated material and structure changes may coexist in the working tree.

---

## Planned file map

**Existing files modified**

- `package.json` and `pnpm-lock.yaml`: add the nonlinear least-squares dependency.
- `src/App.tsx`: lazy route bindings only.
- `src/lib/routes.ts`: exact route identifiers and path mapping.
- `scripts/create-route-entries.mjs`: static HTML entries for eight routes.
- `src/pages/ToolsPage.tsx`: one Rate Performance card and sublink list.
- `src/locales/en.ts`, `src/locales/zh.ts`: typed bilingual Rate Performance resources.
- `src/components/ScientificLineChart.tsx`: optional log-axis projection without changing existing linear behavior.
- `src/lib/cvParsing.ts`: delegate raw table reading to the generic reader while retaining its exported CV API.
- `src/styles/global.css`: scoped `.rate-*` styles that reuse existing Tools tokens and breakpoints.
- route, i18n, chart, parser, markup, and regression tests: extend expected behavior only.

**New shared file**

- `src/lib/tabularParsing.ts`: format-neutral CSV/TXT/XLSX reading, safety limits, and raw sheet representation.

**New Rate Performance module**

- `src/tools/rate-performance/models/types.ts`
- `src/tools/rate-performance/models/registry.ts`
- `src/tools/rate-performance/models/tianCharacteristicTime.ts`
- `src/tools/rate-performance/models/rationalCharacteristicTime.ts`
- `src/tools/rate-performance/analysis/fitRatePerformance.ts`
- `src/tools/rate-performance/analysis/fitStatistics.ts`
- `src/tools/rate-performance/analysis/confidenceIntervals.ts`
- `src/tools/rate-performance/analysis/compareRateModels.ts`
- `src/tools/rate-performance/analysis/transportTimes.ts`
- `src/tools/rate-performance/analysis/thicknessScaling.ts`
- `src/tools/rate-performance/analysis/reconstructCaRate.ts`
- `src/tools/rate-performance/analysis/energyPower.ts`
- `src/tools/rate-performance/utils/rateValidation.ts`
- `src/tools/rate-performance/utils/rateUnits.ts`
- `src/tools/rate-performance/utils/chartSampling.ts`
- `src/tools/rate-performance/utils/rateExports.ts`
- `src/tools/rate-performance/data/rateExamples.ts`
- `src/tools/rate-performance/data/thicknessExamples.ts`
- `src/tools/rate-performance/data/caExamples.ts`
- `src/tools/rate-performance/data/energyExamples.ts`
- `src/tools/rate-performance/references/types.ts`
- `src/tools/rate-performance/references/rateReferences.ts`
- `src/tools/rate-performance/components/RatePerformanceNav.tsx`
- `src/tools/rate-performance/components/RateDataInput.tsx`
- `src/tools/rate-performance/components/ManualRateTable.tsx`
- `src/tools/rate-performance/components/RateFileImport.tsx`
- `src/tools/rate-performance/components/ColumnMapping.tsx`
- `src/tools/rate-performance/components/DatasetSummary.tsx`
- `src/tools/rate-performance/components/ResultCards.tsx`
- `src/tools/rate-performance/components/FitStatus.tsx`
- `src/tools/rate-performance/components/ModelTheoryPanel.tsx`
- `src/tools/rate-performance/components/ReferenceList.tsx`
- `src/tools/rate-performance/components/RateChartPanel.tsx`
- `src/tools/rate-performance/components/ExportToolbar.tsx`
- eight page files under `src/tools/rate-performance/pages/` matching the approved design.

**New tests**

- `tests/tabular-parsing.test.ts`
- `tests/rate-units.test.ts`
- `tests/rate-models.test.ts`
- `tests/rate-fitting.test.ts`
- `tests/rate-input.test.tsx`
- `tests/rate-analysis-page.test.tsx`
- `tests/rate-model-comparison.test.tsx`
- `tests/rate-transport.test.tsx`
- `tests/rate-thickness.test.tsx`
- `tests/rate-ca.test.tsx`
- `tests/rate-energy-power.test.tsx`
- `tests/rate-routes.test.tsx`
- `tests/rate-code-splitting.test.ts`

---

### Task 1: Register lazy routes and Tools navigation

**Files:**
- Modify: `src/lib/routes.ts`
- Modify: `src/App.tsx`
- Modify: `scripts/create-route-entries.mjs`
- Modify: `src/pages/ToolsPage.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Create: `src/tools/rate-performance/components/RatePerformanceNav.tsx`
- Create: eight minimal page modules under `src/tools/rate-performance/pages/`
- Test: `tests/rate-routes.test.tsx`
- Modify: `tests/route-code-splitting.test.ts`
- Modify: `tests/build-routes.test.ts`
- Modify: `tests/tools-markup.test.tsx`

**Interfaces:**
- Produces: eight `AppRoute` values and exact URL mappings.
- Produces: default-exported React page modules so `App.tsx` can use `lazy(() => import(...))`.
- Produces: `RatePerformanceNav({ currentPath }: { currentPath: string })`.

- [ ] **Step 1: Write failing route and navigation tests**

```tsx
expect(normalizePathname("/tools/rate-performance")).toBe("ratePerformance");
expect(normalizePathname("/tools/rate-performance/model-comparison")).toBe("rateModelComparison");
expect(view.querySelector('a[href="/tools/rate-performance"]')?.textContent)
  .toContain("Rate Performance");
expect(source).toContain('lazy(() => import("./tools/rate-performance/pages/RatePerformanceAnalysisPage"))');
```

- [ ] **Step 2: Run the focused tests and verify missing-route failures**

Run: `pnpm test -- tests/rate-routes.test.tsx tests/route-code-splitting.test.ts tests/build-routes.test.ts tests/tools-markup.test.tsx`

Expected: FAIL because the new routes, modules, translations, and build entries do not exist.

- [ ] **Step 3: Add exact route mappings, lazy imports, static entries, card copy, subnavigation, and minimal accessible pages**

Use these route suffixes exactly: `model-comparison`, `transport-limitations`, `characteristic-time`, `thickness-kinetics`, `ca-analysis`, `empirical-models`, and `energy-power`. Each page renders the existing `Breadcrumbs`, one `h1`, `RatePerformanceNav`, and a localized empty-state section; it does not contain scientific calculations.

- [ ] **Step 4: Run focused tests and confirm they pass**

Run: `pnpm test -- tests/rate-routes.test.tsx tests/route-code-splitting.test.ts tests/build-routes.test.ts tests/tools-markup.test.tsx`

Expected: PASS with all legacy Tools route assertions updated rather than removed.

- [ ] **Step 5: Commit only route/navigation files**

```powershell
git add -- src/lib/routes.ts src/App.tsx scripts/create-route-entries.mjs src/pages/ToolsPage.tsx src/locales/en.ts src/locales/zh.ts src/tools/rate-performance/components/RatePerformanceNav.tsx src/tools/rate-performance/pages tests/rate-routes.test.tsx tests/route-code-splitting.test.ts tests/build-routes.test.ts tests/tools-markup.test.tsx
git commit -m "feat: add rate performance tool routes"
```

### Task 2: Extract one generic tabular reader without changing CV behavior

**Files:**
- Create: `src/lib/tabularParsing.ts`
- Modify: `src/lib/cvParsing.ts`
- Create: `tests/tabular-parsing.test.ts`
- Modify: `tests/cv-parsing.test.ts`

**Interfaces:**
- Produces: `TabularCell = string | number | null`.
- Produces: `TabularSheet { name: string; rows: TabularCell[][] }`.
- Produces: `parseDelimitedTable(text: string): TabularCell[][]`.
- Produces: `parseTabularFile(file: File): Promise<TabularSheet[]>`.
- Preserves: `parseDelimitedCv`, `parseCvFile`, `confirmCvSeries`, `CvParseError`, and all resource limits.

- [ ] **Step 1: Add failing generic-reader tests**

```ts
expect(parseDelimitedTable('Rate,Capacity\n0.1,325')).toEqual([
  ["Rate", "Capacity"],
  [0.1, 325]
]);
await expect(parseTabularFile(makeXlsxFile([["Rate", "Capacity"], [1, 240]])))
  .resolves.toMatchObject([{ rows: [["Rate", "Capacity"], [1, 240]] }]);
```

Also assert UTF-16 TXT decoding, quoted CSV, inconsistent row errors, file-size limits, ZIP entry limits, XLSX compression-ratio limits, and malformed workbook errors.

- [ ] **Step 2: Run the generic and full CV parser tests**

Run: `pnpm test -- tests/tabular-parsing.test.ts tests/cv-parsing.test.ts`

Expected: the new test fails because `tabularParsing.ts` is absent; existing CV tests remain green before refactoring.

- [ ] **Step 3: Move format-neutral reading into `tabularParsing.ts` and adapt CV parsing**

Move the existing encoding, delimiter, raw row, XLSX archive-preflight, workbook-read, and resource-limit behavior without changing numeric interpretation. `cvParsing.ts` must select useful sheets and construct CV column pairs exactly as before.

- [ ] **Step 4: Verify generic reader and all CV parsing behavior**

Run: `pnpm test -- tests/tabular-parsing.test.ts tests/cv-parsing.test.ts tests/cv-import.test.ts tests/cv-workflow.test.ts`

Expected: PASS with no CV snapshot or expected-value changes.

- [ ] **Step 5: Commit the shared reader extraction**

```powershell
git add -- src/lib/tabularParsing.ts src/lib/cvParsing.ts tests/tabular-parsing.test.ts tests/cv-parsing.test.ts
git commit -m "refactor: share safe tabular file parsing"
```

### Task 3: Define rate data types, validation, units, and structured examples

**Files:**
- Create: `src/tools/rate-performance/models/types.ts`
- Create: `src/tools/rate-performance/utils/rateValidation.ts`
- Create: `src/tools/rate-performance/utils/rateUnits.ts`
- Create: four example-data files under `src/tools/rate-performance/data/`
- Test: `tests/rate-units.test.ts`

**Interfaces:**
- Produces: `RateUnit`, `CapacityUnit`, `RatePoint`, `NormalizedRatePoint`, `RateDataset`, `RateNormalizationContext`, and `RateValidationIssue`.
- Produces: `validateRatePoints(points): RateValidationReport`.
- Produces: `normalizeRatePoints(points, context): NormalizedRatePoint[]`.

- [ ] **Step 1: Write failing unit and validation tests**

```ts
expect(normalizeRatePoints([
  { id: "p1", rate: 1000, rateUnit: "mA-g-1", capacity: 250, capacityUnit: "mAh-g-1" }
], {} as RateNormalizationContext)[0].analysisRate).toBe(4);

try {
  normalizeRatePoints([
    { id: "p1", rate: 2, rateUnit: "C-rate", capacity: 200, capacityUnit: "mAh-g-1" }
  ], {} as RateNormalizationContext);
  throw new Error("expectedRateUnitError");
} catch (error) {
  expect(error).toMatchObject({ code: "theoreticalCapacityRequired" });
}
```

Add cases for `A g^-1`, confirmed measured `h^-1`, unconfirmed `h^-1`, `Ah kg^-1`, zero/negative rate, negative capacity, missing values, non-finite values, duplicates, and stable original metadata.

- [ ] **Step 2: Verify the tests fail because the domain API is missing**

Run: `pnpm test -- tests/rate-units.test.ts`

Expected: FAIL on missing modules and types.

- [ ] **Step 3: Implement validation and conversion**

Use `R = (I/M)/(Q/M)_E` for specific current and `R = C-rate * Q_theoretical / Q_measured` only when theoretical capacity is supplied. Preserve `originalRate`, `originalRateUnit`, `originalCapacity`, and `originalCapacityUnit` in every normalized point. Duplicate positive rates are valid with a warning.

- [ ] **Step 4: Add typed, immutable example datasets and pass tests**

Run: `pnpm test -- tests/rate-units.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit domain types and examples**

```powershell
git add -- src/tools/rate-performance/models/types.ts src/tools/rate-performance/utils/rateValidation.ts src/tools/rate-performance/utils/rateUnits.ts src/tools/rate-performance/data tests/rate-units.test.ts
git commit -m "feat: add rate data validation and units"
```

### Task 4: Implement verified equations, references, and registry gating

**Files:**
- Create: `src/tools/rate-performance/models/tianCharacteristicTime.ts`
- Create: `src/tools/rate-performance/models/rationalCharacteristicTime.ts`
- Create: `src/tools/rate-performance/models/registry.ts`
- Create: `src/tools/rate-performance/references/types.ts`
- Create: `src/tools/rate-performance/references/rateReferences.ts`
- Test: `tests/rate-models.test.ts`

**Interfaces:**
- Produces: `RateModelDefinition`, `RateModelStatus`, `RateModelParameterDefinition`.
- Produces: `evaluateTianRate(rate, { qM, tau, n })`.
- Produces: `transitionRate({ tau, n })`.
- Produces: `evaluateRationalRate(rate, { qM, tau, n })`.
- Produces: `getRateModel(id)` and `listRateModels()`.

- [ ] **Step 1: Write failing equation and registry tests**

```ts
expect(evaluateTianRate(1e-8, { qM: 300, tau: 1, n: 0.5 })).toBeCloseTo(300, 5);
expect(transitionRate({ tau: 2, n: 0.5 })).toBeCloseTo(0.125, 12);
expect(listRateModels().filter((model) => model.status === "pending-validation")
  .every((model) => model.fit === undefined)).toBe(true);
```

Check finite behavior across extreme positive `R tau`, the high-rate power-law approximation, exact DOI metadata, parameter types, assumptions, and disabled pending entries.

- [ ] **Step 2: Run tests and observe missing-model failures**

Run: `pnpm test -- tests/rate-models.test.ts`

Expected: FAIL because equations and registry do not exist.

- [ ] **Step 3: Implement numerically stable equations and structured references**

For very small `x = (R tau)^(-n)`, evaluate `1 - exp(-x)` with `-Math.expm1(-x)` to avoid cancellation. Registry entries for Peukert-type, exponential, power-law, Wong-type, and unconfirmed Heubner-type use `status: "pending-validation"` and omit `fit`.

- [ ] **Step 4: Run equation tests**

Run: `pnpm test -- tests/rate-models.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit model definitions and references**

```powershell
git add -- src/tools/rate-performance/models src/tools/rate-performance/references tests/rate-models.test.ts
git commit -m "feat: register validated rate models"
```

### Task 5: Add bounded nonlinear fitting, statistics, and uncertainty

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/tools/rate-performance/analysis/fitStatistics.ts`
- Create: `src/tools/rate-performance/analysis/confidenceIntervals.ts`
- Create: `src/tools/rate-performance/analysis/fitRatePerformance.ts`
- Test: `tests/rate-fitting.test.ts`

**Interfaces:**
- Produces: `FitStatistics { sse, rmse, rSquared, adjustedRSquared, aic, aicc, bic }` with nullable unavailable values.
- Produces: `RateFitResult` discriminated by `status: "converged" | "failed"`.
- Produces: `fitRatePerformance(data, options): Promise<RateFitResult>`.

- [ ] **Step 1: Install the reviewed optimizer dependency**

Run: `pnpm add ml-levenberg-marquardt@5.1.0`

Expected: `package.json` and `pnpm-lock.yaml` contain version 5.1.0 and no unrelated dependency changes.

- [ ] **Step 2: Write failing synthetic and statistics tests**

```ts
const result = await fitRatePerformance(syntheticTianData({ qM: 325, tau: 0.8, n: 0.62 }), {
  modelId: "tian-characteristic-time"
});
expect(result.status).toBe("converged");
if (result.status === "converged") {
  expect(result.parameters.qM).toBeCloseTo(325, 2);
  expect(result.parameters.tau).toBeCloseTo(0.8, 2);
  expect(result.parameters.n).toBeCloseTo(0.62, 2);
}
```

Add noisy recovery, insufficient degrees of freedom, non-finite predictions, max-iteration failure, boundary-lock warning, singular covariance, exact SSE/RMSE/R-squared values, and undefined AICc.

- [ ] **Step 3: Run tests and verify missing fitting APIs fail**

Run: `pnpm test -- tests/rate-fitting.test.ts`

Expected: FAIL because analysis files are absent.

- [ ] **Step 4: Implement statistics and the dynamic optimizer wrapper**

Use `await import("ml-levenberg-marquardt")` inside the fit path. Apply positive bounds derived from data scale, deterministic initial starts, maximum iterations, timeout, finite-result checks, convergence checks, residual calculation, covariance inversion for the three-parameter Jacobian, and typed failures. Do not return parameter values in a failed result.

- [ ] **Step 5: Run model and fitting tests**

Run: `pnpm test -- tests/rate-models.test.ts tests/rate-fitting.test.ts`

Expected: PASS with no warnings or unhandled rejections.

- [ ] **Step 6: Commit fitting engine and dependency**

```powershell
git add -- package.json pnpm-lock.yaml src/tools/rate-performance/analysis/fitStatistics.ts src/tools/rate-performance/analysis/confidenceIntervals.ts src/tools/rate-performance/analysis/fitRatePerformance.ts tests/rate-fitting.test.ts
git commit -m "feat: fit characteristic-time rate models"
```

### Task 6: Build shared Rate Performance input and theory components

**Files:**
- Create: input, mapping, summary, result, status, theory, reference, chart, and export components under `src/tools/rate-performance/components/`
- Create: `src/tools/rate-performance/utils/chartSampling.ts`
- Create: `src/tools/rate-performance/utils/rateExports.ts`
- Modify: `src/components/ScientificLineChart.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Test: `tests/rate-input.test.tsx`
- Modify: `tests/scientific-chart.test.tsx`
- Modify: `tests/i18n.test.tsx`

**Interfaces:**
- Produces: `RateDataInput` controlled component returning raw points plus normalization context.
- Produces: optional `xScale` and `yScale` props with values `"linear" | "log10"` on `ScientificLineChart`.
- Produces: `sampleRateChartPoints(raw, maximum)` that never mutates raw input.

- [ ] **Step 1: Write failing component tests**

Assert six initial rows, add/delete/clear/example, direct two-column paste, fixed-height scrolling hook, file accept string, CSV/TXT/XLSX summaries, column remapping, invalid-row counts, stable raw metadata, labeled controls, and bilingual text. Add chart tests proving existing linear output is unchanged and log axes reject nonpositive display points without touching raw data.

- [ ] **Step 2: Run focused tests and confirm missing components fail**

Run: `pnpm test -- tests/rate-input.test.tsx tests/scientific-chart.test.tsx tests/i18n.test.tsx`

Expected: FAIL because Rate components and log-axis props are missing.

- [ ] **Step 3: Implement controlled input, generic file adaptation, theory/reference panels, and scoped styles**

Use existing `.tool-*` structures. The manual table viewport has an internal vertical scrollbar after six visible rows. Uploaded raw sheets are mapped by explicit column indices. All component text uses translation keys. Example badges use `EXAMPLE RESULTS`/`示例结果`; analyzed data uses `USER RESULTS`/`用户结果`.

- [ ] **Step 4: Implement log projection and immutable display sampling**

Preserve the current chart output when scales are omitted. Axis-domain conversion occurs only inside chart rendering; exported raw and fit data stay in physical units.

- [ ] **Step 5: Run component, chart, export, and i18n tests**

Run: `pnpm test -- tests/rate-input.test.tsx tests/scientific-chart.test.tsx tests/tool-export.test.ts tests/i18n.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit shared Rate UI**

```powershell
git add -- src/tools/rate-performance/components src/tools/rate-performance/utils/chartSampling.ts src/tools/rate-performance/utils/rateExports.ts src/components/ScientificLineChart.tsx src/styles/global.css src/locales/en.ts src/locales/zh.ts tests/rate-input.test.tsx tests/scientific-chart.test.tsx tests/i18n.test.tsx
git commit -m "feat: add shared rate performance interface"
```

### Task 7: Complete the primary Rate Performance Analysis page

**Files:**
- Modify: `src/tools/rate-performance/pages/RatePerformanceAnalysisPage.tsx`
- Test: `tests/rate-analysis-page.test.tsx`

**Interfaces:**
- Consumes: `RateDataInput`, `fitRatePerformance`, Tian registry metadata, chart panels, result cards, theory panel, reference list, and rate exports.
- Produces: full `/tools/rate-performance` user workflow.

- [ ] **Step 1: Write failing page workflow tests**

Test the untouched empty state, Try Example Dataset, manual edit, normalization gate, successful fit, failed fit, result labels, `R_T` definition, four chart variants, original/processed/fit/parameter/residual exports, EN/ZH switching, and absence of placeholder numeric cards before analysis.

- [ ] **Step 2: Run the page test and verify failures are feature-specific**

Run: `pnpm test -- tests/rate-analysis-page.test.tsx`

Expected: FAIL because the minimal route page lacks analysis behavior.

- [ ] **Step 3: Implement the orchestration page without embedding equations or optimization**

Keep page state limited to input draft, normalized dataset, pending fit, fit result, visible chart, and UI errors. Call analysis services asynchronously. Render parameter cards only for converged user fits and mark example previews separately.

- [ ] **Step 4: Run page and fitting tests**

Run: `pnpm test -- tests/rate-analysis-page.test.tsx tests/rate-fitting.test.ts tests/rate-input.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the primary page**

```powershell
git add -- src/tools/rate-performance/pages/RatePerformanceAnalysisPage.tsx tests/rate-analysis-page.test.tsx
git commit -m "feat: analyze rate performance data"
```

### Task 8: Implement validated model comparison and empirical library

**Files:**
- Create: `src/tools/rate-performance/analysis/compareRateModels.ts`
- Modify: `src/tools/rate-performance/pages/ModelComparisonPage.tsx`
- Modify: `src/tools/rate-performance/pages/EmpiricalModelsPage.tsx`
- Test: `tests/rate-model-comparison.test.tsx`

**Interfaces:**
- Produces: `compareRateModels(data, modelIds): Promise<ModelComparisonResult>`.
- Produces: ranked converged fits, delta criterion, and nullable recommendation.

- [ ] **Step 1: Write failing comparison and gating tests**

```ts
await expect(compareRateModels(data, ["peukert-type"]))
  .rejects.toMatchObject({ code: "modelPendingValidation" });
expect(result.rows[0].rank).toBe(1);
expect(result.recommendation).toBeNull(); // when delta evidence is insufficient
```

Test selectable validated models, pending disabled cards, parameter counts, AIC/AICc/BIC ranking, fit toggles, residual comparison, convergence failures, and no R-squared-only recommendation.

- [ ] **Step 2: Run the comparison test and confirm it fails**

Run: `pnpm test -- tests/rate-model-comparison.test.tsx`

Expected: FAIL on missing comparison service and page behavior.

- [ ] **Step 3: Implement comparison and registry-driven model cards**

Use AICc when every candidate has finite AICc; otherwise AIC. Recommend only when all selected models converge and the best delta is at least 2 relative to the runner-up. Explain when no recommendation is justified.

- [ ] **Step 4: Run comparison, model, and primary fitting tests**

Run: `pnpm test -- tests/rate-model-comparison.test.tsx tests/rate-models.test.ts tests/rate-fitting.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit comparison and library pages**

```powershell
git add -- src/tools/rate-performance/analysis/compareRateModels.ts src/tools/rate-performance/pages/ModelComparisonPage.tsx src/tools/rate-performance/pages/EmpiricalModelsPage.tsx tests/rate-model-comparison.test.tsx
git commit -m "feat: compare validated rate models"
```

### Task 9: Implement transport and characteristic-time analysis

**Files:**
- Create: `src/tools/rate-performance/analysis/transportTimes.ts`
- Modify: `src/tools/rate-performance/pages/TransportLimitationPage.tsx`
- Modify: `src/tools/rate-performance/pages/CharacteristicTimePage.tsx`
- Test: `tests/rate-transport.test.tsx`

**Interfaces:**
- Produces: `calculateTransportTimes(input): TransportTimeResult` with per-term availability.
- Produces: `calculateUnresolvedTime(fittedTau, components)`.
- Produces: deterministic one-at-a-time sensitivity series.

- [ ] **Step 1: Write failing dimensional and missing-input tests**

Test electrode electronic, pore ionic, separator ionic, pore diffusion, separator diffusion, active-material diffusion, kinetic time, SI conversion, missing-input term lists, unresolved time, sensitivity, and refusal to create percentages when terms are incomplete or nonpositive.

- [ ] **Step 2: Run the transport test and observe missing-analysis failures**

Run: `pnpm test -- tests/rate-transport.test.tsx`

Expected: FAIL because transport analysis is absent.

- [ ] **Step 3: Implement publication-supported equations and both pages**

Mirror Tian equations 5a-6a with explicit units and parameter provenance. Mark every output as measured, input, fitted, derived, or assumed. State that calculated times are effective model estimates. Display only available components and an unresolved difference; a negative difference is a consistency warning, not a negative physical contribution.

- [ ] **Step 4: Run transport, model, and page accessibility tests**

Run: `pnpm test -- tests/rate-transport.test.tsx tests/rate-models.test.ts tests/accessibility-regressions.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the characteristic-time tools**

```powershell
git add -- src/tools/rate-performance/analysis/transportTimes.ts src/tools/rate-performance/pages/TransportLimitationPage.tsx src/tools/rate-performance/pages/CharacteristicTimePage.tsx tests/rate-transport.test.tsx
git commit -m "feat: analyze rate limiting timescales"
```

### Task 10: Implement thickness-dependent kinetics

**Files:**
- Create: `src/tools/rate-performance/analysis/thicknessScaling.ts`
- Modify: `src/tools/rate-performance/pages/ThicknessKineticsPage.tsx`
- Test: `tests/rate-thickness.test.tsx`

**Interfaces:**
- Produces: `fitThicknessScaling(samples): ThicknessScalingResult`.
- Consumes: `fitRatePerformance` for each electrode dataset.

- [ ] **Step 1: Write failing multi-electrode and scaling tests**

Test add, duplicate, delete, per-sample manual/upload input, thickness-unit conversion, individual fit failures, `tau` uncertainty, exact linear/quadratic/power-law synthetic scaling, `alpha` confidence interval, charts, exports, and non-mechanistic interpretation text.

- [ ] **Step 2: Run tests and confirm the page is still minimal**

Run: `pnpm test -- tests/rate-thickness.test.tsx`

Expected: FAIL on missing scaling and dataset controls.

- [ ] **Step 3: Implement serializable sample fitting and scaling comparison**

Fit samples asynchronously with progress state. Exclude failed sample fits from cross-sample scaling while listing them explicitly. Require at least three valid distinct thicknesses for the two-parameter power law and enough residual degrees of freedom for confidence intervals.

- [ ] **Step 4: Run thickness and core fitting tests**

Run: `pnpm test -- tests/rate-thickness.test.tsx tests/rate-fitting.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit thickness analysis**

```powershell
git add -- src/tools/rate-performance/analysis/thicknessScaling.ts src/tools/rate-performance/pages/ThicknessKineticsPage.tsx tests/rate-thickness.test.tsx
git commit -m "feat: analyze thickness dependent kinetics"
```

### Task 11: Implement CA rate reconstruction

**Files:**
- Create: `src/tools/rate-performance/analysis/reconstructCaRate.ts`
- Modify: `src/tools/rate-performance/pages/CaRateAnalysisPage.tsx`
- Test: `tests/rate-ca.test.tsx`

**Interfaces:**
- Produces: `reconstructCaRate(points, options): CaRateResult`.
- Consumes: normalized reconstructed `RatePoint[]` through `fitRatePerformance`.

- [ ] **Step 1: Write failing integration and workflow tests**

```ts
expect(reconstructCaRate([
  { time: 0, current: 2 },
  { time: 1, current: 2 }
], { timeUnit: "h", currentUnit: "mA", activeMassG: 1, sign: "positive", baseline: 0 }).capacity.at(-1))
  .toBeCloseTo(2);
```

Add non-monotonic time, duplicate time, selected integration range, negative-current convention, zero accumulated capacity, baseline off/default, explicit constant baseline, no smoothing control, reconstructed exports, and five chart states.

- [ ] **Step 2: Run CA tests and verify failures**

Run: `pnpm test -- tests/rate-ca.test.tsx`

Expected: FAIL because reconstruction is absent.

- [ ] **Step 3: Implement trapezoidal charge integration and effective-rate calculation**

Sort only after reporting input order, reject duplicate times, apply sign and baseline explicitly, integrate in SI-consistent units, and compute `R(t) = (I(t)/M)/(Q(t)/M)` only where accumulated capacity and rate are positive and finite. Record every excluded point and processing setting.

- [ ] **Step 4: Run CA, unit, and fitting tests**

Run: `pnpm test -- tests/rate-ca.test.tsx tests/rate-units.test.ts tests/rate-fitting.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit CA analysis**

```powershell
git add -- src/tools/rate-performance/analysis/reconstructCaRate.ts src/tools/rate-performance/pages/CaRateAnalysisPage.tsx tests/rate-ca.test.tsx
git commit -m "feat: reconstruct rate data from chronoamperometry"
```

### Task 12: Implement energy and power analysis

**Files:**
- Create: `src/tools/rate-performance/analysis/energyPower.ts`
- Modify: `src/tools/rate-performance/pages/EnergyPowerPage.tsx`
- Test: `tests/rate-energy-power.test.tsx`

**Interfaces:**
- Produces: `calculateSummaryEnergyPower(input)`.
- Produces: `integrateDischargeCurve(points, normalization)`.
- Produces: multi-sample `RagonePoint[]`.

- [ ] **Step 1: Write failing summary and curve tests**

Test `Wh kg^-1`, `W kg^-1`, average-voltage summary, trapezoidal `integral V dQ`, time-based power, missing mass, missing volume, volumetric gating, curve order, duplicate capacity/time, multiple samples, Ragone data, and normalization-basis labels.

- [ ] **Step 2: Run tests and observe missing energy functions**

Run: `pnpm test -- tests/rate-energy-power.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement calculations and the two-mode page**

Keep full-curve capacity and time modes explicit. Integrate only over monotonic selected discharge segments. Do not compare active-material-, electrode-, and device-normalized points without displaying their bases.

- [ ] **Step 4: Run energy and shared chart tests**

Run: `pnpm test -- tests/rate-energy-power.test.tsx tests/scientific-chart.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit energy and power analysis**

```powershell
git add -- src/tools/rate-performance/analysis/energyPower.ts src/tools/rate-performance/pages/EnergyPowerPage.tsx tests/rate-energy-power.test.tsx
git commit -m "feat: add energy and power analysis"
```

### Task 13: Complete localization, exports, responsive states, and advanced empty states

**Files:**
- Modify: all eight page modules and shared Rate components
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `src/styles/global.css`
- Modify: `tests/i18n.test.tsx`
- Modify: `tests/tools-markup.test.tsx`
- Modify: `tests/accessibility-regressions.test.tsx`

**Interfaces:**
- Preserves: exact typed EN/ZH key parity.
- Produces: complete empty/example/user/error/loading states on every Rate page.

- [ ] **Step 1: Extend failing localization and accessibility tests**

Assert no raw translation keys, all pages switch to Chinese, each page has one `h1`, all inputs are labeled, current subnavigation is exposed, live regions are polite, example and user results are distinct, disabled pending models explain their state, and fixed-height tables remain keyboard usable.

- [ ] **Step 2: Run the integration markup tests and verify missing-copy failures**

Run: `pnpm test -- tests/i18n.test.tsx tests/tools-markup.test.tsx tests/accessibility-regressions.test.tsx`

Expected: FAIL on incomplete page copy or state semantics.

- [ ] **Step 3: Fill both locale files and finalize scoped responsive styles**

Reuse existing widths, typography, buttons, cards, tables, warnings, chart colors, and breakpoints. Do not add global typography, brand colors, motion systems, or unrelated selector changes.

- [ ] **Step 4: Run i18n, markup, accessibility, and export tests**

Run: `pnpm test -- tests/i18n.test.tsx tests/tools-markup.test.tsx tests/accessibility-regressions.test.tsx tests/tool-export.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit UI completion**

```powershell
git add -- src/tools/rate-performance/pages src/tools/rate-performance/components src/locales/en.ts src/locales/zh.ts src/styles/global.css tests/i18n.test.tsx tests/tools-markup.test.tsx tests/accessibility-regressions.test.tsx
git commit -m "feat: complete bilingual rate performance tools"
```

### Task 14: Verify code splitting, all regressions, and production output

**Files:**
- Create: `tests/rate-code-splitting.test.ts`
- Modify: `tests/regression.test.ts`
- Modify: `README.md` only if the existing Tools route list is documented there.

**Interfaces:**
- Verifies: route-level chunks, optimizer dynamic import, XLSX dynamic import, route entries, unchanged CV behavior, and complete application build.

- [ ] **Step 1: Write failing static code-splitting assertions**

```ts
expect(appSource).toContain('lazy(() => import("./tools/rate-performance/pages/RatePerformanceAnalysisPage"))');
expect(fitSource).toContain('await import("ml-levenberg-marquardt")');
expect(tabularSource).toContain('await import("read-excel-file/browser")');
expect(homeReachableSources).not.toContain("rateExamples");
```

- [ ] **Step 2: Run targeted route, chunk, and CV tests**

Run: `pnpm test -- tests/rate-code-splitting.test.ts tests/routes.test.tsx tests/cv-page.test.tsx tests/cv-analysis.test.ts tests/cv-workflow.test.ts`

Expected: the new static test fails until imports and boundaries are exact; all CV assertions must remain unchanged and pass.

- [ ] **Step 3: Correct only Rate/shared boundaries revealed by the tests**

If Vite combines chunks, introduce dynamic imports at the analysis or XLSX call boundary. Do not change CV algorithms or unrelated build configuration.

- [ ] **Step 4: Run the complete verification suite**

Run: `pnpm validate:data`

Expected: exit code 0.

Run: `pnpm test`

Expected: all tests pass with zero failures.

Run: `pnpm build`

Expected: TypeScript and Vite exit code 0; all eight Rate Performance `dist/tools/rate-performance/**/index.html` entries exist.

- [ ] **Step 5: Inspect output chunks and working-tree scope**

Run: `Get-ChildItem dist/assets | Select-Object Name,Length | Sort-Object Name`

Expected: separate Rate page/analysis chunks; optimizer and XLSX are not folded into the initial homepage module.

Run: `git status --short`

Expected: only task-owned files plus the pre-existing unrelated material/structure changes are present; no temporary Rate files, debug output, or abandoned components exist.

- [ ] **Step 6: Commit verification tests and documentation**

```powershell
git add -- tests/rate-code-splitting.test.ts tests/regression.test.ts README.md
git commit -m "test: verify rate performance integration"
```

## Final requirements audit

Before reporting completion, compare the implementation line by line with the approved design and record:

- files added and modified;
- exact new routes;
- module structure;
- shared components reused and created;
- validated models actually implemented;
- pending-validation models kept UI-only;
- verified references and DOI metadata;
- focused and full test commands with fresh counts;
- existing CV regression result;
- Vite chunk/code-splitting evidence;
- intentionally untouched technical debt;
- remaining scientifically gated work.

No completion claim is allowed until the fresh `pnpm validate:data`, `pnpm test`, and `pnpm build` outputs have been read and confirmed successful.
