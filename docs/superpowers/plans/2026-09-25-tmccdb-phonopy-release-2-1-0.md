# TMCCDB 2.1.0 Phonopy Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish validated P-phase Phonopy results, a sortable/filterable stability table and interactive dispersion plots on tmccdb.org as version 2.1.0.

**Architecture:** Import is an offline, idempotent Node script that validates the existing Phonopy source files and updates only the matching materials' `phonons` objects; compact per-material band JSON is served as a static asset. React lazily fetches a selected material's band data and renders it with existing zoom conventions. The GitHub Pages workflow publishes only after data, UI and build checks pass.

**Tech Stack:** Node.js, TypeScript, React 19, Vite 5, Vitest, Phonopy CSV/JSON, GitHub Pages.

## Global Constraints

- Source: 356 mechanically stable P-phase IDs; 347 complete Phonopy results; 9 SCF-unconverged records remain Pending.
- Tolerance: significant imaginary frequency is strictly below −0.2 THz on the full q mesh; a Γ-only result cannot establish dynamical stability.
- Expected audited outcome: 24 stable, 323 unstable, 9 pending. Recompute counts from source and stop on mismatch.
- Three complete near-zero-moment cases with null source classification are classified from the minimum frequency, with an explicit override provenance note.
- Never overwrite original GPAW/Phonopy calculations, unrelated material properties or user worktree changes; never submit jobs.
- Explorer order: `Mech. Stab. → Min. Phonon Freq. (THz) → Dynamic Stab.`; replace table E_form only.
- Header/footer/package version: 2.1.0. Sofer: Prof. Sofer. Wu's title and detail-page formation energy stay unchanged.

---

## File map

- `scripts/import-phonopy-results.mjs`: manifest-driven validation, classification, compact spectrum generation, idempotent material update.
- `tests/import-phonopy-results.test.ts`: fixture-based importer and boundary/provenance tests.
- `data/materials/TMCC-*.json` (347 targets): phonons field only; `public/phonons/TMCC-*.json` (347 targets): lazy band data.
- `src/lib/types.ts`, `src/lib/materials.ts`: typed phonon record and display/eligibility helpers.
- `src/components/MaterialExplorer.tsx`, `src/locales/en.ts`, `src/locales/zh.ts`: table, sorting, filter and labels.
- `src/components/PhononDispersionViewer.tsx`, `src/components/MaterialDetail.tsx`: selected-material chart and provenance.
- `src/components/SiteHeader.tsx`, `src/components/SiteFooter.tsx`, `package.json`, `pnpm-lock.yaml`: version/courtesy text.
- Existing tests `tests/material-explorer.test.tsx`, `tests/material-detail.test.tsx`, `tests/home-i18n.test.tsx`: UI regression coverage.

### Task 1: Pin, validate and import Phonopy data

**Files:** Create `scripts/import-phonopy-results.mjs`, `tests/import-phonopy-results.test.ts`; modify only matched `data/materials/TMCC-*.json`; create `public/phonons/TMCC-*.json`.

**Interfaces:** Consumes the audited `D:/codex_communication/phonon_excel/phonon_data.json` rows and read-only source directories named by `row.source` under a supplied local source root. Produces `phonons.band_data` as `/phonons/TMCC-xxxx.json` and `phonons.minimum_frequency_thz`; `runImport({ manifestPath, sourceRoot, dataRoot, publicRoot, dryRun })` returns `{ complete, stable, unstable, pending }`.

- [ ] **Step 1: Write failing fixture tests.** Build temporary material/source fixtures with a three-row band CSV (`segment,point,distance,q_x,q_y,q_z,branch,frequency_thz`) and `phonopy_results.json`. Assert `min=-0.2` is stable, `min=-0.200001` is unstable, an incomplete row stays untouched/Pending, a null-classification complete row receives an override note, repeated imports are byte-identical, and fields outside `phonons` are unchanged.
- [ ] **Step 2: Run `pnpm exec vitest run tests/import-phonopy-results.test.ts`; expect missing-module failure.**
- [ ] **Step 3: Implement `runImport`.** Parse manifest rows; reject duplicate/unknown IDs and non-P-phase/non-mechanically-stable targets; resolve `row.source` beneath `sourceRoot` and refuse path escape; require `status=complete`, `phonon_calculated=true`, finite minimum, tolerance 0.2, matching material ID, force constants, q-mesh and nonempty band CSV. Use `stable = minimum_frequency_thz >= -0.2`; retain source calculation/provenance. For CSV, group by `segment` and `branch`, retaining point, distance, q coordinates and frequency; reject nonfinite values. Write JSON only when content changes. Write through a sibling temporary file and rename after all 347 sources validate. Assert exact 356/347/9 and 24/323/9 totals before any target write.
- [ ] **Step 4: Run focused tests; expect PASS.** Then stage source files in a task-local ignored directory from MetaCentrum by read-only transfer using the manifest paths; do not transfer into or edit the computation directories. Run importer first with `--dry-run`, inspect per-ID diagnostics, then run it once for production artifacts.
- [ ] **Step 5: Run `pnpm validate:data` and independently count populated records and asset paths.** Verify three near-zero-moment provenance notes, nine Pending, all 347 referenced assets nonempty, and material IDs unchanged. Commit only importer, its test, generated target JSON and band assets.

### Task 2: Stable eligibility, table layout and sorting

**Files:** Modify `src/lib/types.ts`, `src/lib/materials.ts`, `src/components/MaterialExplorer.tsx`, `src/locales/en.ts`, `src/locales/zh.ts`, `tests/material-explorer.test.tsx`.

**Interfaces:** `PhononProperties` supplies optional `phonon_calculated: boolean | null`, `dynamically_stable: boolean | null`, `minimum_frequency_thz: number | null`, `imaginary_mode_tolerance_thz: number`, `band_data?: string`, `calculation?: object`, `provenance?: object`. `getPhononStabilityLabel(material)` returns Stable/Unstable only for completed results. `getMinimumPhononFrequency(material)` returns a finite number or null.

- [ ] **Step 1: Update tests first.** Assert header sequence Mech/Min/Dynamic, no E_form table header, detail E_form still present, null frequency displays —, numeric sort orders −1 before −0.1 before missing, and a record with `dynamically_stable=true` but `phonon_calculated!==true` is Pending and fails the stable-only filter.
- [ ] **Step 2: Run `pnpm exec vitest run tests/material-explorer.test.tsx`; expect new assertions to fail.**
- [ ] **Step 3: Add the typed optional fields and helper.** The core guard is `if (material.phonons?.phonon_calculated !== true) return "Pending"`; the numeric helper uses `typeof n === "number" && Number.isFinite(n) ? n : null`. Replace `formation_energy` sort key/column with `minimum_phonon_frequency`, place Mech before Min before Dynamic, and use `phonon_calculated === true && dynamically_stable === true` in the checkbox filter. Add localized labels; preserve existing row-click and detail anchor behavior.
- [ ] **Step 4: Run focused tests and `pnpm build`; expect PASS. Commit only table/type/locale/test files.**

### Task 3: Interactive dispersion and detail provenance

**Files:** Create `src/components/PhononDispersionViewer.tsx`, `tests/phonon-dispersion.test.tsx`; modify `src/components/MaterialDetail.tsx`, `tests/material-detail.test.tsx`, and chart CSS in the existing stylesheet used by `ElectronicStructureViewer`.

**Interfaces:** Viewer prop `{ material: MaterialRecord }`; fetch URL comes only from `material.phonons.band_data` via `publicAssetPath`. Compact JSON shape is `{ material_id: string, unit: "THz", series: { segment: number, branch: number, points: { point: number, distance: number, q: [number, number, number], frequency_thz: number }[] }[] }`.

- [ ] **Step 1: Write viewer/detail tests first.** Mock fetch and assert one selected-material request, multiple branch paths, THz label, zero line, drag/wheel/reset controls, and visible loading/error states. Assert Pending displays no fabricated chart and computed detail shows minimum, tolerance, method, supercell and source.
- [ ] **Step 2: Run `pnpm exec vitest run tests/phonon-dispersion.test.tsx tests/material-detail.test.tsx`; expect failures.**
- [ ] **Step 3: Implement a focused viewer.** On material/URL change, abort old fetch; validate material ID and finite points; map x to distance and y to THz, draw each segment/branch separately so gaps are not connected; derive high-symmetry endpoint labels from the stored path metadata. Reuse `useNonPassiveWheel` and the plot interaction conventions in `ElectronicStructureViewer.tsx` for drag-range, wheel zoom and reset. Show a descriptive error rather than an empty stable-looking plot if asset load fails.
- [ ] **Step 4: Render viewer inside `#phonon-properties` only for a complete result with a band asset.** Add calculation/provenance fields, minimum frequency and threshold. Keep the existing downloadable phonon link when present. Run focused tests, `pnpm build` and a browser smoke test of one stable and one unstable record; commit only viewer/detail/styles/tests.

### Task 4: Version and attribution

**Files:** Modify `package.json`, `pnpm-lock.yaml`, `src/components/SiteHeader.tsx`, `src/components/SiteFooter.tsx`, `src/locales/en.ts`, `tests/home-i18n.test.tsx`.

**Interfaces:** Both header and footer show `v2.1.0`; English researcher/contact copy uses `Prof. Sofer`, while Dr. Wu is unchanged.

- [ ] **Step 1: Add failing render assertions for header, footer and Sofer copy, including absence of `v0.1` and `Dr. Sofer`.**
- [ ] **Step 2: Run `pnpm exec vitest run tests/home-i18n.test.tsx`; expect failure.**
- [ ] **Step 3: Update version strings and English locale; run `pnpm install --lockfile-only` to synchronize lockfile without changing dependency versions.**
- [ ] **Step 4: Run focused tests and `pnpm build`; expect PASS. Commit only version, locale, header/footer and test files.**

### Task 5: Release gate and online verification

**Files:** Review generated assets and modified files; no new calculation files.

- [ ] **Step 1: Run `pnpm validate:data`, `pnpm test`, `pnpm build`, `git diff --check`. Record exact results and ensure all imports use valid public URLs.**
- [ ] **Step 2: Inspect `git status --short` and `git diff --name-only`; exclude pre-existing edits to `src/pages/ToolsPage.tsx`, older plans, Raman scripts/archive and caches. Confirm 347 complete, 24/323 outcomes and nine Pending from committed data rather than cached spreadsheet values.**
- [ ] **Step 3: Push only the reviewed release commits to `main` using the repository's existing GitHub Pages workflow. Do not force-push. If remote advanced, stop and reconcile without resetting user work.**
- [ ] **Step 4: Verify deployment workflow success and live tmccdb.org in both languages: v2.1.0, Prof. Sofer, exact Explorer order, numeric sorting, stable-only filter, Pending, and an interactive spectrum with zoom/reset and correct source attribution. Report commit IDs, deployment status and any unresolved exceptions.**

## Self-review gate

Before execution, compare each task with the approved design: all data, UI, validation and deployment requirements are assigned. Check every reference to `minimum_frequency_thz`, `band_data` and `phonon_calculated` uses the same names, and scan the plan for placeholders. An unavailable source or count mismatch is a stop condition, not permission to manufacture a result.
