# Tools Contact Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the approved Dr. Wu contact message once at the bottom of every Tools route and deploy it through the existing GitHub Pages workflow.

**Architecture:** A focused `ToolContactFooter` component owns the localized text and mail link. `App` passes a Tools-route flag into the shared shell, which renders the component immediately before `SiteFooter`; the existing page-local copy is removed.

**Tech Stack:** React 19, TypeScript, Vitest, Vite, GitHub Pages

## Global Constraints

- Match routes under `/tools` only.
- Keep the supplied English wording in both language modes.
- Do not modify CV or Rate Performance page components or scientific logic.
- Reuse the current localization keys and `.tool-contact-note` styles.

---

### Task 1: Shared Tools contact footer

**Files:**
- Create: `src/components/ToolContactFooter.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/ToolsPage.tsx`
- Modify: `tests/tools-markup.test.tsx`

**Interfaces:**
- Consumes: `useI18n()` and the existing `tools.contactPrompt` / `tools.contactEmail` keys.
- Produces: `ToolContactFooter(): React.ReactElement` and conditional shell rendering for every pathname beginning with `/tools`.

- [x] **Step 1: Write the failing route-rendering test**

Add assertions that `/tools`, `/tools/cv-kinetics`, and `/tools/rate-performance/model-comparison` each render exactly one `.tool-contact-note`, that its mail link is `mailto:wui@vscht.cz`, and that `/missing` renders none.

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm test -- tests/tools-markup.test.tsx`

Expected: failure because individual Tools routes do not yet render `.tool-contact-note`.

- [x] **Step 3: Implement the shared footer**

Create the component with the exact localized message and mail link. In `App`, derive `const isToolsRoute = window.location.pathname === "/tools" || window.location.pathname.startsWith("/tools/")`, pass it to `Shell`, and render `<ToolContactFooter />` before `<SiteFooter />` when true. Remove the duplicate markup from `ToolsPage`.

- [x] **Step 4: Run focused and full verification**

Run: `pnpm test -- tests/tools-markup.test.tsx`

Expected: all focused tests pass.

Run: `pnpm test`

Expected: zero failing tests.

Run: `pnpm build`

Expected: exit code 0 and generated Tools route entries in `dist/`.

- [ ] **Step 5: Commit and deploy**

Stage only the contact-footer component, App integration, Tools landing de-duplication, localization/style changes already made for this feature, and its tests. Commit them, push `main` to `origin`, then verify the GitHub Pages workflow and the live `https://tmccdb.org/tools` output.
