# Dunn Literature-Style Contribution Plot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented four-line Dunn chart with a publication-style full CV outline, valid capacitive/diffusion area bands, hatched excluded regions, a localized coverage notice, and a more discoverable data-input block directly below the data-format selector.

**Architecture:** Extend the reusable SVG chart with optional generic area-band series while preserving every existing line-chart caller. Keep all Dunn scientific values in the existing workflow; the CV page only maps valid records into filled bands and invalid records into a neutral hatched context band, split by scan branch and validity run. Reorder existing import controls without changing draft state, parsing, or file-persistence behavior.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/jsdom, project CSS, inline SVG; no new dependencies.

## Global Constraints

- Preserve the original signed CV sequence, turning points, forward and return branches; do not average, clip, or discard measured currents.
- Keep `i(V) = k₁(V)v + k₂(V)v¹ᐟ²`, R² classification, magnitude trapezoidal integration, result tables, and all six CSV schemas unchanged.
- Valid fill only represents records whose status is `valid`; below-threshold and unavailable records remain excluded quantitatively.
- Excluded hatching is context only and must be identified by both pattern and localized text.
- Do not connect an area across a null gap, a validity-state change, or a scan-branch boundary.
- Retain English default, Simplified Chinese localization, SVG/PNG export, responsive layout, and existing accessibility semantics.
- Do not add animations, dependencies, unrelated refactors, or homepage changes.

---

## File Map

- `src/components/ScientificLineChart.tsx`: generic area-band types, domain calculation, legend swatches, SVG pattern and area paths.
- `src/pages/CvKineticsPage.tsx`: map existing Dunn records and contribution arrays into branch-local area segments; add coverage metadata and visible notice; remove old component lines from the primary chart only.
- `src/components/CvImportPanel.tsx`: move the source selector plus active upload/paste control into one emphasized input block directly after data format.
- `src/styles/global.css`: compact emphasis and responsive rules for the input block and coverage notice.
- `src/locales/en.ts`, `src/locales/zh.ts`: stable keys for valid coverage and excluded-area legend/help text.
- `tests/scientific-chart.test.tsx`: generic area rendering, domains, gaps, pattern, and layer order.
- `tests/cv-page.test.tsx`: Dunn page visual semantics, R² exclusion, localization, exports, and unchanged tables/CSV.
- `tests/cv-import-panel.test.tsx`: DOM order, emphasis hook, mobile-safe structure, and controlled-file preservation.
- `tests/i18n.test.tsx`: translation-resource parity for new keys.

---

### Task 1: Generic SVG Area Bands

**Files:**
- Modify: `tests/scientific-chart.test.tsx`
- Modify: `src/components/ScientificLineChart.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface ChartAreaPoint {
    x: number;
    lower: number;
    upper: number;
  }

  export interface ChartAreaSeries {
    id: string;
    label: string;
    color: string;
    opacity?: number;
    pattern?: "diagonalHatch";
    segments: ChartAreaPoint[][];
  }
  ```
- Extends `ScientificLineChartProps` with `areas?: ChartAreaSeries[]`, defaulting to an empty array.
- Renders each usable segment as `<path data-area-series-id="…">`; paths occur before `.scientific-chart-series`.

- [ ] **Step 1: Write failing area-band tests**

  Add tests that render one solid area and one `diagonalHatch` area with reversed x traversal. Assert:

  ```ts
  const view = await renderChart({
    ...baseProps,
    areas: [{
      id: "capacitive-area",
      label: "Capacitive contribution",
      color: "#6fb7a7",
      opacity: 0.72,
      segments: [[
        { x: 0, lower: 0, upper: 1 },
        { x: 1, lower: 0, upper: 2 },
        { x: 0.5, lower: 0, upper: 1.5 }
      ]]
    }, {
      id: "excluded-area",
      label: "Excluded",
      color: "#7d858b",
      pattern: "diagonalHatch",
      segments: [[
        { x: 0, lower: -4, upper: 5 },
        { x: 1, lower: -3, upper: 6 }
      ]]
    }]
  });

  expect(view.querySelectorAll('[data-area-series-id="capacitive-area"]')).toHaveLength(1);
  expect(view.querySelector('[data-area-series-id="capacitive-area"]')?.getAttribute("d")).toMatch(/Z$/);
  expect(view.querySelector('[data-area-series-id="excluded-area"]')?.getAttribute("fill")).toMatch(/^url\(#/);
  expect(view.querySelector('[data-chart-legend="true"]')?.textContent).toContain("Excluded");
  expect(view.querySelector('.scientific-chart-areas')?.compareDocumentPosition(
    view.querySelector('.scientific-chart-series')!
  ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  ```

  Add a second test with separate segments and one singleton segment. Assert two closed paths render for two multi-point segments, the singleton is omitted, no path contains `NaN`/`Infinity`, and y-axis tick text includes the area-only extrema beyond the line domain.

- [ ] **Step 2: Run tests and verify RED**

  Run:
  ```powershell
  node node_modules/vitest/vitest.mjs run tests/scientific-chart.test.tsx --reporter=verbose
  ```
  Expected: TypeScript/runtime assertions fail because `areas`, area paths, hatch patterns, and area legends do not exist.

- [ ] **Step 3: Implement minimal generic area support**

  In `ScientificLineChart.tsx`:

  - export the interfaces above;
  - filter area points to finite `x/lower/upper` values and discard segments shorter than two points;
  - include `{x, y: lower}` and `{x, y: upper}` in domain inputs;
  - define one SVG `<pattern>` per hatched series using the component `useId()`-derived stable identifier;
  - add an area legend swatch (`<rect>`) before line legend items;
  - render areas before line series;
  - build each closed polygon in source order:

  ```ts
  function areaPath(segment: ChartAreaPoint[], projectX: Project, projectY: Project) {
    const upper = segment.map((point, index) =>
      `${index === 0 ? "M" : "L"} ${projectX(point.x)} ${projectY(point.upper)}`);
    const lower = [...segment].reverse().map((point) =>
      `L ${projectX(point.x)} ${projectY(point.lower)}`);
    return [...upper, ...lower, "Z"].join(" ");
  }
  ```

  Keep current point selection bound only to line series.

- [ ] **Step 4: Run tests and verify GREEN**

  Run the Task 1 command. Expected: all `scientific-chart` tests pass with no console warnings.

- [ ] **Step 5: Commit Task 1**

  ```powershell
  git add src/components/ScientificLineChart.tsx tests/scientific-chart.test.tsx
  git commit -m "feat: render scientific chart area bands"
  ```

---

### Task 2: Publication-Style Dunn Mapping and Coverage

**Files:**
- Modify: `tests/cv-page.test.tsx`
- Modify: `tests/i18n.test.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes `ChartAreaSeries` and the existing `CvWorkflowResult.dunnRecords`, `analysisGrid.branches`, and selected `DunnContribution`.
- Produces `makeDunnAreas(...): ChartAreaSeries[]` with IDs `capacitive-area`, `diffusion-area`, and `excluded-area`.
- Adds stable translation keys:
  - `cv.dunn.excludedArea`
  - `cv.dunn.coverageNotice`
  - `cv.dunn.coverageHelp`
  - updates `cv.dunn.help` to describe the publication-style signed fill and R² exclusion.

  Exact English resources:
  ```ts
  "cv.dunn.excludedArea": "Excluded by R² threshold / unavailable",
  "cv.dunn.coverageNotice": "Valid Dunn coverage: {{valid}} / {{total}} points ({{coverage}}%)",
  "cv.dunn.coverageHelp": "Colored areas include valid fits only; hatched regions are excluded from percentages, tables, and exports.",
  "cv.dunn.help": "Signed capacitive and diffusion-controlled currents are shown as publication-style filled areas using i = k1v + k2√v; magnitude trapezoidal integration determines contribution percentages."
  ```

  Exact Simplified Chinese resources:
  ```ts
  "cv.dunn.excludedArea": "低于 R² 阈值／不可用",
  "cv.dunn.coverageNotice": "Dunn 有效覆盖率：{{valid}} / {{total}} 个点（{{coverage}}%）",
  "cv.dunn.coverageHelp": "彩色区域仅包含有效拟合；斜线区域不计入百分比、结果表和导出。",
  "cv.dunn.help": "依据 i = k1v + k2√v，以文献式填色展示带符号的电容与扩散控制电流；贡献百分比采用绝对值梯形积分计算。"
  ```

- [ ] **Step 1: Write failing page and localization tests**

  Extend the existing signed-Dunn page test to assert:

  ```ts
  expect(view.querySelector('[data-series-id="original"]')).not.toBeNull();
  expect(view.querySelector('[data-series-id="reconstructed-total"]')).toBeNull();
  expect(view.querySelector('[data-series-id="capacitive"]')).toBeNull();
  expect(view.querySelector('[data-series-id="diffusion"]')).toBeNull();
  expect(view.querySelectorAll('[data-area-series-id="capacitive-area"]').length).toBeGreaterThan(0);
  expect(view.querySelectorAll('[data-area-series-id="diffusion-area"]').length).toBeGreaterThan(0);
  expect(view.querySelector('[data-dunn-coverage="true"]')?.textContent)
    .toMatch(/\d+ \/ \d+.*%/);
  ```

  Add a mixed-quality fixture with at least two contiguous valid records and two contiguous below-threshold/unavailable records. Assert valid area paths do not cover excluded positions, a hatch path exists, the original CV render-point count remains the full source length, and `cv-dunn-current-table` plus six CSV buttons remain unchanged.

  Switch to Chinese and assert the coverage notice and excluded-area legend are localized. Update i18n parity expectations for all new keys.

- [ ] **Step 2: Run tests and verify RED**

  Run:
  ```powershell
  node node_modules/vitest/vitest.mjs run tests/cv-page.test.tsx tests/i18n.test.tsx --reporter=verbose
  ```
  Expected: failures show the three legacy Dunn component lines still exist, area IDs and coverage notice are missing, and new translation keys are absent.

- [ ] **Step 3: Implement branch-local area mapping**

  Import `ChartAreaSeries`. Replace `makeDunnChart` with:

  - `makeDunnLineSeries(original, t)`, returning only the original measured CV line;
  - `makeDunnAreas(analysis, contribution, seriesIndex, t)`, which iterates `resolveGridBranches(analysis.analysisGrid)` and groups adjacent indices by `record.status === "valid"`;
  - valid runs map `0 → k₁v` and `k₁v → k₁v+k₂√v`;
  - all non-valid runs map `0 → analysisGrid.currents[seriesIndex][index]` into the hatched area;
  - runs shorter than two points remain unfilled and never bridge to a neighboring run;
  - shared turning endpoints may appear in both neighboring branch segments, but branches never share one polygon.

  Pass `areas={dunnAreas}` to the Dunn `ScientificLineChart`. Keep `dunnRows`, contributions, tables, CSV exports, and scientific library code unchanged.

  Add the coverage notice immediately after the selected-rate control:

  ```tsx
  <p className="cv-dunn-coverage" data-dunn-coverage="true">
    {t("cv.dunn.coverageNotice", {
      valid: selectedContribution.validPointCount,
      total: selectedContribution.sampledPointCount,
      coverage: format(selectedContribution.coveragePercent)
    })}
  </p>
  <p className="cv-dunn-coverage-help">{t("cv.dunn.coverageHelp")}</p>
  ```

  Append the same localized coverage line to `dunnChartMetadata` so SVG/PNG exports disclose it.

- [ ] **Step 4: Add bilingual resources and compact styling**

  Add natural English and Simplified Chinese strings. Style `.cv-dunn-coverage` as a compact status callout with existing blue/green palette, no animation, and readable mobile wrapping.

- [ ] **Step 5: Run tests and verify GREEN**

  Run the Task 2 command and Task 1 chart tests. Expected: all pass; no existing export/table assertion changes except the primary Dunn chart series assertions.

- [ ] **Step 6: Commit Task 2**

  ```powershell
  git add src/pages/CvKineticsPage.tsx src/locales/en.ts src/locales/zh.ts src/styles/global.css tests/cv-page.test.tsx tests/i18n.test.tsx
  git commit -m "feat: show literature-style Dunn contribution areas"
  ```

---

### Task 3: Move and Emphasize CV Data Input

**Files:**
- Modify: `tests/cv-import-panel.test.tsx`
- Modify: `src/components/CvImportPanel.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces a `.cv-data-input` section immediately after `.cv-format-choices`.
- `.cv-data-input` contains `.cv-source-controls` followed by exactly one of `.cv-file-source` or `.cv-paste-source`.
- Does not alter `CvImportDraft`, handlers, parsing, or file retention.

- [ ] **Step 1: Write failing structure and persistence tests**

  Add assertions using `compareDocumentPosition`:

  ```ts
  const format = view.querySelector('.cv-format-choices')!;
  const input = view.querySelector('.cv-data-input')!;
  const header = view.querySelector('input[name="cv-header-mode"]')!.closest('fieldset')!;
  expect(format.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(input.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(input.querySelector('.cv-source-controls')).not.toBeNull();
  expect(input.querySelector('.cv-file-source')).not.toBeNull();
  ```

  Select a file, switch to paste, switch header/layout, then switch back to file and assert the localized filename remains. Assert `.cv-data-input` has a heading and the file/paste controls remain accessible by their existing labels.

- [ ] **Step 2: Run tests and verify RED**

  Run:
  ```powershell
  node node_modules/vitest/vitest.mjs run tests/cv-import-panel.test.tsx tests/cv-page.test.tsx --reporter=verbose
  ```
  Expected: `.cv-data-input` and its required DOM position do not exist.

- [ ] **Step 3: Reorder existing controls without changing state**

  In `CvImportPanel.tsx`, move the source fieldset and the active source control directly after the format fieldset and wrap them in:

  ```tsx
  <section className="cv-data-input" aria-labelledby="cv-data-input-title">
    <h3 id="cv-data-input-title">{t("cv.upload")}</h3>
    {/* existing source fieldset and active file/paste control unchanged */}
  </section>
  ```

  Keep the header fieldset next, then scan rates and analysis settings.

- [ ] **Step 4: Add focused responsive styling**

  Make `.cv-data-input` span both desktop columns, use a subtle tinted background, one stronger border/accent edge, compact 12–14px padding, and `min-width: 0`. Keep `.cv-source-controls` compact and ensure `.cv-file-name` wraps. Under the existing mobile breakpoint, keep the input block single-column with no minimum content width.

- [ ] **Step 5: Run tests and verify GREEN**

  Run the Task 3 command. Expected: import panel and page tests pass, including existing selected-file persistence behavior.

- [ ] **Step 6: Commit Task 3**

  ```powershell
  git add src/components/CvImportPanel.tsx src/styles/global.css tests/cv-import-panel.test.tsx
  git commit -m "fix: prioritize CV data input controls"
  ```

---

### Task 4: Actual-File, Regression, Build, and Deployment Readiness

**Files:**
- Temporarily create then delete: `tests/ncp-dunn-visual.local.test.tsx`
- Modify only if required by verified failures: files from Tasks 1–3

**Interfaces:**
- No new production interface.

- [ ] **Step 1: Add a temporary actual-file diagnostic test**

  Read both user files from `C:/Users/ThinkPad/Downloads/`, construct browser `File` objects, parse with paired/header options, confirm rates `[50, 20, 10, 5, 2]`, run interval `1` and R² `0.95`, and assert:

  ```ts
  expect(result.summary.retainedPointCount).toBe(3413);
  expect(result.summary.validDunnCount).toBe(261);
  expect(result.summary.excludedDunnCount).toBe(3152);
  expect(result.contributions.find((item) => item.scanRate === 10)?.coveragePercent)
    .toBeCloseTo(7.6472311749, 8);
  ```

  Exercise the pure page mapping helper or rendered page to assert the original line is complete, valid solid segments exist, excluded hatch segments exist, and no area crosses a branch boundary.

- [ ] **Step 2: Run actual CSV and XLSX diagnostics**

  Run:
  ```powershell
  node node_modules/vitest/vitest.mjs run tests/ncp-dunn-visual.local.test.tsx --reporter=verbose
  ```
  Expected: both formats pass and produce equivalent analysis counts and area semantics.

- [ ] **Step 3: Delete the local-path test**

  Remove `tests/ncp-dunn-visual.local.test.tsx` with `apply_patch`; confirm `git status` contains no user file or absolute-path test.

- [ ] **Step 4: Run focused and full verification**

  Run:
  ```powershell
  node node_modules/vitest/vitest.mjs run tests/scientific-chart.test.tsx tests/cv-import-panel.test.tsx tests/cv-page.test.tsx tests/i18n.test.tsx
  node node_modules/vitest/vitest.mjs run
  node node_modules/typescript/bin/tsc
  node node_modules/vite/bin/vite.js build
  node scripts/create-route-entries.mjs
  git diff --check
  ```
  Expected: zero failures/errors; only the existing Vite large-chunk warning is acceptable.

- [ ] **Step 5: Independent review**

  Request a reviewer to compare the implementation to `docs/superpowers/specs/2026-08-26-dunn-literature-plot-design.md`, with special attention to signed area semantics, branch boundaries, R² exclusion, exports, responsive import order, and accessibility. Fix every Critical/Major finding and re-run Step 4.

- [ ] **Step 6: Final commit if verification required changes**

  If Step 4 or review required fixes, stage only the already scoped production/test files:

  ```powershell
  git add src/components/ScientificLineChart.tsx src/components/CvImportPanel.tsx src/pages/CvKineticsPage.tsx src/locales/en.ts src/locales/zh.ts src/styles/global.css tests/scientific-chart.test.tsx tests/cv-import-panel.test.tsx tests/cv-page.test.tsx tests/i18n.test.tsx
  git commit -m "test: verify Dunn contribution visualization"
  ```

  If no files changed, skip this commit.

- [ ] **Step 7: Merge and deploy after approval**

  Fast-forward the verified feature branch into `main`, rerun the full test/build commands on clean `main`, push `origin/main`, monitor `.github/workflows/deploy-pages.yml` to success, and verify `/tools/cv-kinetics/` plus the generated CV chunk return HTTP 200.
