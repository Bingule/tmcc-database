# TMCC Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first working static TMCC Materials Database with schema, placeholder records, validation, explorer, selector, periodic table, detail page, and documentation.

**Architecture:** React/Vite imports structured JSON records from `data/materials`. Shared TypeScript utilities handle validation, formula formatting, filtering, statistics, and display labels.

**Tech Stack:** React, TypeScript, Vite, Vitest, JSON data, CSS modules via plain CSS.

## Global Constraints

- Never fabricate scientific data.
- Missing scientific values must be `null`, never `0`.
- Experimental and computational values remain separate.
- Pristine and TM-intercalated TMCCs remain distinguishable.
- Material IDs are stable identifiers, not just displayed formulas.
- Every numeric scientific property that is present includes a unit.
- Status values are centrally defined.
- The first version avoids backend complexity.

---

### Task 1: Data Utilities And Validation

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/statuses.ts`
- Create: `src/lib/materials.ts`
- Create: `src/lib/validation.ts`
- Test: `tests/data-utils.test.ts`
- Test: `tests/validate-data.test.ts`

**Interfaces:**
- Produces: `MaterialRecord`, `formatFormulaParts`, `getUnavailableLabel`, `getMaterialStats`, `validateMaterialRecords`.

- [x] Write failing tests for formula formatting, missing-value labels, statistics, and validation.
- [x] Run tests and confirm they fail because implementation modules do not exist.
- [ ] Implement the minimal shared data utilities.
- [ ] Run tests and confirm they pass.

### Task 2: Scientific Data Layer

**Files:**
- Create: `data/schema/statuses.json`
- Create: `data/schema/material.schema.json`
- Create: `data/materials/*.json`
- Create: `src/data/materials.ts`
- Create: `scripts/validate-data.js`

**Interfaces:**
- Consumes: `MaterialRecord`, `validateMaterialRecords`.
- Produces: `materials`, `validate:data`.

- [ ] Add eight pristine placeholder records using null for unknown scientific values.
- [ ] Add status definitions and a JSON schema reference.
- [ ] Add CLI validation script.
- [ ] Run `pnpm validate:data`.

### Task 3: Website UI

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/components/*.tsx`
- Create: `src/styles/global.css`

**Interfaces:**
- Consumes: `materials`, `getMaterialStats`, `formatFormulaParts`.

- [ ] Build responsive homepage shell.
- [ ] Build material type selector, pristine selector, and disabled download controls.
- [ ] Build periodic table with centralized status styles.
- [ ] Build explorer filters and material detail sections.
- [ ] Run `pnpm build`.

### Task 4: Documentation

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`

- [ ] Document purpose, local setup, adding records, adding files, validation, deployment, schema, ID convention, and disclaimer.
- [ ] Run final validation, tests, and build.
