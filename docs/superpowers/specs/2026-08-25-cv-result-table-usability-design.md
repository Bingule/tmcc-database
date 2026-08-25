# CV Result Table Usability Design

Date: 2026-08-25
Branch: `cv-result-table-usability`

## Goal

Make the CV kinetics result tables compact and easier to reuse without changing scientific calculations, imports, charts, or exports.

## Scope

This change applies only to result tables rendered by the CV kinetics page, including:

- b-value fit records
- the selected b-value record
- original measured current
- interpolated and reconstructed Dunn currents
- contribution summaries
- Dunn fit records

The one-row selected b-value record keeps the compact table presentation and does not need column-copy controls. All multi-row result tables receive the controls described below.

## Table Viewport

- A table with up to 12 body rows uses its natural height.
- A table with more than 12 body rows is placed in a vertically scrollable viewport sized to show 12 standard-height rows.
- Existing horizontal scrolling remains available for wide tables.
- The table header remains sticky at the top of the scroll viewport.
- The existing 500-row DOM rendering safety cap remains unchanged.
- When more than 500 rows exist, the existing localized “showing rows” notice remains visible.

The 12-row viewport changes presentation only. It does not subsample, filter, or modify scientific data.

## Column Selection and Copying

Each multi-row result table displays a compact toolbar above the table:

- one checkbox per table column
- a localized “Copy selected columns” button
- an accessible localized status message

Behavior:

- No columns are selected initially.
- The copy button is disabled until at least one column is selected.
- Columns are copied in their original table order, regardless of checkbox click order.
- Copied text contains a header row followed by every source result row.
- Columns are separated by tab characters and rows by new lines so the content can be pasted directly into Excel or similar spreadsheet software.
- Copying uses the complete `rows` data passed to the table, including rows beyond the 500-row DOM rendering cap.
- Display formatting is reused for copied values so copied cells match the visible table.
- A successful copy shows a localized confirmation.
- A clipboard failure shows a localized error without changing the selected columns or table data.

The implementation uses the browser Clipboard API. The production site is served over HTTPS, where this API is available. Failure remains visible rather than silent.

## Architecture

The shared `DataTable` helper on `CvKineticsPage` remains the single integration point.

It will:

- own the selected-column state for its table instance
- render the copy toolbar only when the table has more than one row
- build tab-delimited clipboard text from the original headers and rows
- keep the scrollable table and the row-limit notice together

No scientific analysis state is added to the page. Column selection remains local to each table instance while the page is mounted. Selected column indices remain stable when the language changes, while copied headers use the currently visible language.

Styling is added only to the CV result-table toolbar and scroll viewport. Existing global table styles remain intact for other pages.

## Internationalization and Accessibility

New stable translation keys are added to both English and Simplified Chinese resources for:

- copy toolbar label
- copy button
- copy success
- copy failure

Each checkbox has a visible label using the existing localized column header. The status message uses an ARIA live region. The sticky header and scroll viewport remain keyboard and touch accessible.

## Error Handling

- Clipboard rejection is caught and reported in the table toolbar.
- Empty selection cannot trigger a clipboard call because the button is disabled.
- Null table values retain the existing em-dash formatting.
- Copying does not mutate result rows or analysis state.

## Testing

Automated tests will verify:

1. A long result table receives the 12-row scroll viewport class and sticky-header styling.
2. Short tables do not gain unnecessary vertical scrolling.
3. Column checkboxes are initially clear and the copy button is disabled.
4. Selecting columns enables copying and writes headers plus all rows in original column order as tab-delimited text.
5. Copying uses rows beyond the visible 500-row DOM cap.
6. Clipboard success and failure messages are localized in English and Chinese.
7. Existing CV analysis, export, layout, full test suite, and production build remain valid.

## Explicit Non-Goals

- No spreadsheet-style cell editing
- No column sorting, filtering, reordering, or resizing
- No row selection
- No changes to raw/interpolated CV data exports
- No changes to scientific formulas or interpolation
- No homepage or unrelated page redesign

## Addendum: R² Threshold Result Filtering

Low-quality fits already receive the stable `belowRSquaredThreshold` status and are already excluded from charts and Dunn integration. They will now also be omitted from visible fitted-result tables, table clipboard output, potential-result navigation, and the b-value/Dunn fit-record CSV exports.

The workflow retains these classified records internally so the quality summary can continue to report how many fits were excluded and so the scientific mask remains aligned with the common potential grid. Raw uploaded CV points, the interpolated-current export, and unavailable fits without a finite R² are not deleted by this filter. A threshold of `0` continues to disable R² exclusion.
