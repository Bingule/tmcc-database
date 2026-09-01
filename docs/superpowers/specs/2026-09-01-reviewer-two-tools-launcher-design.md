# Reviewer Two Tools Launcher Design

## Status

Approved in conversation on 2026-09-01 for specification authoring. Implementation,
push, pull request, merge, and deployment remain separate gated actions.

## Goal

Add a safe, bilingual Reviewer Two launcher to the TMCCdb Tools area without
moving scientific-review logic into TMCCdb and without accepting manuscript
content in the browser.

## Product boundary

The integration consists of a new card on `/tools` and a new informational route
at `/tools/reviewer-two`. The route introduces Reviewer Two, states its privacy
and human-judgment boundaries, summarizes the safe launch flow, and links to the
independent `Bingule/reviewer-two` repository.

The route is not an online reviewer. It must not provide manuscript text entry,
file upload, AI inference, API-key entry, DOI lookup, journal-policy lookup,
browser persistence, or any other mechanism that transmits or stores manuscript
content.

## Source-of-truth boundary

The independent Reviewer Two repository remains the sole source of scientific
review logic, schemas, runtime adapters, verification rules, limitations, and
installation instructions. TMCCdb must not copy, reinterpret, or fork those
rules.

The launcher identifies the reviewed source with commit
`9ff847d0b23a23c87b24e5340907df4c45f32ffc`. Its repository and usage links
must point to that immutable commit where version-specific content is intended.
The general repository link may point to `https://github.com/Bingule/reviewer-two`.

## User experience

### Tools index

The existing `/tools` grid gains one Reviewer Two card. The card uses the same
markup and visual treatment as existing tool cards and includes bilingual title
and description text through the existing i18n system.

### Launcher route

`/tools/reviewer-two` uses the existing site shell, header, language switch,
breadcrumb, tool contact footer, site footer, typography, spacing, colors, and
responsive breakpoints. The first viewport contains:

1. the Reviewer Two name and a concise explanation that it supports a human
   scientific reviewer rather than making editorial decisions;
2. a prominent privacy boundary stating that unpublished manuscripts should be
   processed only in an authorized private environment and that TMCCdb does not
   receive or upload manuscripts; and
3. clear links to the independent repository and its fixed-version usage
   instructions.

Below the first viewport, three short steps explain the safe flow:

1. open the independent repository;
2. install or load the skill in a supported authorized runtime; and
3. explicitly authorize access and select the review mode before analysis.

External links must be visibly identifiable and use safe new-tab attributes.
The page remains useful if GitHub is temporarily unavailable because the safety
boundary and plain repository address remain visible.

## Architecture and data flow

TMCCdb remains a static React/Vite site deployed through its existing GitHub
Pages workflow. The new page is a presentational React module loaded lazily from
the existing route switch. It consumes only static bilingual strings bundled
with the site.

```text
/tools card
    |
    v
/tools/reviewer-two static launcher
    |                         |
    v                         v
fixed Reviewer Two source    public repository

No manuscript data, API request, AI call, DOI lookup, or persistence occurs.
```

## Allowed change surface

Implementation may modify only:

- the Reviewer Two entry in `src/pages/ToolsPage.tsx`;
- the new module under `src/tools/reviewer-two/`;
- Reviewer Two route registration and lazy loading in `src/App.tsx` and
  `src/lib/routes.ts`;
- Reviewer Two bilingual strings in `src/locales/en.ts` and `src/locales/zh.ts`;
- narrowly scoped Reviewer Two styles in `src/styles/global.css`;
- the static route entry in `scripts/create-route-entries.mjs`;
- tests that directly verify the new entry, route, page, safety boundary, links,
  and build output; and
- this feature's specification and implementation-plan documents.

No CV, Rate Performance, database, dataset, or unrelated Tools file may change.
Any CV-file change is a hard stop and must be reported immediately.

## Error handling and degradation

The page performs no runtime request, so its primary failure mode is an
unavailable external GitHub destination. Links remain standard anchors and the
page displays the repository address in readable text. There is no automatic
retry, fallback mirror, or cached copy of scientific-review rules.

An unknown path continues to use the existing not-found behavior. Route loading
continues to use the existing shared loading state.

## Accessibility and localization

All content is available in English and Simplified Chinese through the existing
translation provider. Heading order, landmarks, breadcrumbs, list semantics,
link names, visible keyboard focus, contrast, and responsive single-column
behavior follow the established Tools patterns. Safety meaning must remain
equivalent across both languages.

## Test strategy

Implementation follows test-driven development. Tests must first fail for the
missing feature, then pass after the minimum production change.

Required automated coverage:

- `/tools/reviewer-two` normalizes to its dedicated route;
- the application lazily loads and renders the launcher;
- `/tools` exposes the Reviewer Two card;
- English and Chinese titles, descriptions, privacy text, steps, and link labels
  are correct;
- the page contains no file input, manuscript textarea, API-key field, or online
  review action;
- version-specific links reference commit
  `9ff847d0b23a23c87b24e5340907df4c45f32ffc`;
- external links use safe new-tab attributes;
- the production build creates `tools/reviewer-two/index.html`; and
- the complete existing test suite and production build pass.

Before any push or deployment, compare the feature branch with `origin/main`
and enforce the allowed change surface. Confirm explicitly that no path related
to CV, Rate Performance, databases, or existing tool implementations changed.

## Delivery gates

1. Design specification approval.
2. Written implementation-plan approval.
3. TDD implementation in `feat/reviewer-two-tools` only.
4. Full tests, production build, scope audit, and local preview.
5. User approval before push or pull-request creation.
6. Pull request, automated checks, and preview review.
7. User final approval before merge to `main` and GitHub Pages deployment.

No step authorizes direct push to TMCCdb `main`.
