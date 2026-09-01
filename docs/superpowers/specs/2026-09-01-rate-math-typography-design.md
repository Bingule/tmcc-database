# Rate Performance scientific typography design

## Goal

Replace code-like equations, parameter symbols, and visible units throughout the Rate Performance module with publication-style mathematical typography while preserving every scientific calculation and export value.

## Scope

- Apply only to `src/tools/rate-performance`, its focused shared presentation utilities, Rate Performance tests, dependency metadata, and the existing Rate Performance CSS section.
- Cover all eight Rate Performance pages, including theory panels, model cards, result cards, parameter tables, transport terms, thickness-scaling equations, CA equations, energy/power equations, selectors, and chart labels.
- Do not modify CV files, CV calculations, database pages, or unrelated Tools pages.
- Do not deploy from the feature branch. Production deployment requires a separate final approval after preview verification.

## Rendering architecture

Create a Rate Performance presentation layer with two focused primitives:

1. `ScientificMath` renders explicit TeX expressions through KaTeX 0.18.4. Display equations use display mode; symbols and short expressions use inline mode. KaTeX output includes HTML and MathML for accessibility, uses `trust: false`, and falls back to readable source text if an internal expression cannot be rendered.
2. `ScientificUnit` renders structured scientific units with proper spacing and superscripts. Native controls and SVG chart labels use a plain Unicode equivalent because `<option>` and SVG text cannot contain KaTeX HTML.

The existing chemistry-specific `Formula` component remains unchanged.

## Scientific metadata and data flow

The model registry retains its current plain-text `equation`, symbols, and units as canonical audit/export values. New display-only TeX metadata is stored separately, so presentation cannot alter fitting, normalization, comparisons, or exported CSV content.

```text
model/analysis metadata
├─ canonical plain text → fitting provenance and exports
└─ display TeX/unit metadata → Rate Performance UI only
```

Explicit TeX is used for governing equations rather than converting arbitrary ASCII automatically. This avoids silently changing scientific meaning. Common examples include:

- `Q(R) = Q_M [1 - (R tau)^n (1 - exp(-(R tau)^(-n)))]`
  → `Q(R)=Q_{\mathrm{M}}\left[1-(R\tau)^n\left(1-\exp\left(-(R\tau)^{-n}\right)\right)\right]`
- `Q_M / [1 + 2 (R tau)^n]`
  → `\dfrac{Q_{\mathrm{M}}}{1+2(R\tau)^n}`
- `mAh g^-1` → visible `mAh g⁻¹`
- `h^-1` → visible `h⁻¹`
- `tau = a L^alpha` → `\tau=aL^{\alpha}`

## Performance

KaTeX and its stylesheet are imported only from the lazily loaded Rate Performance module. The homepage, CV route, calculators, and database routes must not import KaTeX or add it to their eager route chunks.

## Error handling and accessibility

- All TeX strings are internal, version-controlled metadata; user input is never interpreted as TeX.
- KaTeX uses untrusted mode and HTML+MathML output.
- Each expression retains a descriptive accessible label or readable fallback.
- Long display equations remain horizontally scrollable on narrow screens.

## Verification

- Test first that governing equations render KaTeX/MathML rather than raw ASCII.
- Test parameter symbols and units for real subscripts/superscripts or their Unicode control/SVG equivalents.
- Test every Rate Performance page family through its shared presentation components.
- Confirm canonical export equations and unit strings remain unchanged.
- Run Rate Performance tests, the complete regression suite, TypeScript compilation, and a production build.
- Inspect desktop and mobile previews for the main analysis, model comparison, transport, thickness, CA, empirical-model, and energy/power pages.
- Verify build output keeps KaTeX out of non-Rate Performance eager chunks.
