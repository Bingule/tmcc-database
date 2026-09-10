# TMCC Tools Feedback and v1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure bilingual feedback form to every TMCC Tools route, deliver accepted submissions through an isolated Cloudflare Worker and Resend, and publish TMCC Database v1.1 with an accurate build date.

**Architecture:** The React site owns only the shared form UI, public Worker URL, and public Turnstile site key. A focused Worker under `services/feedback-worker/` validates the request, hashes the client key, applies Cloudflare's native five-per-60-seconds rate limit, verifies Turnstile, and calls Resend without storing submissions. Existing scientific tools and Reviewer Two logic remain unchanged.

**Tech Stack:** React 19, TypeScript 5.7, Vite 5, Vitest 2, Cloudflare Workers, Wrangler 4.36+, Turnstile, Resend HTTP API, GitHub Actions, GitHub Pages.

## Global Constraints

- Work only in `D:/codex_communication/tmcc-database/.worktrees/reviewer-two-tools` on `feat/reviewer-two-tools`.
- Never push directly to `main`; update pull request #1 and merge only after all gates pass.
- Stop immediately if any CV, Rate Performance, materials dataset, database, or existing scientific calculation file changes.
- Do not add manuscript fields, attachments, DOI lookup, journal-policy lookup, API-key inputs, or scientific-review logic.
- Do not persist feedback, reply email, raw IP, Turnstile token, or message content in a database or logs.
- The production recipient is a Worker secret whose value is `bingwu233@gmail.com`; it must not enter the browser bundle.
- Visible fallback contact is `wui@vscht.cz`; the English sentence is one paragraph with exactly one `Dr. Wu`.
- Worker limit is exactly five attempts per 60 seconds because the native Cloudflare binding supports only 10- or 60-second windows.
- Release label is `TMCC Database v1.1`; fixed GitHub release is `v1.1.0`.
- Build date is an ISO date calculated in `Europe/Budapest`; this release must display `2026-09-01`.

---

## File Structure

### Frontend

- Create `src/components/ToolFeedbackPanel.tsx`: form state, validation, Turnstile integration, submission status, and fallback contact.
- Create `src/components/TurnstileWidget.tsx`: load and explicitly render/reset the Turnstile widget.
- Create `src/lib/feedback.ts`: shared frontend payload types, pure field validation, and `submitFeedback` HTTP client.
- Modify `src/App.tsx`: replace the shared `ToolContactFooter` with `ToolFeedbackPanel` only for Tools routes.
- Delete `src/components/ToolContactFooter.tsx` after all imports and tests move to the new component.
- Modify `src/locales/en.ts` and `src/locales/zh.ts`: feedback labels, privacy warning, and response messages.
- Modify `src/components/SiteFooter.tsx`: v1.1 label and injected build date.
- Modify `src/vite-env.d.ts`: public feedback environment types and `__TMCC_BUILD_DATE__` global.
- Modify `vite.config.ts`: calculate and define the Budapest build date.
- Modify `src/styles/global.css`: responsive panel, fields, status, Turnstile container, and one-paragraph contact styling.
- Create `tests/feedback.test.ts`: pure frontend validation and API response mapping.
- Create `tests/tool-feedback-panel.test.tsx`: UI, localization, submission states, confidentiality warning, and accessibility.
- Modify `tests/tools-markup.test.tsx`: route coverage and corrected one-paragraph contact contract.
- Create `tests/site-footer.test.tsx`: v1.1 and deterministic build-date behavior.
- Modify `tests/vite-config.test.ts`: Budapest date formatter and compile-time define.

### Worker

- Create `services/feedback-worker/package.json`: isolated scripts and Wrangler/Vitest dependencies.
- Create `services/feedback-worker/pnpm-lock.yaml`: frozen Worker dependency graph.
- Create `services/feedback-worker/tsconfig.json`: Worker-specific strict TypeScript configuration.
- Create `services/feedback-worker/wrangler.jsonc`: production and preview variables plus the native rate-limit binding.
- Create `services/feedback-worker/.dev.vars.example`: secret names only, never values.
- Create `services/feedback-worker/src/types.ts`: request, environment, provider, logger, and result interfaces.
- Create `services/feedback-worker/src/validation.ts`: strict JSON schema and safe normalization.
- Create `services/feedback-worker/src/security.ts`: CORS, client-key hashing, and Turnstile Siteverify.
- Create `services/feedback-worker/src/email.ts`: plain-text message construction and Resend HTTP call.
- Create `services/feedback-worker/src/index.ts`: request orchestration and minimal categorized logging.
- Create `services/feedback-worker/test/validation.test.ts`: all contract validation boundaries.
- Create `services/feedback-worker/test/security.test.ts`: CORS, hashing, Turnstile, and rate-limit cases.
- Create `services/feedback-worker/test/email.test.ts`: safe mail payload and provider responses.
- Create `services/feedback-worker/test/index.test.ts`: endpoint status mapping and log-redaction assertions.

### Automation and release

- Create `scripts/check-protected-paths.mjs`: fail when the PR changes protected scientific/data paths.
- Create `.github/workflows/ci.yml`: frontend, Worker, build, and protected-path checks on pull requests.
- Create `.github/workflows/deploy-feedback-worker.yml`: manual, production-environment-gated Worker deployment.
- Modify `.github/workflows/deploy-pages.yml`: inject the public Worker endpoint and Turnstile site key from GitHub variables.
- Create `services/feedback-worker/README.md`: verified setup, secret, DNS, preview, deploy, and rollback commands.

---

### Task 1: Establish the Worker Contract and Strict Validation

**Files:**
- Create: `services/feedback-worker/package.json`
- Create: `services/feedback-worker/tsconfig.json`
- Create: `services/feedback-worker/src/types.ts`
- Create: `services/feedback-worker/src/validation.ts`
- Test: `services/feedback-worker/test/validation.test.ts`

**Interfaces:**
- Produces: `FeedbackCategory`, `FeedbackPayload`, `ValidatedFeedback`, `WorkerEnv`, `parseFeedbackPayload(value: unknown): ValidationResult`.
- `ValidationResult` is `{ ok: true; value: ValidatedFeedback } | { ok: false; code: "invalid_payload" }`.

- [ ] **Step 1: Add the isolated Worker package and strict compiler configuration**

```json
{
  "name": "tmcc-tools-feedback-worker",
  "version": "1.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev": "wrangler dev --env preview",
    "deploy": "wrangler deploy --env production"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260820.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "wrangler": "^4.36.0"
  }
}
```

Use `lib: ["ES2022", "WebWorker"]`, `types: ["@cloudflare/workers-types"]`, `strict: true`, `noEmit: true`, and include `src` plus `test` in the Worker `tsconfig.json`.

- [ ] **Step 2: Write failing boundary tests for the request contract**

```ts
it.each([
  null,
  {},
  { category: "other", message: "A valid-length message", replyEmail: "" },
  { category: "issue", message: "short", replyEmail: "" },
  { category: "issue", message: "x".repeat(2001), replyEmail: "" },
  { category: "issue", message: "A valid-length message", replyEmail: "bad" },
  { category: "issue", message: "A valid-length message", replyEmail: "", extra: true }
])("rejects invalid or non-exact payload %#", (payload) => {
  expect(parseFeedbackPayload(payload)).toEqual({ ok: false, code: "invalid_payload" });
});

it("normalizes an exact valid payload", () => {
  expect(parseFeedbackPayload({
    category: "suggestion",
    message: "  Please add clearer export guidance.  ",
    replyEmail: "reader@example.org",
    pagePath: "/tools/reviewer-two",
    language: "en",
    submittedAt: "2026-09-01T10:00:00.000Z",
    turnstileToken: "test-token"
  })).toEqual({ ok: true, value: {
    category: "suggestion",
    message: "Please add clearer export guidance.",
    replyEmail: "reader@example.org",
    pagePath: "/tools/reviewer-two",
    language: "en",
    submittedAt: "2026-09-01T10:00:00.000Z",
    turnstileToken: "test-token"
  }});
});
```

- [ ] **Step 3: Run the focused test and confirm the RED state**

Run: `pnpm --dir services/feedback-worker install`

Expected: dependencies install and the Worker lockfile is generated.

Run: `pnpm --dir services/feedback-worker test -- validation.test.ts`

Expected: FAIL because `parseFeedbackPayload` and its types do not exist.

- [ ] **Step 4: Implement exact-key, enum, route, locale, timestamp, length, and email validation**

```ts
export type FeedbackCategory = "issue" | "unexpected_result" | "suggestion";
export type FeedbackLanguage = "en" | "zh";

export interface ValidatedFeedback {
  category: FeedbackCategory;
  message: string;
  replyEmail: string;
  pagePath: string;
  language: FeedbackLanguage;
  submittedAt: string;
  turnstileToken: string;
}

const exactKeys = ["category", "message", "replyEmail", "pagePath", "language", "submittedAt", "turnstileToken"].sort();
const toolsPath = /^\/tools(?:\/[a-z0-9-]+)*$/;
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseFeedbackPayload(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const input = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(exactKeys)) return invalid();
  if (!isCategory(input.category) || !isLanguage(input.language)) return invalid();
  if (typeof input.message !== "string" || typeof input.replyEmail !== "string") return invalid();
  if (typeof input.pagePath !== "string" || !toolsPath.test(input.pagePath)) return invalid();
  if (typeof input.submittedAt !== "string" || Number.isNaN(Date.parse(input.submittedAt))) return invalid();
  if (typeof input.turnstileToken !== "string" || input.turnstileToken.length < 1 || input.turnstileToken.length > 2048) return invalid();
  const message = input.message.trim();
  if (message.length < 20 || message.length > 2000) return invalid();
  if (input.replyEmail.length > 254 || (input.replyEmail !== "" && !email.test(input.replyEmail))) return invalid();
  return { ok: true, value: { ...input, message } as ValidatedFeedback };
}
```

- [ ] **Step 5: Run Worker validation tests and typecheck**

Run: `pnpm --dir services/feedback-worker test -- validation.test.ts`

Expected: PASS.

Run: `pnpm --dir services/feedback-worker typecheck`

Expected: exit 0 with no diagnostics.

- [ ] **Step 6: Commit the independently testable contract**

```bash
git add services/feedback-worker/package.json services/feedback-worker/pnpm-lock.yaml services/feedback-worker/tsconfig.json services/feedback-worker/src/types.ts services/feedback-worker/src/validation.ts services/feedback-worker/test/validation.test.ts
git commit -m "feat: define feedback Worker contract"
```

### Task 2: Implement Worker Security, Delivery, and Redacted Errors

**Files:**
- Create: `services/feedback-worker/wrangler.jsonc`
- Create: `services/feedback-worker/.dev.vars.example`
- Create: `services/feedback-worker/src/security.ts`
- Create: `services/feedback-worker/src/email.ts`
- Create: `services/feedback-worker/src/index.ts`
- Test: `services/feedback-worker/test/security.test.ts`
- Test: `services/feedback-worker/test/email.test.ts`
- Test: `services/feedback-worker/test/index.test.ts`

**Interfaces:**
- Consumes: `ValidatedFeedback`, `WorkerEnv`, `parseFeedbackPayload` from Task 1.
- Produces: `corsHeaders(origin, env)`, `deriveClientKey(ip, salt)`, `verifyTurnstile(token, ip, secret, fetcher)`, `buildEmail(feedback, recipient, sender)`, `sendFeedbackEmail(email, apiKey, fetcher)`, default Worker `fetch` handler.

- [ ] **Step 1: Write failing security tests**

```ts
it("allows only configured origins", () => {
  const env = fakeEnv({ ALLOWED_ORIGINS: "https://tmccdb.org,https://www.tmccdb.org" });
  expect(corsHeaders("https://tmccdb.org", env).get("access-control-allow-origin")).toBe("https://tmccdb.org");
  expect(corsHeaders("https://evil.example", env)).toBeNull();
});

it("derives a stable non-reversible rate key", async () => {
  const key = await deriveClientKey("203.0.113.4", "test-salt");
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(key).not.toContain("203.0.113.4");
});

it("rejects an unsuccessful Siteverify response", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
  await expect(verifyTurnstile("token", "203.0.113.4", "secret", fetcher)).resolves.toBe(false);
});
```

- [ ] **Step 2: Run security tests and confirm RED**

Run: `pnpm --dir services/feedback-worker test -- security.test.ts`

Expected: FAIL because the security helpers do not exist.

- [ ] **Step 3: Implement CORS, SHA-256 client keys, and Siteverify**

Use `crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`))`; send `secret`, `response`, and optional `remoteip` as `application/x-www-form-urlencoded` to `https://challenges.cloudflare.com/turnstile/v0/siteverify`; return `true` only for HTTP success with JSON `{ success: true }`.

- [ ] **Step 4: Write failing safe-email tests**

```ts
it("builds plain text with a fixed recipient and optional reply-to", () => {
  const email = buildEmail(validFeedback, "bingwu233@gmail.com", "TMCC Feedback <feedback@notify.tmccdb.org>");
  expect(email.to).toEqual(["bingwu233@gmail.com"]);
  expect(email.reply_to).toBe("reader@example.org");
  expect(email.subject).toBe("[TMCC feedback] Suggestion — /tools/reviewer-two");
  expect(email.text).toContain("Please add clearer export guidance.");
  expect(email).not.toHaveProperty("html");
});

it("rejects header control characters", () => {
  expect(() => buildEmail({ ...validFeedback, replyEmail: "x@example.org\r\nBcc: bad@example.org" }, "recipient@example.org", "sender@example.org")).toThrow();
});
```

- [ ] **Step 5: Implement Resend delivery using the native Fetch API**

POST JSON to `https://api.resend.com/emails` with `Authorization: Bearer ${apiKey}`. Treat only a 2xx response as success; do not include the provider response body in public errors or logs.

- [ ] **Step 6: Write failing endpoint and log-redaction tests**

Cover `OPTIONS`, `400`, `403`, `405`, `415`, `429`, `502`, and `200`. Inject fetch and logger dependencies. Assert serialized logs omit the original message, reply email, token, raw IP, and provider body.

- [ ] **Step 7: Implement the endpoint in the exact gate order**

```ts
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const origin = request.headers.get("origin") ?? "";
    const cors = corsHeaders(origin, env);
    if (!cors) return json({ code: "forbidden" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405, cors);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ code: "unsupported_media" }, 415, cors);
    const parsed = parseFeedbackPayload(await safeJson(request));
    if (!parsed.ok) return json({ code: parsed.code }, 400, cors);
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const key = await deriveClientKey(ip, env.RATE_LIMIT_SALT);
    if (!(await env.FEEDBACK_RATE_LIMITER.limit({ key })).success) return json({ code: "rate_limited" }, 429, cors);
    if (!(await verifyTurnstile(parsed.value.turnstileToken, ip, env.TURNSTILE_SECRET_KEY, fetch))) return json({ code: "turnstile_failed" }, 403, cors);
    const email = buildEmail(parsed.value, env.FEEDBACK_RECIPIENT, env.FEEDBACK_FROM);
    if (!(await sendFeedbackEmail(email, env.RESEND_API_KEY, fetch))) return json({ code: "delivery_failed" }, 502, cors);
    console.info(JSON.stringify({ event: "feedback_sent", category: parsed.value.category, pagePath: parsed.value.pagePath }));
    return json({ ok: true }, 200, cors);
  }
};
```

- [ ] **Step 8: Configure Wrangler with no storage binding**

Use `compatibility_date: "2026-09-01"`, `main: "src/index.ts"`, preview and production allowed origins/from-address variables, and:

```json
"ratelimits": [{
  "name": "FEEDBACK_RATE_LIMITER",
  "namespace_id": "1101",
  "simple": { "limit": 5, "period": 60 }
}]
```

`.dev.vars.example` lists empty names for `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `FEEDBACK_RECIPIENT`, and `RATE_LIMIT_SALT`; it contains no usable secret.

- [ ] **Step 9: Run all Worker tests and typecheck**

Run: `pnpm --dir services/feedback-worker test`

Expected: all Worker tests PASS; no network call reaches Cloudflare or Resend.

Run: `pnpm --dir services/feedback-worker typecheck`

Expected: exit 0.

- [ ] **Step 10: Commit the secure Worker**

```bash
git add services/feedback-worker
git commit -m "feat: add secure feedback Worker"
```

### Task 3: Build the Frontend Feedback Client and Turnstile Adapter

**Files:**
- Create: `src/lib/feedback.ts`
- Create: `src/components/TurnstileWidget.tsx`
- Modify: `src/vite-env.d.ts`
- Test: `tests/feedback.test.ts`
- Test: `tests/tool-feedback-panel.test.tsx`

**Interfaces:**
- Produces: `FeedbackFormValues`, `FeedbackSubmitPayload`, `validateFeedback(values)`, `submitFeedback(payload, config, fetcher?)`, `TurnstileWidget({ siteKey, onToken, resetKey })`.
- `submitFeedback` returns `{ ok: true } | { ok: false; code: FeedbackErrorCode }` and never throws provider details into the UI.

- [ ] **Step 1: Write failing pure validation and response-mapping tests**

```ts
expect(validateFeedback({ category: "issue", message: "too short", replyEmail: "" }))
  .toEqual({ message: "too_short" });
expect(validateFeedback({ category: "suggestion", message: "A message long enough for feedback.", replyEmail: "bad" }))
  .toEqual({ replyEmail: "invalid_email" });

const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "rate_limited" }), { status: 429 }));
await expect(submitFeedback(validPayload, config, fetcher)).resolves.toEqual({ ok: false, code: "rate_limited" });
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm test -- tests/feedback.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure validation and the JSON client**

The client must set `Content-Type: application/json`, use the configured endpoint, map known response codes, map network exceptions to `network_error`, and never send a request until local validation and a non-empty Turnstile token both pass.

- [ ] **Step 4: Write a failing Turnstile adapter test**

Mock `window.turnstile.render` and `window.turnstile.reset`. Assert the component loads `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` once, calls `render` with the public site key, reports the callback token, reports expiry as an empty token, and resets when `resetKey` changes.

- [ ] **Step 5: Implement explicit Turnstile loading and cleanup**

Declare only the public API in `src/vite-env.d.ts`; never declare secret values as `VITE_` variables. The component owns its widget container and removes only its own callback references during cleanup.

- [ ] **Step 6: Run focused tests and commit**

Run: `pnpm test -- tests/feedback.test.ts tests/tool-feedback-panel.test.tsx`

Expected: PASS for client and adapter tests.

```bash
git add src/lib/feedback.ts src/components/TurnstileWidget.tsx src/vite-env.d.ts tests/feedback.test.ts tests/tool-feedback-panel.test.tsx
git commit -m "feat: add feedback client and Turnstile adapter"
```

### Task 4: Add the Shared Bilingual Feedback Panel to Every Tools Route

**Files:**
- Create: `src/components/ToolFeedbackPanel.tsx`
- Modify: `src/App.tsx`
- Delete: `src/components/ToolContactFooter.tsx`
- Modify: `src/locales/en.ts`
- Modify: `src/locales/zh.ts`
- Modify: `src/styles/global.css`
- Modify: `tests/tool-feedback-panel.test.tsx`
- Modify: `tests/tools-markup.test.tsx`

**Interfaces:**
- Consumes: Task 3 validation/client/Turnstile interfaces and `useI18n()` including `language`.
- Produces: `ToolFeedbackPanel`, rendered exactly once by `Shell` when `showToolFeedback` is true.

- [ ] **Step 1: Replace the old contact assertions with failing panel assertions**

```ts
it.each(["/tools", "/tools/cv-kinetics", "/tools/reviewer-two", "/tools/rate-performance/model-comparison"])
  ("shows one feedback panel on %s", async (path) => {
    const view = await renderRoute(path);
    expect(view.querySelectorAll(".tool-feedback-panel")).toHaveLength(1);
    expect(view.querySelector(".tool-feedback-contact")?.textContent)
      .toBe("Found an issue, got an unexpected result, or have a suggestion? Contact Dr. Wu at wui@vscht.cz");
    expect((view.querySelector(".tool-feedback-contact a") as HTMLAnchorElement).href)
      .toContain("mailto:wui@vscht.cz");
  });
```

Also assert `/missing` has no panel, the contact text has one paragraph and exactly one `Dr. Wu`, and there is no `input[type=file]`, manuscript field, attachment control, or API-key input.

- [ ] **Step 2: Run the panel tests and confirm RED**

Run: `pnpm test -- tests/tool-feedback-panel.test.tsx tests/tools-markup.test.tsx`

Expected: FAIL because `ToolFeedbackPanel` is absent and old copy has two paragraphs/two `Dr. Wu` strings.

- [ ] **Step 3: Add complete English and Chinese resources**

Add explicit keys for title, category and three options, message, optional reply email, confidentiality warning, processor/privacy notice, submit, submitting, success, field errors, Turnstile error, rate limit, network error, delivery error, unavailable fallback, and the one-paragraph contact prefix. Keep `tools.contactEmail` as the email-only interpolation or replace it consistently in both locales and tests.

- [ ] **Step 4: Implement the panel state machine**

Use states `idle | submitting | success | error`, store the selected category/message/reply email/token, create `submittedAt` immediately before submission, and use `window.location.pathname` plus current `language`. On success clear message/email, increment `resetKey`, and announce success with `role="status"`; on error preserve user text and focus the status region.

- [ ] **Step 5: Integrate once at the existing App shell boundary**

```tsx
function Shell({ children, showToolFeedback }: { children: ReactNode; showToolFeedback: boolean }) {
  return <main><SiteHeader /><Suspense fallback={<RouteLoading />}>{children}</Suspense>{showToolFeedback && <ToolFeedbackPanel />}<SiteFooter /></main>;
}
```

Do not edit any individual CV or Rate Performance component/page.

- [ ] **Step 6: Add responsive, accessible styles**

Use a bounded panel width, existing border/color tokens, one-column fields on narrow screens, visible `:focus-visible`, a non-overflowing Turnstile wrapper, and `.tool-feedback-contact` as one paragraph. Do not use `white-space: nowrap` on mobile; the requirement is no authored line break, not forced overflow.

- [ ] **Step 7: Run focused UI tests in both locales**

Run: `pnpm test -- tests/tool-feedback-panel.test.tsx tests/tools-markup.test.tsx tests/i18n.test.tsx tests/accessibility-regressions.test.tsx`

Expected: PASS with no unhandled React state-update warnings from the new tests.

- [ ] **Step 8: Commit the shared panel**

```bash
git add src/App.tsx src/components/ToolFeedbackPanel.tsx src/components/TurnstileWidget.tsx src/locales/en.ts src/locales/zh.ts src/styles/global.css tests/tool-feedback-panel.test.tsx tests/tools-markup.test.tsx
git rm src/components/ToolContactFooter.tsx
git commit -m "feat: add Tools feedback panel"
```

### Task 5: Publish v1.1 and an Accurate Budapest Build Date

**Files:**
- Modify: `src/components/SiteFooter.tsx`
- Modify: `vite.config.ts`
- Modify: `src/vite-env.d.ts`
- Test: `tests/site-footer.test.tsx`
- Modify: `tests/vite-config.test.ts`

**Interfaces:**
- Produces: `formatBuildDate(date: Date): string` from `vite.config.ts` and compile-time string `__TMCC_BUILD_DATE__`.

- [ ] **Step 1: Write failing footer and time-zone tests**

```ts
it("formats the release date in Europe/Budapest", () => {
  expect(formatBuildDate(new Date("2026-08-31T22:30:00.000Z"))).toBe("2026-09-01");
});

it("renders TMCC Database v1.1 and the injected ISO build date", () => {
  renderFooter();
  expect(document.body.textContent).toContain("TMCC Database v1.1");
  expect(document.body.textContent).toContain("Last update: 2026-09-01");
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm test -- tests/site-footer.test.tsx tests/vite-config.test.ts`

Expected: FAIL with current v0.1/date constants and missing formatter.

- [ ] **Step 3: Define the build date and update the footer**

```ts
export function formatBuildDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

export default defineConfig({
  define: { __TMCC_BUILD_DATE__: JSON.stringify(formatBuildDate(new Date())) },
  // preserve every existing option
});
```

`SiteFooter` renders `TMCC Database v1.1` and `t("footer.lastUpdate", { date: __TMCC_BUILD_DATE__ })`. Keep the existing record count unchanged.

- [ ] **Step 4: Run tests and a production build**

Run: `pnpm test -- tests/site-footer.test.tsx tests/vite-config.test.ts`

Expected: PASS.

Run: `pnpm build`

Expected: exit 0 and `dist/tools/reviewer-two/index.html` exists.

- [ ] **Step 5: Commit the release metadata**

```bash
git add src/components/SiteFooter.tsx src/vite-env.d.ts vite.config.ts tests/site-footer.test.tsx tests/vite-config.test.ts
git commit -m "feat: publish TMCC Database v1.1 metadata"
```

### Task 6: Add CI, Protected-Path Enforcement, and Deployment Runbooks

**Files:**
- Create: `scripts/check-protected-paths.mjs`
- Create: `tests/protected-paths.test.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-feedback-worker.yml`
- Modify: `.github/workflows/deploy-pages.yml`
- Create: `services/feedback-worker/README.md`

**Interfaces:**
- Produces: `findProtectedPaths(paths: string[]): string[]` and CLI accepting base/head revisions.
- CI consumes root and Worker package scripts; deploy workflows consume GitHub environment secrets/variables.

- [ ] **Step 1: Write failing protected-path tests**

```ts
expect(findProtectedPaths([
  "src/pages/CvKineticsPage.tsx",
  "src/tools/rate-performance/models/registry.ts",
  "src/data/materials.ts",
  "src/components/ToolFeedbackPanel.tsx"
])).toEqual([
  "src/pages/CvKineticsPage.tsx",
  "src/tools/rate-performance/models/registry.ts",
  "src/data/materials.ts"
]);
```

Include `src/components/Cv*`, `src/lib/cv*`, `src/pages/CvKineticsPage.tsx`, `src/tools/rate-performance/**`, `src/data/**`, and known database/data-import paths. Do not classify `tests/tools-markup.test.tsx` as protected merely because it mentions tool names.

- [ ] **Step 2: Run the audit test and confirm RED**

Run: `pnpm test -- tests/protected-paths.test.ts`

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement the pure matcher and CLI**

The CLI runs `git diff --name-only <base>...<head>`, prints every protected path, and exits 1 if any exist; otherwise it prints `Protected-path audit passed` and exits 0. Export the pure matcher for Vitest.

- [ ] **Step 4: Add PR CI**

`ci.yml` checks out full history, sets up pnpm 9 and Node 22, installs the root and Worker with frozen lockfiles, runs root tests/build, Worker tests/typecheck, and executes the protected-path audit against the PR base/head SHAs. It has read-only contents permission and no deployment secrets.

- [ ] **Step 5: Add environment-gated Worker deployment**

`deploy-feedback-worker.yml` is `workflow_dispatch` only, uses GitHub environment `feedback-production`, installs the Worker, runs tests/typecheck, then runs `pnpm --dir services/feedback-worker deploy`. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` come only from environment secrets. Worker runtime secrets are preconfigured in Cloudflare and are never echoed.

- [ ] **Step 6: Inject public frontend configuration into Pages build**

Add only:

```yaml
env:
  VITE_FEEDBACK_ENDPOINT: ${{ vars.VITE_FEEDBACK_ENDPOINT }}
  VITE_TURNSTILE_SITE_KEY: ${{ vars.VITE_TURNSTILE_SITE_KEY }}
```

to the GitHub Pages build step. Add a preceding validation step that fails when either public variable is empty. Do not add recipient or secret values.

- [ ] **Step 7: Write the exact operator runbook**

Document Porkbun SPF/DKIM additions for the dedicated Resend subdomain, Resend verification, Turnstile preview/production widgets, `wrangler secret put` commands for all four secrets, GitHub public variables, preview command, deployment command, one-message production test, and `wrangler rollback --env production`. State explicitly that existing root MX and website records are out of scope.

- [ ] **Step 8: Run tests, audit, YAML review, and commit**

Run: `pnpm test -- tests/protected-paths.test.ts`

Expected: PASS.

Run: `node scripts/check-protected-paths.mjs origin/main HEAD`

Expected: `Protected-path audit passed`.

Manually inspect both workflows for least-privilege permissions and absence of secret interpolation into logs.

```bash
git add scripts/check-protected-paths.mjs tests/protected-paths.test.ts .github/workflows/ci.yml .github/workflows/deploy-feedback-worker.yml .github/workflows/deploy-pages.yml services/feedback-worker/README.md
git commit -m "ci: guard and deploy Tools feedback"
```

### Task 7: Full Verification, Preview, PR Update, and Fixed Release

**Files:**
- Modify only if verification reveals an in-scope defect; otherwise no product files.
- Update: pull request #1 description and branch commits through GitHub.
- Create remotely after production success: tag/release `v1.1.0`.

**Interfaces:**
- Consumes every task deliverable.
- Produces a deployed Worker, deployed GitHub Pages site, one verified feedback email, and fixed release `v1.1.0`.

- [ ] **Step 1: Run fresh complete verification**

Run: `pnpm test`

Expected: all frontend tests PASS.

Run: `pnpm build`

Expected: exit 0; `dist/tools/reviewer-two/index.html` exists.

Run: `pnpm --dir services/feedback-worker test`

Expected: all Worker tests PASS.

Run: `pnpm --dir services/feedback-worker typecheck`

Expected: exit 0.

Run: `node scripts/check-protected-paths.mjs origin/main HEAD`

Expected: `Protected-path audit passed`.

Run: `git diff --check origin/main...HEAD`

Expected: no output and exit 0.

- [ ] **Step 2: Inspect the complete changed-file list before any remote deployment**

Run: `git diff --name-only origin/main...HEAD`

Expected: only Reviewer Two integration, shared feedback/footer, Worker, tests, docs, scripts, and workflows named in this plan. If any protected path appears, stop immediately and report it.

- [ ] **Step 3: Configure and deploy preview infrastructure**

Add only dedicated Resend subdomain records at Porkbun, verify the sender in Resend, create Turnstile preview and production widgets, configure Worker secrets, and deploy the preview Worker. Do not alter root MX, existing website records, or any repository outside scope.

- [ ] **Step 4: Exercise the local frontend against the preview Worker**

Build/run the site with preview endpoint and public Turnstile test site key. Verify valid submission, short message, bad email, expired token, rate limit, provider failure, both languages, keyboard navigation, desktop width, and mobile width. Use a mocked/sandbox recipient for preview so no production email is sent.

- [ ] **Step 5: Deploy the production Worker and perform exactly one live mail test**

Deploy the tested Worker with production secrets and allowed origins. Submit one message whose subject contains `[TMCC feedback test]`; verify that `bingwu233@gmail.com` receives it. Do not send additional live test messages unless the first result is technically inconclusive.

- [ ] **Step 6: Push only the feature branch and update PR #1**

Run: `git push origin feat/reviewer-two-tools`

Expected: remote feature branch advances; `main` is untouched.

Update PR #1 summary and verification with feedback architecture, privacy boundary, Worker tests, complete test counts, build result, protected-path result, preview URL, and successful one-message email result.

- [ ] **Step 7: Require PR checks and final diff review before merge**

Wait for every PR check. Re-open the changed-files list and verify no protected files changed. Merge PR #1 through GitHub only when checks are green and the branch remains conflict-free.

- [ ] **Step 8: Wait for GitHub Pages and verify production**

Wait for the existing Pages workflow to complete. Verify live `/tools`, `/tools/reviewer-two`, one existing non-Reviewer tool route, English/Chinese switching, feedback form availability, the single-line authored contact paragraph, `TMCC Database v1.1`, and `Last update: 2026-09-01`.

- [ ] **Step 9: Create the fixed release**

Create annotated tag `v1.1.0` at the verified merge commit and publish a GitHub Release describing Reviewer Two Tools launch, secure feedback, privacy limitations, and verification results. Do not move or recreate the tag after publishing.

- [ ] **Step 10: Present the deployed page and preserve rollback state**

Open `https://tmccdb.org/tools/reviewer-two` in the in-app browser. Keep the feature worktree and previous Worker deployment until the user has seen the live page. Report the PR, merge commit, release, Worker deployment, tests, protected-path audit, and live URL in Chinese.

---

## Plan Self-Review Results

- **Spec coverage:** Every scope, architecture, contract, privacy, error, test, deployment, and rollback requirement maps to Tasks 1–7.
- **Placeholder scan:** No unresolved marker, deferred implementation instruction, or undefined “similar to” step remains.
- **Type consistency:** `FeedbackPayload`, `ValidatedFeedback`, `WorkerEnv`, response codes, frontend states, and environment names are consistent across producer and consumer tasks.
- **Protected scope:** No planned edit targets a CV, Rate Performance, materials dataset, database, or scientific calculation file.
