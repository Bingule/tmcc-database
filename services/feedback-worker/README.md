# TMCC Tools feedback Worker

This isolated Cloudflare Worker accepts the shared feedback form used only on TMCC Tools routes. It validates the exact request contract, applies Cloudflare's native five-per-60-seconds rate limit, verifies Turnstile, and sends a plain-text email through Resend. It stores no submission database and logs no message, reply email, raw IP, Turnstile token, or provider body.

## Production boundary

- Sender domain: the dedicated Resend subdomain `notify.tmccdb.org`.
- Browser origin: `https://tmccdb.org` and `https://www.tmccdb.org` only in production.
- Secrets: `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `FEEDBACK_RECIPIENT`, and `RATE_LIMIT_SALT` exist only in Cloudflare.
- Public GitHub variables: `VITE_FEEDBACK_ENDPOINT` and `VITE_TURNSTILE_SITE_KEY` contain no secret.
- Existing root-domain MX records, existing website records, database files, and scientific Tools code are outside this deployment's scope.

## 1. Verify the Resend sender subdomain

1. In Resend, add `notify.tmccdb.org` as a sending domain.
2. Copy the exact SPF and DKIM DNS records shown by Resend. Do not guess record names or values.
3. In Porkbun DNS for `tmccdb.org`, add only those records under the `notify` subdomain.
4. Do not edit root (`@`) MX records, the existing website A/AAAA/CNAME records, or nameservers.
5. Wait for Resend to report the subdomain as verified before deploying production mail.

## 2. Create Turnstile widgets

Create separate preview and production widgets in Cloudflare Turnstile. Restrict the production widget to `tmccdb.org` and `www.tmccdb.org`; restrict preview to the exact preview hostname. Record each public site key and keep each secret key private.

## 3. Configure Worker secrets

From `services/feedback-worker`, run each command and paste the value only at Wrangler's hidden prompt:

```sh
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --env production
pnpm exec wrangler secret put RESEND_API_KEY --env production
pnpm exec wrangler secret put FEEDBACK_RECIPIENT --env production
pnpm exec wrangler secret put RATE_LIMIT_SALT --env production
```

Use a cryptographically random value of at least 32 bytes for `RATE_LIMIT_SALT`. Repeat with `--env preview` and preview-specific credentials when testing preview. Never pass secret values on the command line, store them in `.dev.vars.example`, or prefix them with `VITE_`.

## 4. Verify locally and preview

Install and verify the isolated package:

```sh
pnpm install --frozen-lockfile --ignore-workspace
pnpm test
pnpm typecheck
pnpm dev
```

For local development only, copy `.dev.vars.example` to `.dev.vars` and fill it locally; `.dev.vars` is ignored and must never be committed. Use Turnstile test keys for automated/local tests, not production keys.

Deploy the preview environment after configuring preview secrets:

```sh
pnpm exec wrangler deploy --env preview
```

Verify CORS from the exact preview origin, challenge success/failure, validation errors, rate limiting, and one plain-text email before production.

## 5. Production deployment

1. Add repository environment `feedback-production` with secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
2. Ensure the API token is restricted to the required Workers deployment scope for the selected Cloudflare account.
3. Preconfigure all four Worker runtime secrets in Cloudflare.
4. Run the GitHub Actions workflow **Deploy feedback Worker** from the reviewed commit.
5. Set repository variables:
   - `VITE_FEEDBACK_ENDPOINT` to the deployed production Worker HTTPS endpoint.
   - `VITE_TURNSTILE_SITE_KEY` to the production public Turnstile site key.
6. Deploy GitHub Pages from the reviewed `main` commit. Its build fails if either public variable is missing.

Submit one production message from a live Tools page. Confirm only one email arrives, the optional reply address works, and browser developer tools show no recipient or runtime secret. Do not include confidential or unpublished manuscript content in the test message.

## Rollback

List Worker deployments, then roll back to the previous known-good version:

```sh
pnpm exec wrangler deployments list --env production
pnpm exec wrangler rollback --env production
```

If email delivery is unavailable, keep the visible `wui@vscht.cz` fallback contact and remove or disable only the feedback endpoint/site-key variables in a reviewed rollback commit. Preserve the previous Worker version until the live page and one-message delivery check pass.
