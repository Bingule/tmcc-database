# CV Advanced Dunn Introduction Design

**Date:** 2026-08-27  
**Branch:** `fix-dunn-literature-plot`

## Scope

Replace only the introductory copy below the CV Kinetics Analysis page title. Preserve the analysis workflow, Import Data panel, exports, bilingual architecture, and responsive page layout.

## Content and hierarchy

The English page title remains exactly `CV Kinetics Analysis`. The Simplified Chinese title remains the existing `CV 动力学分析`.

Inside the existing page header, render content in this order:

1. Existing localized `h1` page title.
2. New localized `h2` subtitle: `Advanced R²-Guided Regularized Dunn Analysis` / `高级 R² 引导正则化 Dunn 分析`.
3. New localized description paragraph. The English resource must match the user-provided text exactly:

   `This tool combines conventional Dunn kinetic separation with confidence-aware regularization and physically constrained reconstruction. Local k1, k2, and R² values are evaluated across the potential window, while forward and reverse branches jointly determine a shared capacitive fraction g(V). A constrained smooth optimization enforces 0 <= g(V) <= 1, preserving the measured CV morphology, current sign, and physical bounds while improving robustness in regions with variable fit quality.`

   Simplified Chinese:

   `本工具将传统 Dunn 动力学分离与置信度感知正则化和物理约束重构相结合。在整个电位窗口内评估局部 k1、k2 和 R² 值，同时由正向和反向分支共同确定共享电容比例 g(V)。约束平滑优化强制满足 0 <= g(V) <= 1，在提高拟合质量变化区域稳健性的同时，保留实测 CV 形貌、电流符号和物理边界。`

4. Compact localized Benefits paragraph. English must match exactly:

   `Benefits: robust reconstruction · R²-aware confidence weighting · smooth branch consistency · sign preservation · bounded capacitive contribution · reduced sensitivity to local fitting noise`

   Simplified Chinese:

   `优势：稳健重构 · R² 感知置信度加权 · 平滑分支一致性 · 符号保持 · 有界电容贡献 · 降低对局部拟合噪声的敏感性`

5. Existing localized chart-sampling notice.

The entire header remains directly above Import Data. Remove the old generic introductory sentence from rendered output.

## Implementation

- Store the subtitle, description, and Benefits text in `src/locales/en.ts` and `src/locales/zh.ts` under stable `cv.intro.*` keys.
- Add semantic markup in `CvKineticsPage.tsx`; do not introduce a new component or dependency.
- Add CV-specific CSS classes. The subtitle must be visually distinct but smaller than the `h1`.
- Keep the Benefits line compact with a modest font size and line height; allow ordinary wrapping on narrow screens without horizontal scrolling.
- Render `k1`, `k2`, `R²`, `g(V)`, and `0 <= g(V) <= 1` as plain text. Do not add MathML, KaTeX, LaTeX delimiters, or runtime formatting.

## Testing

- Assert the English title is unchanged and the exact English subtitle, description, and Benefits text are rendered.
- Assert the new introduction appears after the page title and before Import Data.
- Assert switching to Simplified Chinese renders the centralized Chinese resources.
- Assert the scientific identifiers and inequality remain plain text.
- Run the focused CV page and bilingual resource tests, then the full test suite, TypeScript check, and production build.

## Non-goals

- No analysis, import, export, navigation, or homepage changes.
- No redesign of the Import Data section.
- No new runtime dependencies.
