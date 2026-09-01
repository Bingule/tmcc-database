# Rate Performance Scientific Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every visible Rate Performance equation, symbol, and unit with publication-style typography without changing scientific calculations or canonical exports.

**Architecture:** A Rate Performance-only `ScientificMath` wrapper renders explicit TeX through KaTeX with HTML+MathML accessibility. `ScientificUnit` and `ScientificSymbol` handle short UI notation, while canonical plain-text equations and units remain unchanged for fitting provenance and CSV exports.

**Tech Stack:** React 19, TypeScript, KaTeX 0.18.4, Vitest, Vite

## Global Constraints

- Modify only Rate Performance presentation files, focused Rate Performance tests, dependency metadata, and Rate Performance CSS.
- Do not modify CV files, CV calculations, database pages, or unrelated Tools pages.
- Keep all existing canonical model equations and export unit strings unchanged.
- Load KaTeX only through the lazy Rate Performance route graph.
- Do not push or deploy from this feature branch without a separate final user approval.

---

### Task 1: Scientific notation primitives

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/tools/rate-performance/components/ScientificMath.tsx`
- Create: `src/tools/rate-performance/components/ScientificUnit.tsx`
- Test: `tests/rate-scientific-typography.test.tsx`

**Interfaces:**
- Produces: `ScientificMath({ tex, source, display, label, className })`.
- Produces: `ScientificUnit({ unit })`, `formatScientificUnit(unit)`, and `ScientificSymbol({ symbol })`.
- KaTeX options: `output: "htmlAndMathml"`, `trust: false`, `strict: "error"`, `throwOnError: true` with escaped React text fallback.

- [ ] **Step 1: Install the pinned dependency**

Run: `pnpm add katex@0.18.4 --save-exact`

Expected: only `package.json` and `pnpm-lock.yaml` dependency metadata change.

- [ ] **Step 2: Write failing primitive tests**

Test that a display expression produces `.katex-display` and `<math>`, that `Q_M`, `R_T`, `tau`, `I_adj`, and `P_avg` render as mathematical symbols, that `mAh g^-1`, `h^-1`, `s m^-2`, `Wh kg^-1`, and `W kg^-1` use superscripts, and that invalid internal TeX falls back to its plain source without injected HTML.

- [ ] **Step 3: Run RED**

Run: `vitest run --dir tests tests/rate-scientific-typography.test.tsx`

Expected: FAIL because the scientific presentation components do not exist.

- [ ] **Step 4: Implement the primitives**

`ScientificMath` calls `katex.renderToString(tex, options)` inside `try/catch`, imports `katex/dist/katex.min.css`, and renders the result in a semantic span/div. `formatScientificUnit` replaces only caret-number exponents with Unicode superscripts; it does not parse equations. `ScientificSymbol` uses an explicit exact-symbol map rather than guessing arbitrary formulas.

- [ ] **Step 5: Run GREEN and commit**

Run: `vitest run --dir tests tests/rate-scientific-typography.test.tsx`

Expected: all primitive tests pass.

Commit: `feat: add rate scientific typography primitives`

---

### Task 2: Governing equations and theory metadata

**Files:**
- Modify: `src/tools/rate-performance/models/types.ts`
- Modify: `src/tools/rate-performance/models/registry.ts`
- Modify: `src/tools/rate-performance/components/ModelTheoryPanel.tsx`
- Modify: `src/tools/rate-performance/pages/RatePerformanceAnalysisPage.tsx`
- Modify: `src/tools/rate-performance/pages/EmpiricalModelsPage.tsx`
- Modify: `src/tools/rate-performance/pages/CaRateAnalysisPage.tsx`
- Modify: `src/tools/rate-performance/components/EnergyTheorySection.tsx`
- Modify: `src/tools/rate-performance/pages/EnergyPowerPage.tsx`
- Test: `tests/rate-scientific-typography.test.tsx`
- Test: `tests/rate-models.test.ts`
- Test: `tests/rate-analysis-page.test.tsx`
- Test: `tests/rate-ca.test.tsx`
- Test: `tests/rate-energy-power.test.tsx`

**Interfaces:**
- Adds display-only `equationTex?: string` to `RateModelDefinition`.
- Adds required `equationTex: string` to `RateTheoryContent`.
- Canonical `equation`, `symbol`, and `unit` fields remain byte-for-byte unchanged.

- [ ] **Step 1: Write failing integration tests**

Assert the Tian equation renders `Q_M` as a subscript, `tau` as `τ`, negative powers as superscripts, and `exp` as a mathematical operator. Assert rational, CA integration/rate, energy/power, and empirical model equations render KaTeX/MathML. Assert registry/export tests still observe the original ASCII equations.

- [ ] **Step 2: Run RED**

Run the five focused Rate Performance test files. Expected: typography assertions fail while canonical equation assertions remain green.

- [ ] **Step 3: Add explicit TeX metadata and shared rendering**

Use explicit internal expressions, including:

```ts
String.raw`Q(R)=Q_{\mathrm{M}}\left[1-(R\tau)^n\left(1-\exp\left(-(R\tau)^{-n}\right)\right)\right]`
String.raw`Q(R)=\frac{Q_{\mathrm{M}}}{1+2(R\tau)^n}`
String.raw`Q(t)=\frac{1}{m}\int_0^t I_{\mathrm{adj}}(t')\,\mathrm{d}t'\quad R(t)=\frac{I_{\mathrm{adj}}(t)/m}{Q(t)}`
String.raw`E=\int V\,\mathrm{d}Q\quad P_{\mathrm{avg}}=\frac{E}{\Delta t}`
```

Route every theory panel and model card through `ScientificMath`. Route parameter symbols and units through `ScientificSymbol` and `ScientificUnit`.

- [ ] **Step 4: Run GREEN and commit**

Run the same focused test set. Expected: all tests pass and canonical export text is unchanged.

Commit: `feat: typeset rate model theory`

---

### Task 3: Results, transport, thickness, controls, and chart text

**Files:**
- Modify: `src/tools/rate-performance/components/ResultCards.tsx`
- Modify: `src/tools/rate-performance/components/RateAnalysisResults.tsx`
- Modify: `src/tools/rate-performance/components/CaAnalysisResults.tsx`
- Modify: `src/tools/rate-performance/components/ModelComparisonResults.tsx`
- Modify: `src/tools/rate-performance/components/RateDataInput.tsx`
- Modify: `src/tools/rate-performance/components/EnergySummaryInput.tsx`
- Modify: `src/tools/rate-performance/components/EnergyCurveInput.tsx`
- Modify: `src/tools/rate-performance/components/TransportTimeResults.tsx`
- Modify: `src/tools/rate-performance/components/ThicknessScalingResults.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `src/styles/global.css`
- Test: `tests/rate-scientific-typography.test.tsx`
- Test: `tests/rate-input.test.tsx`
- Test: `tests/rate-transport.test.tsx`
- Test: `tests/rate-thickness.test.tsx`
- Test: `tests/rate-model-comparison.test.tsx`

**Interfaces:**
- `ResultCards` automatically presents known symbols and units while preserving its item API.
- Native `<option>` labels and SVG chart strings use `formatScientificUnit`/Unicode equivalents.
- Transport and thickness equations use explicit ID-to-TeX maps local to the Rate Performance presentation layer.

- [ ] **Step 1: Write failing cross-page tests**

Assert result cards show `Q` with subscript `M`, transport equations render fractions and exponents, thickness models render `τ`, `L²`, and `α`, select options show `mAh g⁻¹`/`h⁻¹`, and chart text contains Unicode superscripts. Assert no test expects changed scientific numeric output.

- [ ] **Step 2: Run RED**

Run the five focused test files. Expected: current raw ASCII unit/equation assertions fail.

- [ ] **Step 3: Apply presentation components throughout all eight pages**

Replace visible code blocks and literal caret notation with the shared renderers. Keep export helpers, normalized unit IDs such as `mAh-g-1`, and analysis equation fields unchanged. Remove monospace styling from `.rate-equation`, retain horizontal scrolling, and add responsive KaTeX sizing.

- [ ] **Step 4: Run GREEN and commit**

Run the focused tests. Expected: all pass.

Commit: `feat: typeset rate results and units`

---

### Task 4: Regression, bundle isolation, and visual preview

**Files:**
- Modify: `tests/route-code-splitting.test.ts`
- Modify: `docs/superpowers/plans/2026-09-01-rate-math-typography.md`

**Interfaces:**
- Verifies KaTeX is reachable only from Rate Performance lazy chunks and not from eager application code or CV source.

- [ ] **Step 1: Write and run the failing bundle-boundary test**

Assert `App.tsx` keeps Rate Performance pages lazy and that no homepage, CV, calculator, or global shared component imports `katex` or Rate Performance scientific typography.

- [ ] **Step 2: Run all verification commands**

Run all Rate Performance tests, then all 56+ repository test files, TypeScript compilation, and the production build. Expected: zero failures; existing unrelated warnings are reported rather than hidden.

- [ ] **Step 3: Inspect generated chunks**

Confirm KaTeX JS/CSS/fonts are absent from the eager application chunk and appear only in assets requested by Rate Performance routes.

- [ ] **Step 4: Inspect desktop and mobile previews**

Open all eight Rate Performance routes. Confirm equation readability, non-overflowing result cards/tables, readable MathML labels, correct native control labels, and unchanged CV rendering.

- [ ] **Step 5: Commit verification changes and stop before deployment**

Commit: `test: verify rate math typography isolation`

Report preview links, test/build evidence, changed files, bundle impact, and the exact feature-branch commit. Ask for explicit production deployment approval.
