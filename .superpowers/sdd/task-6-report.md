# Task 6 Report — Shared Rate Performance Interface

## Scope

Implemented the shared Rate Performance input, import mapping, dataset summary,
results, status, theory, references, chart, and export components specified by
Task 6. The work starts from baseline commit
`0e5dc7619cd2555d6c07dce62e02fd77609d9ca6` and does not connect the components
to the Task 7 analysis page.

No dependency, pnpm configuration, route, navigation, or CV analysis file was
changed. The UI continues the existing Tools visual language through `tool-*`
structures and scoped `rate-*` styles.

## RED / GREEN evidence

### RED

Command (run through the repository's existing Vitest entry with the bundled
Node runtime):

```text
vitest run tests/rate-input.test.tsx tests/scientific-chart.test.tsx tests/i18n.test.tsx
```

Observed expected feature failures:

- `rate-input.test.tsx` could not resolve the not-yet-created shared components;
- the two new log-axis behavior tests failed because the scale props were not
  implemented;
- the shared Rate Performance i18n test failed because the typed resources did
  not exist;
- the existing 33 collected chart/i18n tests still passed.

### GREEN

Focused Task 6 plus shared export regression:

```text
vitest run tests/rate-input.test.tsx tests/scientific-chart.test.tsx tests/tool-export.test.ts tests/i18n.test.tsx
```

Result: 4 files passed, 53 tests passed, 0 failed.

The initial GREEN run exposed one incorrect test selector that also matched the
input-mode radio controls. Restricting the assertion to numeric row inputs fixed
the test; no production behavior was changed for that issue.

### Review-fix RED / GREEN

The post-implementation review fixes were also driven from failing regression
tests. The first review RED run collected 37 focused tests and produced 14
expected failures plus one unhandled rejection. Those failures independently
exercised stale asynchronous imports, mixed numeric/string header detection,
explicit header handling, a 125,000-row import, instance-scoped radio groups,
viewport accessibility, physical-unit ranges, CSV formula injection, lazy XLSX
loading, and synchronous/asynchronous figure-export errors.

After the fixes, the focused parser/export/input command passes 40/40 tests.
The import race coverage now includes two files completing out of order, Clear,
Load example, switching to Manual, an external controlled-value replacement
both before and after parse completion, and controlled parents that clone an
emitted value.

## Files added

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
- `src/tools/rate-performance/utils/chartSampling.ts`
- `src/tools/rate-performance/utils/rateExports.ts`
- `tests/rate-input.test.tsx`
- `.superpowers/sdd/task-6-report.md`

## Files modified

- `src/components/ScientificLineChart.tsx`
- `src/styles/global.css`
- `src/locales/en.ts`
- `src/locales/zh.ts`
- `tests/scientific-chart.test.tsx`
- `tests/i18n.test.tsx`

## Implemented interfaces and behavior

- `RateDataInput` is controlled through a value containing `mode`, raw
  `RatePoint[]`, and `RateNormalizationContext`, with a single `onChange`
  boundary. `createInitialRateDataInputValue()` supplies six stable blank rows.
- Manual entry supports add, delete, clear, example load, and direct
  Excel-compatible two-column paste. The table viewport is keyboard reachable,
  fixed to a header plus approximately six visible rows, and vertically scrolls.
- File import delegates to the Task 2 generic `parseTabularFile` API for
  CSV/TXT/XLSX. The Rate adapter performs only header detection, explicit column
  mapping, Rate point construction, and Task 3 validation.
- XLSX support is loaded with a dynamic import only after the `.xlsx` branch is
  selected. CSV/TXT paths do not evaluate the XLSX implementation; the production
  build places it in a separate async asset while preserving the generic parser
  API used by CV.
- File parsing is generation-scoped. Unmounting, selecting another file, Clear,
  Load example, switching modes, or an external controlled-value replacement
  invalidates older work. The importer returns only points, and `RateDataInput`
  merges them against the latest controlled value instead of a captured value.
- Automatic header detection is conservative and structural: numeric cells keep
  the first row as data, while recognized Rate/Capacity labels identify headers.
  Users can override this with explicit automatic/header/data handling.
- Import summaries expose file, sheet, detected columns, mapped columns, total
  rows, valid points, invalid rows, missing values, and physical-unit ranges.
  Row identifiers remain stable across mapping changes.
- Import width and range calculations use bounded loops rather than argument
  spreading. The focused suite verifies a 125,000-row summary without stack
  overflow.
- Rate and capacity unit selections update raw metadata only. They do not invoke
  normalization. Measured-rate confirmation and theoretical-capacity context
  are explicit and use the Task 3 normalization types.
- `sampleRateChartPoints(raw, maximum)` returns a new deterministic display
  array, preserves endpoints, and never mutates or reorders raw input.
- Rate CSV serializers reuse `rowsToCsv`; the export toolbar reuses the existing
  CSV/SVG/PNG download utilities. Original, normalized, fitted, residual, and
  parameter outputs retain physical units and metadata. No logarithmic display
  coordinates enter CSV output.
- Results, status, theory, reference, chart, and export responsibilities remain
  in focused components. No scientific fitting logic was added to React.
- Every shared component label and explanatory string is routed through the
  existing typed EN/ZH resources. Example and user badges are explicitly
  `EXAMPLE RESULTS` / `示例结果` and `USER RESULTS` / `用户结果`.

## ScientificLineChart compatibility

- Added optional `xScale` and `yScale` props with values `linear | log10`.
- Omitted props still select the original linear path. A regression test compares
  complete rendered geometry for omitted and explicit linear scales, and all 45
  CV page tests pass unchanged.
- Log projection occurs only while deriving the display domain, tick labels, and
  SVG positions. Raw point values continue to drive data attributes,
  accessibility labels, selection callbacks, fitting, and export.
- Shared CSV serialization neutralizes formula-like string cells after leading
  whitespace (`=`, `+`, `-`, `@`) while preserving genuine numeric negatives.
- Figure lookup is inside the guarded export path, and every returned promise is
  caught even when the consumer omits an error callback.
- Nonpositive values on requested log axes become display gaps (or empty state
  when no positive point remains) without mutating the input series.

## Verification

- Focused review parser/export/input: 40/40 tests passed.
- Related Task 6/chart/parser/export/CV/i18n suites: all passed.
- Full suite: 37 files, 497/497 tests passed.
- CV regression evidence within the full suite:
  - `cv-page.test.tsx`: 45/45 passed;
  - `cv-analysis.test.ts`: 33/33 passed;
  - `cv-parsing.test.ts`: 49/49 passed;
  - `cv-workflow.test.ts`: 17/17 passed;
  - CV import, import panel, and cycle suites also passed.
- `node scripts/validate-data.js`: passed for 6761 material records.
- `tsc --noEmit`: exit code 0 with no diagnostics.
- `vite build`: 8450 modules transformed, exit code 0.
- Bundle inspection confirmed the XLSX implementation in the separate async
  `index-CazLJ-I9.js` asset referenced by the CV page chunk.
- Static route entry generation completed and all eight existing Rate route
  `index.html` outputs were present.

The Vite output retains the repository's pre-existing large-chunk warning. Task
6 intentionally does not change dependencies or build/code-splitting settings.

## Environment note

An initial `pnpm test` invocation attempted an interactive `node_modules`
rebuild and was immediately stopped. Git remained clean. The interrupted command
had removed top-level package links but retained the locked `.pnpm` package
content. The existing worktree-local package junctions for
`ml-levenberg-marquardt@5.1.0` and its already-present transitive packages were
restored without download or changes to `package.json`, `pnpm-lock.yaml`, or pnpm
configuration. All reported verification uses direct Node/Vitest/TypeScript/Vite
entry points.

## Deliberately deferred

- Task 7 page orchestration and analysis actions remain untouched.
- Advanced page-specific exports and copy-citation interaction remain consumers
  of these shared primitives rather than being embedded into Task 6.
- Existing global/CV technical debt and the build chunk warning are unchanged.
