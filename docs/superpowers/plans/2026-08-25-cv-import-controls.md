# CV Import Controls and Quality Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-selected `XYYYYY`/`XYXYXY` CV input, Excel paste, ordered scan-rate lists, 1–30 point intervals, and transparent R² quality filtering to the bilingual CV Kinetics Analysis page.

**Architecture:** Add a small import-contract module for layout, header, and scan-rate validation; extend the existing parser to produce explicit potential/current pairs; and add a workflow layer that subsamples the common grid and classifies every b-value and Dunn fit without discarding failed rows. Keep raw series immutable, use one quality mask for Dunn currents and magnitude integration, and let the React page consume the typed workflow result rather than reproduce scientific rules in UI code.

**Tech Stack:** React 19, Vite 5, TypeScript 5.7, Vitest 2, existing `read-excel-file@9.3.10`, explicit flat English/Simplified Chinese locale resources.

## Global Constraints

- Work only on branch `enhance-cv-import-controls`; do not merge or deploy automatically.
- Do not add a production dependency.
- English remains the default language; every new visible, help, placeholder, validation, error, ARIA, status, and export label requires stable English and Simplified Chinese keys.
- The user selects `XYYYYY` or `XYXYXY`; never auto-detect or silently change the layout.
- The user selects whether row 1 is headers or numeric data; default to headers.
- Accept `.csv`, `.txt`, `.xlsx`, and Excel-compatible pasted text; all data stays browser-local.
- Accept 3–20 distinct positive scan rates in `mV/s`; mapping is positional.
- Point interval is an integer 1–30, defaults to 1, and applies after common-grid interpolation to both analyses.
- Point interval is subsampling only: never smooth, average, or mutate original potential/current values.
- R² threshold is 0–1 with UI step 0.01, defaults to 0.95, and applies to both regressions; threshold 0 disables quality exclusion.
- Retain below-threshold and failed rows with explicit statuses; plots must preserve gaps.
- Dunn currents and magnitude integration use exactly the same valid-potential mask and integrate each contiguous segment separately.
- Preserve current file/ZIP resource limits, deterministic chart sampling, full scientific CSV data, direct static routes, and existing homepage/calculator behavior.
- Run repository commands with pnpm 9 where available. In this Windows workspace, the accepted fallback is the bundled Node executable with the corresponding package entry point.

---

### Task 1: Import Contracts and Scan-Rate List Validation

**Files:**
- Create: `src/lib/cvImport.ts`
- Modify: `src/lib/cvParsing.ts`
- Test: `tests/cv-import.test.ts`

**Interfaces:**

```ts
export type CvDataLayout = "sharedPotential" | "pairedPotentialCurrent";
export type CvHeaderMode = "header" | "data";

export interface CvImportOptions {
  layout: CvDataLayout;
  headerMode: CvHeaderMode;
}

export interface CvColumnPair {
  potentialColumn: number;
  currentColumn: number;
  potentialHeader: string;
  currentHeader: string;
}

export interface ParsedCvTable {
  layout: CvDataLayout;
  headerMode: CvHeaderMode;
  headers: string[];
  rows: Array<Array<string | number | null>>;
  pairs: CvColumnPair[];
}

export const MIN_SCAN_RATE_COUNT = 3;
export const MAX_SCAN_RATE_COUNT = 20;
export type CvParseErrorCode =
  | "emptyFile"
  | "malformedFile"
  | "potentialColumnMissing"
  | "currentColumnsMissing"
  | "formatRequired"
  | "oddPairColumnCount"
  | "missingScanRate"
  | "duplicateScanRate"
  | "invalidScanRate"
  | "insufficientSeries"
  | "tooManySeries"
  | "scanRateCountMismatch"
  | "resourceLimitExceeded";
export class CvParseError extends Error {
  readonly code: CvParseErrorCode;
  readonly detail: Readonly<Record<string, unknown>>;
}
export function parseScanRateList(value: string): number[];
export function makeColumnPairs(headers: string[], options: CvImportOptions): CvColumnPair[];
```

Move the existing parse error type/class into `cvImport.ts` so contract validation does not import the parser and create a circular dependency. `cvParsing.ts` imports it for internal use and re-exports `CvParseError`, `CvParseErrorCode`, and `ParsedCvTable` so existing consumers remain source-compatible. Add `formatRequired`, `oddPairColumnCount`, `scanRateCountMismatch`, and `tooManySeries`; keep all other existing parser codes, including `potentialColumnMissing` and `currentColumnsMissing`, in the complete union.

- [ ] **Step 1: Write failing contract and scan-rate tests**

Create `tests/cv-import.test.ts` with concrete cases:

```ts
expect(parseScanRateList("0.2, 0.4; 0.6\n0.8 1")).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
expect(() => parseScanRateList("1, 2")).toThrowError(expect.objectContaining({ code: "insufficientSeries" }));
expect(() => parseScanRateList(Array.from({ length: 21 }, (_, i) => i + 1).join(",")))
  .toThrowError(expect.objectContaining({ code: "tooManySeries" }));
expect(() => parseScanRateList("1,2,2")).toThrowError(expect.objectContaining({ code: "duplicateScanRate" }));
expect(() => parseScanRateList("1,0,3")).toThrowError(expect.objectContaining({ code: "invalidScanRate" }));
expect(makeColumnPairs(["E", "I1", "I2"], { layout: "sharedPotential", headerMode: "header" }))
  .toEqual([
    { potentialColumn: 0, currentColumn: 1, potentialHeader: "E", currentHeader: "I1" },
    { potentialColumn: 0, currentColumn: 2, potentialHeader: "E", currentHeader: "I2" }
  ]);
expect(() => makeColumnPairs(["E1", "I1", "E2"], { layout: "pairedPotentialCurrent", headerMode: "header" }))
  .toThrowError(expect.objectContaining({ code: "oddPairColumnCount" }));
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `pnpm test -- tests/cv-import.test.ts`

Expected: FAIL because `src/lib/cvImport.ts` and the new error codes do not exist.

- [ ] **Step 3: Implement import contracts and validation**

Use strict full-token numeric parsing rather than `parseFloat`:

```ts
const ASCII_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const tokens = value.trim().split(/[;,\s]+/u).filter(Boolean);
const rates = tokens.map((token) => {
  if (!ASCII_NUMBER.test(token)) throw new CvParseError("invalidScanRate", { token });
  const rate = Number(token);
  if (!Number.isFinite(rate) || rate <= 0) throw new CvParseError("invalidScanRate", { token });
  return rate;
});
```

Generate headerless display labels in Task 2 after the actual width is known. `makeColumnPairs()` must use positions only and must not inspect header words or numeric values.

- [ ] **Step 4: Run focused and existing parser tests**

Run: `pnpm test -- tests/cv-import.test.ts tests/cv-parsing.test.ts`

Expected: PASS with existing resource-limit and malformed-file behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cvImport.ts src/lib/cvParsing.ts tests/cv-import.test.ts
git commit -m "feat: define cv import formats and scan rates"
```

---

### Task 2: Layout-Aware Text, Paste, and XLSX Parsing

**Files:**
- Modify: `src/lib/cvParsing.ts`
- Modify: `src/lib/cvImport.ts`
- Test: `tests/cv-parsing.test.ts`
- Test: `tests/cv-import.test.ts`

**Interfaces:**

```ts
export function parseDelimitedCv(text: string, options: CvImportOptions): ParsedCvTable;
export async function parseCvFile(file: File, options: CvImportOptions): Promise<ParsedCvTable>;
export function confirmCvSeries(table: ParsedCvTable, scanRates: number[]): CvSeries[];
```

`parseDelimitedCv()` is also the Excel-paste parser; do not create a second delimiter implementation.

- [ ] **Step 1: Write failing shared-potential cases**

Add tests for header and headerless input:

```ts
const shared = parseDelimitedCv("E\tI1\tI2\n0\t1\t2\n1\t3\t4", {
  layout: "sharedPotential", headerMode: "header"
});
expect(shared.pairs.map((pair) => [pair.potentialColumn, pair.currentColumn])).toEqual([[0, 1], [0, 2]]);

const headerless = parseDelimitedCv("0\t1\t2\n1\t3\t4", {
  layout: "sharedPotential", headerMode: "data"
});
expect(headerless.headers).toEqual(["X", "Y1", "Y2"]);
expect(headerless.rows).toHaveLength(2);
```

- [ ] **Step 2: Write failing paired-column cases**

Cover independent ranges, unequal populated lengths, blank tail cells, and strict positional mapping:

```ts
const paired = parseDelimitedCv(
  "E1,I1,E2,I2\n0,10,0.1,20\n1,11,1.1,21\n,,2.1,22",
  { layout: "pairedPotentialCurrent", headerMode: "header" }
);
const series = confirmCvSeries(paired, [1, 5]);
expect(series[0].points).toEqual([{ potential: 0, current: 10 }, { potential: 1, current: 11 }]);
expect(series[1].points).toEqual([
  { potential: 0.1, current: 20 },
  { potential: 1.1, current: 21 },
  { potential: 2.1, current: 22 }
]);
```

Also assert that one blank cell in a pair does not convert its partner to zero, a pair with fewer than two valid points is rejected, and a rate-count mismatch reports `{ expected, actual }`.

- [ ] **Step 3: Run tests and confirm RED**

Run: `pnpm test -- tests/cv-import.test.ts tests/cv-parsing.test.ts`

Expected: FAIL because current parsing assumes one potential column and infers columns from headers.

- [ ] **Step 4: Implement layout-aware table construction**

Refactor the common path to:

```ts
function makeParsedTable(rawRows: CellValue[][], options: CvImportOptions): ParsedCvTable {
  const sourceHeaders = options.headerMode === "header" ? rawRows[0] : [];
  const dataRows = options.headerMode === "header" ? rawRows.slice(1) : rawRows;
  const width = rawRows[0]?.length ?? 0;
  const headers = options.headerMode === "header"
    ? sourceHeaders.map(headerText)
    : makeGeneratedHeaders(width, options.layout);
  const pairs = makeColumnPairs(headers, options);
  return { ...options, headers, rows: dataRows, pairs };
}
```

For paired input, `confirmCvSeries()` iterates each pair independently, accepts a row only when both cells are blank or both are finite numbers, and reports a stable malformed-row error when exactly one cell is populated. Preserve non-mutating sort and duplicate-potential validation in the analysis layer.

- [ ] **Step 5: Extend XLSX useful-sheet selection**

Pass `CvImportOptions` into each sheet attempt. A sheet is useful only when it satisfies the selected layout/header contract and produces the requested number of pairs later at confirmation. Preserve pre-decompression ZIP checks, workbook-wide limits, first-useful-sheet order, and stable corrupted-workbook errors.

- [ ] **Step 6: Run focused and full parser regression tests**

Run: `pnpm test -- tests/cv-import.test.ts tests/cv-parsing.test.ts tests/cv-analysis.test.ts`

Expected: PASS for both layouts, both header modes, all delimiters, Excel paste text, real multi-sheet XLSX, corrupted ZIP, and resource limits.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cvImport.ts src/lib/cvParsing.ts tests/cv-import.test.ts tests/cv-parsing.test.ts
git commit -m "feat: parse shared and paired cv layouts"
```

---

### Task 3: Point-Interval and R² Quality Workflow

**Files:**
- Create: `src/lib/cvWorkflow.ts`
- Modify: `src/lib/cvAnalysis.ts`
- Modify: `src/lib/cvTypes.ts`
- Test: `tests/cv-workflow.test.ts`
- Modify: `tests/cv-analysis.test.ts`

**Interfaces:**

```ts
export type CvFitStatus =
  | "valid"
  | "belowRSquaredThreshold"
  | "insufficientData"
  | "zeroCurrentLogUnavailable"
  | "regressionFailed";

export interface CvAnalysisSettings {
  pointInterval: number;
  rSquaredThreshold: number;
}

export interface CvFitRecord<T> {
  potential: number;
  fit: T | null;
  status: CvFitStatus;
}

export interface CvQualitySummary {
  commonPointCount: number;
  retainedPointCount: number;
  validBCount: number;
  excludedBCount: number;
  unavailableBCount: number;
  validDunnCount: number;
  excludedDunnCount: number;
  unavailableDunnCount: number;
}

export interface CvWorkflowResult {
  series: CvSeries[];
  fullGrid: InterpolatedCvData;
  analysisGrid: InterpolatedCvData;
  bRecords: Array<CvFitRecord<BValuePoint>>;
  dunnRecords: Array<CvFitRecord<DunnPoint>>;
  contributions: DunnContribution[];
  summary: CvQualitySummary;
  settings: CvAnalysisSettings;
}

export function selectPointInterval(data: InterpolatedCvData, interval: number): InterpolatedCvData;
export function analyzeCvWorkflow(series: CvSeries[], settings: CvAnalysisSettings): CvWorkflowResult;
```

Extend `DunnContribution` with `validPointCount`, `sampledPointCount`, and `coveragePercent`.

- [ ] **Step 1: Write failing point-interval tests**

```ts
const selected = selectPointInterval({
  potentials: [0, 1, 2, 3, 4, 5, 6],
  scanRates: [1, 2, 5],
  currents: [[1,2,3,4,5,6,7], [2,3,4,5,6,7,8], [3,4,5,6,7,8,9]]
}, 5);
expect(selected.potentials).toEqual([0, 5, 6]);
expect(selected.currents[0]).toEqual([1, 6, 7]);
```

Assert interval 1 returns equal values without returning mutable source arrays, interval 30 retains first/last, and 0/31/non-integers throw `CvAnalysisError("invalidPointInterval")`.

- [ ] **Step 2: Write failing quality-status tests**

Build deterministic series producing valid, low-R², zero-current, and insufficient fits. Assert every retained potential has one b record and one Dunn record, including failed attempts. Require at least three distinct usable scan rates per potential for either regression so a two-point exact line cannot report a misleading R² of 1. Assert threshold 0 retains every finite regression and threshold 1 excludes any fit below 1.

- [ ] **Step 3: Write failing same-mask integration tests**

Construct Dunn coefficients with one invalid middle potential. Assert:

```ts
expect(contribution.capacitiveCurrent[invalidIndex]).toBeNull();
expect(contribution.diffusionCurrent[invalidIndex]).toBeNull();
expect(contribution.validPointCount).toBe(4);
expect(contribution.sampledPointCount).toBe(5);
expect(contribution.coveragePercent).toBe(80);
```

Verify trapezoidal integration does not bridge the null gap and returns unavailable when no contiguous segment has two valid points.

- [ ] **Step 4: Run tests and confirm RED**

Run: `pnpm test -- tests/cv-workflow.test.ts tests/cv-analysis.test.ts`

Expected: FAIL because workflow types, interval selection, statuses, and coverage fields do not exist.

- [ ] **Step 5: Implement interval selection and fit attempts**

Use one explicit index list:

```ts
const indices = Array.from({ length: Math.ceil(data.potentials.length / interval) }, (_, i) => i * interval)
  .filter((index) => index < data.potentials.length);
const last = data.potentials.length - 1;
if (indices.at(-1) !== last) indices.push(last);
```

Refactor per-potential b/Dunn fitting into internal attempt functions returning a fit or a specific unavailable status. Apply the R² comparison only after a finite regression exists. `analyzeCvWorkflow()` validates `pointInterval` and `rSquaredThreshold`, constructs full and retained grids, classifies records, creates a Dunn coefficient array containing values only for `valid` records, and then integrates contributions.

- [ ] **Step 6: Run focused science tests**

Run: `pnpm test -- tests/cv-workflow.test.ts tests/cv-analysis.test.ts tests/regression.test.ts`

Expected: PASS with original regression underflow/overflow protections unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cvWorkflow.ts src/lib/cvAnalysis.ts src/lib/cvTypes.ts tests/cv-workflow.test.ts tests/cv-analysis.test.ts
git commit -m "feat: add cv interval and quality workflow"
```

---

### Task 4: Bilingual Import Panel and State Invalidation

**Files:**
- Create: `src/components/CvImportPanel.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Test: `tests/cv-import-panel.test.tsx`
- Modify: `tests/cv-page.test.tsx`

**Interfaces:**

```ts
export interface CvImportDraft {
  options: { layout: CvDataLayout | ""; headerMode: CvHeaderMode };
  source: "file" | "paste";
  pasteText: string;
  scanRateText: string;
  pointInterval: number;
  rSquaredThreshold: number;
}

export interface CvImportPanelProps {
  draft: CvImportDraft;
  table: ParsedCvTable | null;
  busy: boolean;
  error: CvUiError | null;
  onDraftChange(next: CvImportDraft): void;
  onFile(file: File): void;
  onParsePaste(): void;
  onAnalyze(): void;
}
```

- [ ] **Step 1: Write failing bilingual control tests**

Assert the panel contains:

- a required layout radio group with no initial selection;
- header/data radios with header selected;
- file/paste source controls;
- a textarea only in paste mode;
- scan-rate placeholder `0.2, 0.4, 0.6, 0.8, 1`;
- interval options 1 through 30 with 1 selected;
- R² number input min 0, max 1, step 0.01, value 0.95;
- English and Simplified Chinese help, labels, ARIA, and format examples.

- [ ] **Step 2: Write failing state-invalidation tests**

Import and analyze a valid dataset, then independently change layout, header mode, source text, scan rates, interval, and threshold. After each change assert old results and enabled exports disappear immediately. Use deferred file promises to retain the existing stale-import race test.

- [ ] **Step 3: Run tests and confirm RED**

Run: `pnpm test -- tests/cv-import-panel.test.tsx tests/cv-page.test.tsx`

Expected: FAIL because the panel and controls do not exist.

- [ ] **Step 4: Implement the controlled panel**

The page owns the draft and analysis state; `CvImportPanel` renders controls and preview only. Use one reset function whenever an analysis-affecting field changes:

```ts
function invalidateAnalysis() {
  setAnalysis(null);
  setSelectedPotential(undefined);
  setSelectedRate(undefined);
  setError(null);
}
```

File and paste parsing call the same layout-aware parser. Disable Analyze until layout is selected, a table is parsed, scan rates validate and match pair count, interval/threshold validate, and no parse operation is active. Display the first five rows and positional mapping before confirmation.

- [ ] **Step 5: Add centralized locale keys**

Use stable groups such as:

```text
cv.import.layout
cv.import.layout.shared
cv.import.layout.paired
cv.import.headerMode
cv.import.source.file
cv.import.source.paste
cv.import.paste.placeholder
cv.import.scanRates
cv.import.pointInterval
cv.import.rSquaredThreshold
cv.import.mapping.shared
cv.import.mapping.paired
cv.error.formatRequired
cv.error.oddPairColumnCount
cv.error.scanRateCountMismatch
cv.error.tooManySeries
```

- [ ] **Step 6: Run focused page tests**

Run: `pnpm test -- tests/cv-import-panel.test.tsx tests/cv-page.test.tsx tests/i18n.test.tsx`

Expected: PASS with EN → 中文 → EN preserving draft, parsed table, and completed results.

- [ ] **Step 7: Commit**

```bash
git add src/components/CvImportPanel.tsx src/pages/CvKineticsPage.tsx src/locales/en.ts src/locales/zh.ts tests/cv-import-panel.test.tsx tests/cv-page.test.tsx
git commit -m "feat: add bilingual cv import controls"
```

---

### Task 5: Quality Results, Plot Gaps, and Reproducible Exports

**Files:**
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/components/ScientificLineChart.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Test: `tests/cv-page.test.tsx`
- Modify: `tests/scientific-chart.test.tsx`
- Modify: `tests/tool-export.test.ts`

**Interfaces:**

The page consumes `CvWorkflowResult`. Export helpers receive the workflow result plus import metadata; they do not re-run analysis.

- [ ] **Step 1: Write failing summary and status-table tests**

Assert the page displays layout, source, curve count, ordered rates, overlap, full/retained point counts, interval, threshold, valid/excluded/unavailable counts, and Dunn coverage. Assert b and Dunn tables contain localized status columns and retain a below-threshold row whose scientific output is absent from the valid chart.

- [ ] **Step 2: Write failing plot-gap and selection tests**

Create valid → excluded → valid potentials. Assert the SVG path has separate `M` segments and that selecting the excluded potential displays its R² and localized exclusion reason without substituting the nearest valid fit.

- [ ] **Step 3: Write failing export tests**

Capture all six CSV downloads. Verify relevant schemas include data layout, point interval, R² threshold, fit status, and coverage, and that low-quality/unavailable rows remain present. Below-threshold rows retain their calculated fit values and R² so users can audit the exclusion; only genuinely unavailable fits use blank scientific cells. Verify English/Chinese headers follow the active language. Assert exported SVG titles or legends contain `interval = 5` and `R² ≥ 0.95`; PNG uses the same SVG source.

- [ ] **Step 4: Run tests and confirm RED**

Run: `pnpm test -- tests/cv-page.test.tsx tests/scientific-chart.test.tsx tests/tool-export.test.ts`

Expected: FAIL because the page still consumes only successful fits and exports no quality metadata.

- [ ] **Step 5: Render workflow records and metadata**

Build chart point arrays directly from full record arrays:

```ts
const bSeries = result.bRecords.map((record) => ({
  x: record.potential,
  y: record.status === "valid" ? record.fit!.b : null
}));
```

Use exact-potential selection, never nearest-value substitution. Contribution tables show `validPointCount / sampledPointCount` and coverage. Keep original CV plots at full raw resolution subject only to the already disclosed deterministic display/export sampling; analysis and CSV arrays remain full.

- [ ] **Step 6: Add export metadata without comment rows**

Keep CSV files machine-readable. Add explicit columns to fit/summary tables rather than prepending free-form comments. For wide current matrices where per-row metadata would be wasteful, encode interval/threshold/layout in localized headers or add them to the contribution-summary rows. Do not add a seventh export file.

- [ ] **Step 7: Run focused and full CV tests**

Run: `pnpm test -- tests/cv-page.test.tsx tests/cv-workflow.test.ts tests/scientific-chart.test.tsx tests/tool-export.test.ts`

Expected: PASS for quality filtering, exact selection, gap preservation, bilingual schemas, complete rows, and export cleanup.

- [ ] **Step 8: Commit**

```bash
git add src/pages/CvKineticsPage.tsx src/components/ScientificLineChart.tsx src/locales/en.ts src/locales/zh.ts tests/cv-page.test.tsx tests/scientific-chart.test.tsx tests/tool-export.test.ts
git commit -m "feat: report cv fit quality and settings"
```

---

### Task 6: Responsive Styling and Documentation

**Files:**
- Modify: `src/styles/global.css`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Test: `tests/tools-markup.test.tsx`

**Interfaces:** None; this task integrates the new controls with the existing Tools visual language.

- [ ] **Step 1: Write failing markup and responsive-hook tests**

Assert fieldsets have legends, labels target unique IDs, error/status output is live, textarea is accessible, format examples use semantic code/table markup, the scan-rate field does not overflow at 320 px, and interval/threshold controls remain keyboard-operable.

- [ ] **Step 2: Run tests and confirm RED**

Run: `pnpm test -- tests/tools-markup.test.tsx tests/cv-import-panel.test.tsx`

Expected: FAIL for missing final class hooks or semantic markup.

- [ ] **Step 3: Add scoped styles**

Use existing `cv-`, `tool-`, and `tools-` prefixes. Add a compact format-choice grid, responsive source controls, full-width paste textarea with a practical minimum height, wrapping mapping summary, and aligned interval/threshold fields. Preserve homepage declarations and maintain a single-column layout at or below 900 px.

- [ ] **Step 4: Update documentation**

Document both layouts with examples, header/headerless behavior, paste privacy, 3–20 ordered rates, point-interval semantics, no smoothing, R² filtering, retained statuses, valid coverage, and export metadata. Add an `Unreleased` changelog bullet without changing version `0.1.0`.

- [ ] **Step 5: Run focused tests and build**

Run: `pnpm test -- tests/tools-markup.test.tsx tests/cv-import-panel.test.tsx tests/cv-page.test.tsx`

Run: `pnpm build`

Expected: PASS and all four static Tools route entries remain present.

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css README.md CHANGELOG.md tests/tools-markup.test.tsx
git commit -m "docs: explain cv import and quality controls"
```

---

### Task 7: Full Verification and Branch Review

**Files:**
- Modify only if verification reveals a scoped defect.
- Record ignored evidence in `.superpowers/sdd/cv-import-controls-verification.md`.

**Interfaces:** None; this task proves the integrated branch without merging or deploying it.

- [ ] **Step 1: Run data validation**

Run: `pnpm validate:data`

Expected: 6,761 material records pass with no changes under `data/` or `src/data/`.

- [ ] **Step 2: Run the complete test suite**

Run: `pnpm test`

Expected: exit 0, zero failed tests, zero React warnings, and zero unhandled promise rejections.

- [ ] **Step 3: Run TypeScript and production build**

Run: `pnpm exec tsc --noEmit`

Run: `pnpm build`

Expected: exit 0. Confirm:

```text
dist/index.html
dist/tools/index.html
dist/tools/cv-kinetics/index.html
dist/tools/theoretical-capacity/index.html
dist/tools/molecular-weight/index.html
```

- [ ] **Step 4: Inspect dependency and data scope**

Run:

```bash
git diff main...HEAD -- package.json pnpm-lock.yaml
git diff main...HEAD -- data src/data
git diff --check main...HEAD
git status --short --branch
```

Expected: no new dependency, no material-data changes, no whitespace errors, clean `enhance-cv-import-controls` branch.

- [ ] **Step 5: Perform browser verification**

On `/tools/cv-kinetics`, verify English default in a clean storage context, Chinese switching and refresh persistence, both layouts with headers and headerless paste, a 20-rate input, interval 1/5/30, threshold 0/0.95/1, low-quality status/gaps, six CSV downloads, four SVG/PNG controls, and 320/768/1280 px layouts. Confirm homepage and both calculators still behave normally.

- [ ] **Step 6: Request final whole-branch review**

Review `main...HEAD` against `docs/superpowers/specs/2026-08-25-cv-import-controls-design.md`. Reject completion for any incorrect scientific mapping, silent data substitution, R² mask mismatch, interval mutation, missing bilingual string, stale-state race, export omission, or regression.

- [ ] **Step 7: Commit verification-only documentation if tracked files changed**

Do not create an empty commit. Do not merge, push, or deploy without a later explicit user instruction.
