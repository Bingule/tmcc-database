# Dense Peak-Point Table Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fit all six peak-point adjustment columns inside the normal half-width b-value card without horizontal dragging at desktop/tablet widths, while preserving exact analysis and export data.

**Architecture:** Keep the existing table and clipboard data flow, but separate compact visual cell values from the existing copy values. Render a fixed six-column `colgroup`, symbolic two-line headings, and constrained inputs; retain the existing overflow wrapper only as a narrow-mobile fallback.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, existing bilingual resources.

## Global Constraints

- Work only on `fix-dunn-literature-plot`; do not merge `main`.
- Modify only the visible Peak-point adjustments table and its tests/styles.
- Do not change peak detection, point overrides, b-value regression, Dunn analysis, or CSV export schemas.
- Keep full internal candidate precision and exact regression inputs.
- Keep English and Simplified Chinese accessibility labels.
- Preserve horizontal overflow only below the readable minimum mobile width.

Use this PowerShell variable for every Node-based verification command:

```powershell
$nodePath = 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
```

---

### Task 1: Lock the dense table contract with failing tests

**Files:**
- Modify: `tests/cv-peak-charts.test.tsx`

**Interfaces:**
- Consumes: `CvPeakAnalysisPanel`, `CvPeakPanelCopy`, and existing NCP-like fixture data.
- Produces: regression coverage for six fixed columns, symbolic/unit headings, compact display values, exact input values, and unchanged clipboard precision.

- [ ] **Step 1: Add failing structural expectations**

Extend the compact-table test with these assertions:

```tsx
expect(table.querySelectorAll("colgroup col")).toHaveLength(6);
expect(Array.from(table.querySelectorAll("thead [data-peak-short-label]"))
  .map((node) => node.textContent)).toEqual(["Peak", "ν", "E", "i", "ln ν", "ln |i|"]);
expect(Array.from(table.querySelectorAll("thead [data-peak-unit]"))
  .map((node) => node.textContent)).toEqual(["(mV/s)", "(V)", "(arb.)"]);
expect(table.querySelector("thead")?.textContent).not.toContain("Scan rate");
```

- [ ] **Step 2: Add failing display-versus-data expectations**

Use the first peak point to verify that the rate cell omits repeated units, the potential input retains the exact candidate string, the current/log cells use compact display formatting, and clipboard text still uses the existing full values:

```tsx
function formatExpectedCompact(value: number): string {
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-4) return value.toExponential(3);
  return Number(value.toPrecision(5)).toString();
}

const firstPoint = result.fits[0]!.points[0]!;
const firstRow = table.querySelector<HTMLTableRowElement>("tbody tr")!;
expect(firstRow.querySelector('[data-peak-cell="scanRate"]')?.textContent).toBe(String(firstPoint.scanRate));
expect(firstRow.querySelector('[data-peak-cell="scanRate"]')?.textContent).not.toContain("mV/s");
expect(firstRow.querySelector<HTMLInputElement>("input")?.defaultValue)
  .toBe(String(firstPoint.candidate!.potential));
expect(firstRow.querySelector('[data-peak-cell="current"]')?.textContent)
  .toBe(formatExpectedCompact(firstPoint.candidate!.current));
```

- [ ] **Step 3: Verify RED**

Run:

```powershell
& $nodePath '.\node_modules\vitest\vitest.mjs' run tests/cv-peak-charts.test.tsx
```

Expected: the new test fails because the current table has no `colgroup`, renders full text headings, repeats `mV/s`, and uses six-decimal visible cells.

---

### Task 2: Separate compact display values from exact copy values

**Files:**
- Modify: `src/components/CvPeakAnalysisPanel.tsx`
- Test: `tests/cv-peak-charts.test.tsx`

**Interfaces:**
- Consumes: exact `CvPeakRatePoint.scanRate`, `candidate.potential`, and `candidate.current`.
- Produces: `displayValues` for the table and `copyValues` for clipboard TSV; both use the existing `PeakPointColumnKey` keys.

- [ ] **Step 1: Add a compact formatter**

Add a display-only formatter that keeps five significant digits and avoids unnecessarily long decimals:

```ts
function formatCompact(value: number | null, unavailable: string): string {
  if (value === null || !Number.isFinite(value)) return unavailable;
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-4) return value.toExponential(3);
  return Number(value.toPrecision(5)).toString();
}
```

- [ ] **Step 2: Build independent display and copy maps**

Replace the single `values` map with:

```ts
displayValues: {
  peak: peakName(fit.labelIndex),
  scanRate: formatCompact(point.scanRate, copy.unavailable),
  potential: formatCompact(candidate?.potential ?? null, copy.unavailable),
  current: formatCompact(candidate?.current ?? null, copy.unavailable),
  logScanRate: formatCompact(naturalLog(point.scanRate), copy.unavailable),
  logCurrent: formatCompact(naturalLog(candidate ? Math.abs(candidate.current) : null), copy.unavailable)
},
copyValues: {
  peak: peakName(fit.labelIndex),
  scanRate: `${point.scanRate} mV/s`,
  potential: format(candidate?.potential ?? null, 6, copy.unavailable),
  current: format(candidate?.current ?? null, 6, copy.unavailable),
  logScanRate: formatNaturalLog(point.scanRate, copy.unavailable),
  logCurrent: formatNaturalLog(candidate ? Math.abs(candidate.current) : null, copy.unavailable)
}
```

Define `naturalLog` so invalid values remain unavailable without changing the existing regression:

```ts
function naturalLog(value: number | null): number | null {
  return value === null || !Number.isFinite(value) || value <= 0 ? null : Math.log(value);
}
```

- [ ] **Step 3: Keep clipboard output exact**

Change TSV construction to read from `row.copyValues[column.key]`, while visible cells read from `displayValues`.

- [ ] **Step 4: Verify GREEN for data behavior**

Run the focused test and expect all component tests to pass.

---

### Task 3: Render symbolic headings and fixed column widths

**Files:**
- Modify: `src/components/CvPeakAnalysisPanel.tsx`
- Modify: `src/styles/global.css`
- Test: `tests/cv-peak-charts.test.tsx`

**Interfaces:**
- Consumes: existing full localized `column.label` for `title` and `aria-label`.
- Produces: visual `shortLabel`, optional `unit`, and `width` metadata for each of six columns.

- [ ] **Step 1: Extend visible column metadata**

Use this exact column definition:

```ts
interface PeakPointColumn {
  key: PeakPointColumnKey;
  label: string;
  shortLabel: string;
  unit?: string;
  width: string;
}

const pointColumns = [
  { key: "peak", label: copy.peak, shortLabel: copy.peak, width: "11%" },
  { key: "scanRate", label: copy.scanRate, shortLabel: "ν", unit: "(mV/s)", width: "14%" },
  { key: "potential", label: copy.potential, shortLabel: "E", unit: "(V)", width: "21%" },
  { key: "current", label: copy.current, shortLabel: "i", unit: "(arb.)", width: "19%" },
  { key: "logScanRate", label: copy.logScanRate, shortLabel: "ln ν", width: "16%" },
  { key: "logCurrent", label: copy.logCurrent, shortLabel: "ln |i|", width: "19%" }
] satisfies Array<PeakPointColumn>;
```

- [ ] **Step 2: Render `colgroup` and compact accessible headings**

Add before `<thead>`:

```tsx
<colgroup>
  {pointColumns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
</colgroup>
```

Render each heading as:

```tsx
<label className="cv-table-column-heading cv-peak-column-heading" title={column.label}>
  <span className="cv-peak-heading-text">
    <span data-peak-short-label>{column.shortLabel}</span>
    {column.unit && <small data-peak-unit>{column.unit}</small>}
  </span>
  <input
    type="checkbox"
    value={column.key}
    checked={selectedPointColumns.has(column.key)}
    aria-label={`${copy.copyColumns}: ${column.label}`}
    onChange={() => togglePointColumn(column.key)}
  />
</label>
```

- [ ] **Step 3: Scope cells for verification and exact editing**

Add `data-peak-cell` attributes to each cell. Keep the input `defaultValue={candidate.potential}` so display compaction never mutates the editable source value.

- [ ] **Step 4: Replace width-forcing CSS**

Use these scoped rules:

```css
.cv-peak-points-table {
  width: 100%;
  min-width: 480px;
  table-layout: fixed;
}

.cv-peak-points-table th,
.cv-peak-points-table td {
  padding: 6px 4px;
  overflow: hidden;
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-peak-column-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 16px;
  align-items: center;
  gap: 3px;
  width: 100%;
  max-width: none;
}

.cv-peak-heading-text {
  display: grid;
  min-width: 0;
  gap: 1px;
  line-height: 1.05;
}

.cv-peak-heading-text small {
  font-size: 0.66rem;
  font-weight: 650;
  text-transform: none;
}

.cv-peak-column-heading input {
  width: 15px;
  height: 15px;
}

.cv-peak-potential-input {
  min-width: 0;
  width: 100%;
  padding: 6px 5px;
  font-size: 0.82rem;
}

.cv-peak-points-card .cv-table-copy-toolbar button {
  padding: 6px 9px;
  font-size: 0.8rem;
}
```

The existing `.cv-table-scroll { overflow-x: auto; }` remains the narrow-mobile fallback.

- [ ] **Step 5: Verify GREEN for structure and styles**

Run the focused component and page tests; expect PASS.

---

### Task 4: Full regression and production verification

**Files:**
- Verify: all modified files

**Interfaces:**
- Consumes: final component, CSS, and tests.
- Produces: evidence that algorithms, bilingual UI, exports, and production build remain intact.

- [ ] **Step 1: Run TypeScript validation**

```powershell
& $nodePath '.\node_modules\typescript\bin\tsc' --noEmit
```

Expected: exit code 0.

- [ ] **Step 2: Run the full test suite**

```powershell
& $nodePath '.\node_modules\vitest\vitest.mjs' run
```

Expected: all test files and tests pass.

- [ ] **Step 3: Run the production build**

```powershell
& $nodePath '.\node_modules\vite\bin\vite.js' build
& $nodePath '.\scripts\create-route-entries.mjs'
```

Expected: Vite build and route-entry generation exit with code 0.

- [ ] **Step 4: Commit the focused implementation**

```powershell
git add src/components/CvPeakAnalysisPanel.tsx src/styles/global.css tests/cv-peak-charts.test.tsx
git commit -m "fix: fit peak point table within analysis card"
```

Do not push or deploy until the user explicitly requests or confirms deployment of this revision.
