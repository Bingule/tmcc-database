# Tools contact footer design

## Goal

Show the approved contact message at the bottom of the Tools landing page and every individual Tools page.

## Scope

- Match routes under `/tools` only.
- Render the contact message after each tool page's content and immediately before the existing site footer.
- Keep the supplied English wording in both language modes.
- Make `wui@vscht.cz` a `mailto:` link and identify the contact as Dr. Wu.
- Reuse the existing Tools contact styling and localization infrastructure.

## Architecture

Create one shared `ToolContactFooter` component and let the application shell render it conditionally for Tools routes. Remove the page-local copy from `ToolsPage` so the message appears exactly once. Do not modify CV or Rate Performance page components or scientific logic.

## Verification

- Add a focused rendering test proving the contact appears on the Tools landing page and representative tool routes, but not on non-Tools routes.
- Run the focused test, full test suite, and production build.
- Push the targeted commit to `main` so the existing GitHub Pages workflow deploys it.
