# CV Result Table Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit CV result tables to a 12-row scroll viewport and let users select columns and copy the complete selected result data into spreadsheet software.

**Architecture:** Keep the shared `DataTable` helper as the only CV table integration point. Add local presentation state for column selection and clipboard status, keep the existing 500-row DOM cap, and copy from complete source rows. Add only CV-scoped CSS and centralized bilingual strings.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/jsdom, browser Clipboard API, existing CSS and i18n resources.

## Global Constraints

- Apply only to CV kinetics result tables.
- Show 12 standard-height body rows before vertical scrolling; keep horizontal scrolling and sticky headers.
- Keep `MAX_TABLE_ROWS = 500` for DOM rendering.
- Copy complete source rows, including rows beyond the DOM cap.
- Copy selected columns in table order with tabs and CRLF row separators.
- Start with no selected columns and disable copy until a selection exists.
- Keep all UI strings in English and Simplified Chinese locale resources.
- Do not modify scientific formulas, analysis, imports, charts, CSV exports, homepage, or unrelated pages.
- Write and run a failing regression test before each production change.

## File Map

- `src/pages/CvKineticsPage.tsx`: viewport classes, column-selection state, clipboard text, copy action, status UI.
- `src/styles/global.css`: CV-only scroll frame, sticky header, toolbar, responsive layout.
- `src/locales/en.ts`, `src/locales/zh.ts`: copy labels and statuses.
- `tests/cv-page.test.tsx`: real page interaction, clipboard success/failure, full-row copying.
- `tests/tools-markup.test.tsx`: scoped CSS contract.

---

### Task 1: Add the 12-row result-table viewport

**Files:**
- Modify: `tests/cv-page.test.tsx`
- Modify: `tests/tools-markup.test.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `MAX_VISIBLE_TABLE_ROWS = 12`
- Produces: `.cv-result-table-frame`
- Produces: `.cv-result-table-frame-scroll` only when rendered rows exceed 12
- Preserves: `MAX_TABLE_ROWS = 500` and `cv.table.showingRows`

- [ ] **Step 1: Write failing long-table and short-table DOM assertions**

Extend a real analysis flow in `tests/cv-page.test.tsx`:

```tsx
const longFrame = view.querySelector('[data-table-id="cv-dunn-current-table"]')
  ?.closest('.cv-result-table-frame');
expect(longFrame?.classList.contains('cv-result-table-frame-scroll')).toBe(true);

const shortFrame = view.querySelector('[data-table-id="cv-contribution-table"]')
  ?.closest('.cv-result-table-frame');
expect(shortFrame?.classList.contains('cv-result-table-frame-scroll')).toBe(false);
```

Use more than 12 Dunn-current rows and no more than 12 contribution rows.

- [ ] **Step 2: Write a failing CSS contract test**

Add to `tests/tools-markup.test.tsx`:

```ts
expect(css).toMatch(/\.cv-result-table-frame-scroll\s*\{[^}]*--cv-visible-table-rows:\s*12[^}]*overflow-y:\s*auto/s);
expect(css).toMatch(/\.cv-result-table-frame-scroll\s+thead\s+th\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/s);
```

- [ ] **Step 3: Run the focused tests and confirm RED**

```bash
npm test -- --run tests/cv-page.test.tsx tests/tools-markup.test.tsx
```

Expected: FAIL because the frame classes and CSS do not exist.

- [ ] **Step 4: Implement minimal viewport markup**

Add in `src/pages/CvKineticsPage.tsx`:

```ts
export const MAX_VISIBLE_TABLE_ROWS = 12;
```

Update `DataTable` without changing the row cap:

```tsx
const displayedRows = rows.slice(0, MAX_TABLE_ROWS);
const scrollsVertically = displayedRows.length > MAX_VISIBLE_TABLE_ROWS;

return <div className="cv-result-table-block">
  <div className={`tool-table-wrap cv-result-table-frame${scrollsVertically ? " cv-result-table-frame-scroll" : ""}`}>
    <table data-table-id={tableId}>...</table>
  </div>
  {rows.length > displayedRows.length && <p role="status">
    {t("cv.table.showingRows", { shown: displayedRows.length, total: rows.length })}
  </p>}
</div>;
```

- [ ] **Step 5: Add minimal CV-scoped CSS**

Add in `src/styles/global.css`:

```css
.cv-result-table-frame-scroll {
  --cv-visible-table-rows: 12;
  max-height: calc(43px * (var(--cv-visible-table-rows) + 1));
  overflow-y: auto;
}

.cv-result-table-frame-scroll thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f5f7f6;
}

.cv-result-table-frame-scroll th,
.cv-result-table-frame-scroll td {
  height: 43px;
  box-sizing: border-box;
}
```

The extra row in `max-height` is the sticky header; twelve body rows remain visible.

- [ ] **Step 6: Run focused tests and confirm GREEN**

```bash
npm test -- --run tests/cv-page.test.tsx tests/tools-markup.test.tsx
```

Expected: both files pass and existing row-count assertions remain unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/pages/CvKineticsPage.tsx src/styles/global.css tests/cv-page.test.tsx tests/tools-markup.test.tsx
git commit -m "feat: compact CV result tables"
```

---

### Task 2: Add selectable-column clipboard copying

**Files:**
- Modify: `tests/cv-page.test.tsx`
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`

**Interfaces:**
- Produces: `selectedColumns: Set<number>` per multi-row table
- Produces: `copySelectedColumns(): Promise<void>`
- Produces keys: `cv.table.copy.columns`, `cv.table.copy.action`, `cv.table.copy.success`, `cv.table.copy.error`
- Consumes: existing `format(value)` and complete `rows`

- [ ] **Step 1: Write a failing full-data clipboard test**

In `tests/cv-page.test.tsx`, install the clipboard spy:

```tsx
const writeText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText }
});
```

Run an analysis with more than 500 Dunn-current rows. Select column indices `0` and `3` in the toolbar belonging to `cv-dunn-current-table`, then assert:

```tsx
const copyButton = [...toolbar.querySelectorAll('button')]
  .find((item) => item.textContent === "Copy selected columns")!;
expect(copyButton.disabled).toBe(true);
await act(async () => toolbar.querySelector<HTMLInputElement>('input[value="3"]')!.click());
await act(async () => toolbar.querySelector<HTMLInputElement>('input[value="0"]')!.click());
await act(async () => copyButton.click());

const copied = writeText.mock.calls[0][0] as string;
expect(copied.split("\r\n")).toHaveLength(sourceRowCount + 1);
expect(copied.split("\r\n")[0]).toBe("Potential (V)\tCapacitive contribution (arb. units)");
expect(copied).not.toContain("Interpolated input current");
```

Selecting index `3` before `0` proves copied columns still follow table order. The line count proves copying is not limited to 500 DOM rows.

- [ ] **Step 2: Add failing status and localization assertions**

After success, assert `Copied selected columns.`. Make `writeText` reject, click again, and assert `Could not copy selected columns.`. Switch the page to Chinese and assert the toolbar uses `复制所选列` and `无法复制所选列。`.

- [ ] **Step 3: Run the page test and confirm RED**

```bash
npm test -- --run tests/cv-page.test.tsx
```

Expected: FAIL because the toolbar, clipboard behavior, and strings do not exist.

- [ ] **Step 4: Add bilingual resources**

Add to `src/locales/en.ts`:

```ts
"cv.table.copy.columns": "Columns to copy",
"cv.table.copy.action": "Copy selected columns",
"cv.table.copy.success": "Copied selected columns.",
"cv.table.copy.error": "Could not copy selected columns.",
```

Add to `src/locales/zh.ts`:

```ts
"cv.table.copy.columns": "选择要复制的列",
"cv.table.copy.action": "复制所选列",
"cv.table.copy.success": "已复制所选列。",
"cv.table.copy.error": "无法复制所选列。",
```

- [ ] **Step 5: Implement table-local selection and copying**

Import `useId`, then add inside `DataTable`:

```tsx
const controlId = useId();
const [selectedColumns, setSelectedColumns] = useState<Set<number>>(() => new Set());
const [copyStatus, setCopyStatus] = useState<"success" | "error" | null>(null);
const supportsColumnCopy = rows.length > 1;

function toggleColumn(index: number) {
  setSelectedColumns((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return next;
  });
  setCopyStatus(null);
}

async function copySelectedColumns() {
  const indices = headers.map((_, index) => index)
    .filter((index) => selectedColumns.has(index));
  if (indices.length === 0) return;
  const text = [headers, ...rows]
    .map((row) => indices.map((index) => format(row[index] ?? null)).join("\t"))
    .join("\r\n");
  try {
    await navigator.clipboard.writeText(text);
    setCopyStatus("success");
  } catch {
    setCopyStatus("error");
  }
}
```

Render a `.cv-table-copy-toolbar` before the table frame only when `supportsColumnCopy`. It contains a visible localized label, one controlled checkbox per header, a button disabled when `selectedColumns.size === 0`, and an `aria-live="polite"` status. Use header indices for checkbox values and keys so duplicate header text remains valid.

- [ ] **Step 6: Add compact responsive toolbar CSS**

```css
.cv-table-copy-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 12px 0 6px;
}

.cv-table-copy-columns {
  display: flex;
  flex: 1 1 420px;
  flex-wrap: wrap;
  gap: 6px 12px;
}

.cv-table-copy-columns label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-weight: 500;
}

.cv-table-copy-toolbar button { margin: 0; }
.cv-table-copy-toolbar [role="status"] { flex-basis: 100%; min-height: 1.4em; }
```

- [ ] **Step 7: Run focused tests and confirm GREEN**

```bash
npm test -- --run tests/cv-page.test.tsx tests/tools-markup.test.tsx tests/i18n.test.tsx
```

Expected: all focused tests pass. The one-row selected b-value table has no toolbar.

- [ ] **Step 8: Commit**

```bash
git add src/pages/CvKineticsPage.tsx src/styles/global.css src/locales/en.ts src/locales/zh.ts tests/cv-page.test.tsx tests/tools-markup.test.tsx
git commit -m "feat: copy selected CV result columns"
```

---

### Task 3: Verify and prepare deployment

**Files:**
- Verify only; no planned production changes

**Interfaces:**
- Consumes all Task 1 and Task 2 behavior
- Produces passing test/build evidence and a clean reviewed branch

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: zero failed test files.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected: TypeScript and Vite finish successfully. Existing bundle-size warnings are acceptable; new errors are not.

- [ ] **Step 3: Check scope and whitespace**

```bash
git diff main...HEAD --check
git diff main...HEAD --stat
git status --short --branch
```

Expected: no whitespace errors; only the spec/plan, CV page, CV styles, locales, and related tests changed; tree clean.

- [ ] **Step 4: Request focused review**

Reviewer checks that the 12-row class is conditional, headers stay sticky, copying uses complete `rows`, columns remain in table order, failures are localized, the one-row table stays compact, and scientific/export logic is untouched. Resolve every Critical or Important finding before deployment.

- [ ] **Step 5: Deploy after authorization**

Merge the reviewed branch into `main`, push `main`, monitor `.github/workflows/deploy-pages.yml` to success, and verify `https://tmccdb.org/tools/cv-kinetics/` references the new hashed CV asset.

---

### Task 4: Exclude fits below the configured R² threshold from result outputs

**Files:**
- Modify: `src/pages/CvKineticsPage.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `tests/cv-page.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consume existing `CvFitRecord.status === "belowRSquaredThreshold"`
- Preserve full internal workflow records for quality counts and grid-aligned Dunn masking
- Filter visible fitted-result tables, table clipboard rows, b-potential result navigation, and b/Dunn record CSV rows

- [ ] **Step 1: Add failing page tests**

Verify that a dataset containing a below-threshold fit still reports the excluded count but does not expose that fit in the b-value/Dunn result tables, copied table data, potential-result navigation, or b/Dunn fit-record CSV exports. Verify threshold `0` still retains finite fits.

- [ ] **Step 2: Implement the smallest derived-result filters**

Keep `analysis.bRecords` and `analysis.dunnRecords` intact internally. Derive result-output records by excluding only `belowRSquaredThreshold`, use valid b fits for the initial/interactive potential selection, and apply the same fitted-record filters to the two corresponding CSV exports.

- [ ] **Step 3: Clarify bilingual help and README behavior**

State that fits below the configured R² threshold are excluded from analysis result outputs while raw CV data remain unchanged.

- [ ] **Step 4: Verify and commit**

Run focused CV tests, the full test suite, the production build, and `git diff main...HEAD --check`; then commit the focused change.
