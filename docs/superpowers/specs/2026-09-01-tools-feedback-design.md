# TMCC Tools Feedback and v1.1 Release Design

## Status

Approved in conversation on 2026-09-01 for specification authoring. The user
also authorized the later feature-branch update, pull-request merge, and
deployment after the implementation and verification gates in this document
pass. Direct pushes to `main` remain prohibited.

## Goal

Replace the current contact note on every TMCC Tools route with a compact,
bilingual feedback panel that sends validated feedback to a private mailbox
through an isolated backend. At the same time, correct the contact sentence and
publish the site footer as TMCC Database v1.1 with the production build date.

The change must not alter the TMCC database, materials data, CV tools, Rate
Performance tools, existing tool calculations, or Reviewer Two scientific
review logic.

## Scope

### Included

- Show one shared feedback panel at the bottom of every Tools route.
- Collect a feedback category, message, and optional reply email.
- Add the current route, interface language, and submission time automatically.
- Validate Cloudflare Turnstile tokens on the server.
- Rate-limit submissions and deliver accepted feedback to the configured private
  recipient through Resend.
- Keep `wui@vscht.cz` as the visible fallback contact address.
- Render the contact sentence as one paragraph with no authored line break and
  exactly one occurrence of `Dr. Wu`.
- Change the global footer label to `TMCC Database v1.1`.
- Generate `Last update` from the production build date in the
  `Europe/Budapest` time zone. The intended date for this release is
  `2026-09-01`.
- Release the completed site as fixed version `v1.1.0` after production
  verification.

### Excluded

- Home-page or non-Tools feedback forms.
- Attachments, manuscript uploads, manuscript text entry, API keys, DOI lookup,
  journal-policy lookup, or scientific-review execution.
- Database storage, analytics profiles, device fingerprints, or durable request
  logs containing visitor feedback.
- Changes to CV, Rate Performance, materials datasets, database code, or other
  existing tool algorithms.
- Moving Reviewer Two logic into TMCCdb.

## Architecture

### Frontend

The existing shared `ToolContactFooter` integration point becomes a reusable
`ToolFeedbackPanel`. `App.tsx` continues to decide whether the current route is a
Tools route, so individual tools do not duplicate feedback logic.

The browser contains only the public Worker endpoint and Turnstile site key. It
must never receive the Turnstile secret, Resend API key, or recipient mailbox.
The panel has no dependency on Reviewer Two internals or any scientific tool.

The visible English fallback contact is a single paragraph:

> Found an issue, got an unexpected result, or have a suggestion? Contact Dr. Wu at wui@vscht.cz

The email address is the only linked portion. The localized Chinese equivalent
uses the same one-paragraph structure. Responsive CSS may wrap the paragraph
naturally on narrow screens, but the markup must not introduce a separate line
or paragraph for the email address.

### Feedback Worker

An isolated Cloudflare Worker lives under `services/feedback-worker/` in the
same feature branch and repository. This avoids creating another remote
repository while keeping backend code, tests, and deployment configuration
separate from the React application.

The Worker exposes one JSON `POST` endpoint on its Cloudflare `workers.dev`
hostname. It performs origin checks, schema
validation, rate limiting, Turnstile verification, and email construction. Only
after all gates pass may it invoke Resend. The Worker has no database binding.

Production secrets and configuration are supplied by the Cloudflare environment:

- `TURNSTILE_SECRET_KEY`
- `RESEND_API_KEY`
- `FEEDBACK_RECIPIENT`
- `RATE_LIMIT_SALT`
- `FEEDBACK_FROM` (non-secret sender configuration)
- an explicit allowed-origin list (`https://tmccdb.org` and any canonical
  production alias actually used by the deployed site)

The recipient is configured as `bingwu233@gmail.com` in the production
environment and is not embedded in the browser bundle.

### Email Delivery

Resend sends from a dedicated, verified TMCCdb subdomain. The required SPF and
DKIM records are added at Porkbun only for that subdomain. Existing website DNS
records and existing mail MX records must not be changed.

Messages are plain text. The subject contains a fixed TMCC feedback prefix,
category, and safe route label. If a valid reply email is supplied, it becomes
the `Reply-To` address. User content is never used in mail headers without strict
validation.

## Form Contract

### User-entered fields

- `category`: required enum — issue, unexpected result, or suggestion.
- `message`: required plain text, 20 to 2,000 Unicode characters after trimming.
- `replyEmail`: optional valid email address, at most 254 characters.

### Browser-provided context

- `pagePath`: current same-origin Tools path, restricted to known Tools routes.
- `language`: current interface language, restricted to supported locale codes.
- `submittedAt`: ISO 8601 timestamp generated immediately before submission.
- `turnstileToken`: single-use Turnstile response token.

Unknown fields are rejected by strict schema validation. The endpoint accepts
JSON only and rejects unsupported methods and content types.

## Request Flow

1. The browser validates the visible fields.
2. Turnstile produces a single-use client token.
3. The browser posts the JSON payload to the Worker.
4. The Worker verifies the allowed origin, content type, schema, length limits,
   route, locale, and email syntax.
5. The Worker applies a limit of five accepted attempts per 60 seconds to a
   one-way-derived client key. The raw IP is not stored.
6. The Worker submits the Turnstile token to Cloudflare Siteverify. Expired,
   invalid, replayed, or unsuccessful tokens are rejected.
7. The Worker builds a plain-text message and asks Resend to deliver it to the
   configured recipient.
8. The Worker returns a minimal success or categorized error response without
   exposing provider details, secrets, or stack traces.
9. On success, the browser clears the message and reply email and resets the
   Turnstile widget.

Cloudflare documents server-side Siteverify as mandatory; Turnstile tokens are
single-use and expire after five minutes:
<https://developers.cloudflare.com/turnstile/get-started/server-side-validation/>.

Cloudflare's native Worker rate-limit binding supports 10-second or 60-second
windows, so this design uses five attempts per 60 seconds and does not introduce
KV or Durable Objects solely to create a longer window:
<https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>.

Resend requires a domain owned by the sender and verified with SPF and DKIM:
<https://resend.com/docs/dashboard/domains/introduction>.

## Security and Privacy

- Allow only production TMCCdb origins in production. A separate preview Worker
  may allow the explicit local preview origin used for integration testing.
- Use HTTPS and keep all secret values in Cloudflare secret bindings.
- Validate every field again on the server; browser validation is convenience,
  not a security boundary.
- Enforce Turnstile verification before email delivery.
- Rate-limit with a one-way-derived client key and never log raw IP addresses.
- Do not log message bodies, reply addresses, Turnstile tokens, or email payloads.
- Generate plain-text emails and reject header control characters.
- Do not accept files, HTML, manuscript content fields, or arbitrary metadata.
- Tell visitors not to submit unpublished manuscripts, sensitive personal data,
  credentials, or API keys.
- State briefly that Cloudflare and Resend process the request for abuse
  prevention and delivery. TMCCdb does not retain a database copy.

## User Experience and Accessibility

The panel uses the existing TMCC visual language and spacing. Controls have
visible labels, programmatic descriptions, keyboard focus styles, and accessible
status announcements. The submit button is disabled while a request is active.

Success clears editable data and leaves a clear confirmation. Invalid input,
Turnstile failure, rate limiting, network failure, and mail-provider failure use
distinct but non-sensitive messages. The visible `wui@vscht.cz` mail link remains
available whenever the service is unavailable.

The panel must work in Chinese and English, on desktop and mobile, and must not
cause horizontal overflow. The contact sentence remains one paragraph; natural
wrapping is allowed only when the viewport cannot safely contain the sentence.

## Footer Version and Date

`SiteFooter` displays `TMCC Database v1.1`. The production build injects an ISO
date calculated for `Europe/Budapest`; the UI continues to localize only the
`Last update` label. Tests use an injected fixed date so they are deterministic.

This date means the date of the deployed build, not the current date on every
visitor's device. A page viewed later therefore continues to show when that
version was last built.

## Error Handling

- `400`: malformed JSON, invalid fields, unsupported route, or invalid email.
- `403`: disallowed origin or failed Turnstile validation.
- `405`: unsupported method.
- `415`: unsupported content type.
- `429`: rate limit exceeded, with a user-safe retry message.
- `502` or `503`: provider or temporary backend failure.

The frontend maps these categories to localized guidance. It does not retry a
submission automatically because Turnstile tokens are single-use and automatic
retries could duplicate email. The user may reset the challenge and retry
manually.

## Testing

### Frontend unit and component tests

- The panel appears on every Tools route and nowhere else.
- Both locales contain complete labels, instructions, privacy text, and status
  messages.
- Category, message length, optional email, and submission-state behavior are
  validated.
- The contact sentence is one paragraph with one `Dr. Wu` and one mail link.
- No file input, manuscript field, attachment control, or API-key field exists.
- The footer displays v1.1 and an injected deterministic build date.
- Mobile styles prevent overflow and preserve keyboard and screen-reader use.

### Worker unit tests

- Method, content type, origin, schema, enum, length, route, locale, email, and
  control-character validation.
- Turnstile success, rejection, timeout, replay, and provider failure.
- Rate-limit success and rejection.
- Resend success and failure with the correct fixed recipient and optional
  `Reply-To`.
- Logging assertions prove that message, reply email, token, raw IP, and email
  body are absent.

All provider calls are mocked in unit tests; no unit test sends email.

### Integration and release verification

- Run the complete existing TMCCdb test suite and production build.
- Run Worker tests and a local Worker integration test with official Turnstile
  test keys.
- Confirm the generated static route for `/tools/reviewer-two` still exists.
- Audit the branch diff for protected CV, Rate Performance, database, and dataset
  paths; any such change stops the release immediately.
- Deploy a preview Worker and exercise the form from the local preview.
- After production configuration, send exactly one message with subject marker
  `[TMCC feedback test]` to the recipient and verify delivery.
- Verify `/tools`, `/tools/reviewer-two`, another existing tool, both languages,
  and a mobile viewport in the deployed site.

## Deployment

1. Continue only in the isolated worktree on `feat/reviewer-two-tools`.
2. Implement with tests first and add pull-request CI for frontend, Worker,
   TypeScript, build, and protected-path audit checks.
3. Create and verify a dedicated Resend sending subdomain at Porkbun without
   touching existing MX or website records.
4. Deploy the preview Worker with test configuration, then production Worker
   with secret bindings and production Turnstile configuration.
5. Update pull request #1 and require all new checks to pass.
6. Re-audit the complete PR diff, then merge through GitHub. Never push directly
   to `main`.
7. Let the existing GitHub Pages workflow publish the frontend.
8. Perform the production checks above.
9. Create fixed release `v1.1.0` only after production verification passes.
10. Open the deployed Tools page in the in-app browser for the user.

## Rollback

The Worker retains its previous deployment version. If feedback delivery fails,
roll back the Worker and disable form submission while preserving the visible
`wui@vscht.cz` fallback. If the frontend is faulty, create a focused repair or
revert pull request; do not rewrite or push directly to `main`.

The feedback feature is not considered released until both the deployed page and
the single production email test succeed.
