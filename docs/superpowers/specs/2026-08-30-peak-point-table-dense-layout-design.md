# Dense Peak-Point Table Layout Design

## Scope

Refine only the visible Peak-point adjustments table in peak-based b-value analysis. Do not change peak detection, peak-point overrides, b-value regression, Dunn analysis, stored numerical precision, CSV exports, or the desktop b-value/Dunn two-column layout.

## Root cause

The table is rendered inside the half-width b-value column. Six headings currently reserve roughly 92–132 px each, the editable potential input has a 7.5 rem minimum width, cells prevent wrapping, and scan-rate units are repeated in every row. Those constraints make the table wider than its card and force horizontal scrolling.

## Dense scientific presentation

Use six compact columns in this order:

1. `Peak`
2. `ν` with `(mV/s)` on a smaller second line
3. `E` with `(V)` on a smaller second line
4. `i` with `(arb.)` on a smaller second line
5. `ln ν`
6. `ln |i|`

Chinese mode keeps the same scientific symbols and units; accessible labels and tooltips provide the full localized column names. Units appear only in the heading, so scan-rate rows show `50`, `20`, `10`, `5`, and `2` instead of repeating `mV/s`.

## Width and precision

Use a fixed-layout, full-width table with an explicit `colgroup`. Peak and scan-rate columns are narrow; potential and current receive more space. The potential input has no large minimum width and fills only its assigned cell. Headers and checkboxes share one compact line where possible.

Potential, current, and logarithmic values use a concise display formatter suitable for the available width. Display rounding must not mutate the underlying candidate value, regression inputs, selected source point, or exports. The editable potential input retains the exact candidate value internally.

## Responsive behavior

At normal desktop and tablet half-column widths, all six columns should fit without horizontal dragging. At very narrow mobile widths, horizontal overflow remains as a safety fallback rather than shrinking text below a readable size.

## Verification

Add tests for compact headings, header-only units, scan-rate cells without repeated units, fixed column definitions, concise displayed values, preserved exact input value, and unchanged copy/export values. Verify the half-width desktop layout and a narrow mobile fallback, then run the full test suite and production build.
