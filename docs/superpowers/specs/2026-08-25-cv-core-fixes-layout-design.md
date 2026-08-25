# CV Core Flow and Layout Fixes Design

## Scope

This is a focused CV-page bug-fix and layout pass. It changes only the CV import, analysis handoff, CV page layout, related bilingual resources, and focused tests. It does not redesign the homepage, add features, change routes, alter the b-value or Dunn formulas, or weaken the explicit layout/header choices.

## Root Causes

1. `runAnalysis()` currently requires a fit whose quality status is already `valid`. When all mathematical fits exist but have `R² < 0.95`, the page throws `noBFit`, discards the complete workflow result, and leaves the result tables empty. The message is also misleading because fits do exist.
2. Analysis errors are rendered above the preview while the action button is below it, so an error can be outside the user's current viewport and appear silent.
3. Text import assumes UTF-8-compatible `File.text()`. Common Windows/Excel TXT exports can be UTF-16 with a byte-order mark and therefore reach the delimiter parser as null-padded text.
4. The outer two-column grid currently places Import Data in one narrow column and makes the following b-value and Dunn sections alternate columns instead of defining the intended row structure.

## Analysis Behavior

- A successfully computed workflow result is retained even when every fit is below the R² threshold.
- The first mathematical b-value fit is selected for inspection whether its status is `valid` or `belowRSquaredThreshold`.
- Below-threshold rows retain b/k1/k2, intercept, R², point count, and status.
- Only records with `status === "valid"` participate in threshold-gated plots and Dunn contribution integration, preserving the existing scientific quality mask.
- `noBFit` is reserved for data with no mathematical b-value fit at all.
- Any import or analysis failure is shown in a visible bilingual status block adjacent to the Run analysis action. There is no silent `return` path for an attempted analysis.

The R² help text will say:

- English: `Recommended threshold: 0.95 (only fits with R² ≥ 0.95 are treated as valid).`
- Chinese: `建议阈值：0.95（仅将 R² ≥ 0.95 的拟合视为有效）。`

The default remains `0.95`. Fits below the threshold are still displayed and explicitly marked.

## Import Compatibility

- CSV behavior remains positional and unchanged.
- CSV and TXT share one byte-decoding path that supports UTF-8, UTF-8 BOM, UTF-16LE BOM, and UTF-16BE BOM before the existing delimiter/table parser runs.
- Tab-, comma-, semicolon-, and structurally valid whitespace-delimited TXT continue to map to the same `ParsedCvTable` contract as CSV.
- XLSX keeps archive/resource preflight, scans workbook sheets in order, normalizes workbook cells, and maps the first useful sheet to the same `ParsedCvTable` contract.
- Headerless numeric CSV, TXT, and XLSX are supported when the user explicitly selects `First row is numeric data`.
- Layout and header mode remain manual; there is no automatic format guessing.

## Layout

Desktop (`> 900px`):

- Import Data spans the full CV page width.
- Its controls use a compact two-column internal grid, with format and preview areas spanning the width where necessary.
- Vertical gaps and redundant paragraph spacing are reduced without removing help or validation text.
- b-value Analysis and Dunn Analysis occupy two balanced columns on the next row.
- Results and Export remain full-width.

Mobile (`≤ 900px`):

- Import controls, b-value Analysis, and Dunn Analysis stack in one column.
- Preview tables retain internal horizontal scrolling and must not create page-level overflow.

## Verification

Focused end-to-end component tests will use scientifically equivalent three-rate datasets for:

1. CSV → import → Run analysis → b-value and Dunn records displayed.
2. UTF-16 TXT → import → Run analysis → the same internal mapping and results displayed.
3. XLSX → import → Run analysis → the same internal mapping and results displayed.

Additional tests cover all-below-threshold result retention, adjacent bilingual errors, the exact R² recommendation, desktop full-width import/two-column analysis layout, mobile stacking, existing CSV regression behavior, full test suite, TypeScript, and production build.
