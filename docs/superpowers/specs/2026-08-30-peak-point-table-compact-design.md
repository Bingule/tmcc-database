# Compact Peak-Point Table Design

## Scope

Refine only the peak-point adjustments table in the peak-based b-value analysis. Peak detection, point overrides, regression eligibility, b-value fitting, Dunn reconstruction, exports, and all other tables remain unchanged.

## Table content

The table keeps Peak, Scan rate, Potential, and Current. It removes Original source index and Point status from the visible table and replaces them with values used by the existing regression:

- `ln(ν / (mV·s⁻¹))`, calculated as `Math.log(scanRate)`;
- `ln(|i| / arb. units)`, calculated as `Math.log(Math.abs(current))`.

Unavailable, excluded, missing, non-positive-rate, or zero-current values display the existing unavailable label instead of a non-finite number. The editable potential input remains unchanged.

## Copy interaction

The adjustments card has one Copy selected columns button above the table. Each visible column heading contains one checkbox beside its label. Copying produces tab-separated text containing the selected headers and all displayed table rows. Clipboard success and failure use centralized bilingual strings and an accessible live status.

## Layout

Headers may wrap onto multiple lines and use compact widths and padding. The card retains horizontal scrolling when the viewport is narrower than the table; mobile behavior remains responsive. No duplicate column-selection list is added.

## Verification

Component tests must verify the new columns and values, absence of the two removed visible columns, inline heading checkboxes, selected-column clipboard output, and bilingual labels. Existing peak interaction and full project tests/build must remain green.
