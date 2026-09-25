import { describe, expect, it, vi } from "vitest";
import { corsHeaders, deriveClientKey, verifyTurnstile } from "../src/security";
import type { WorkerEnv } from "../src/types";

function envWithOrigins(origins: string): WorkerEnv {
  return {
    ALLOWED_ORIGINS: origins,
    FEEDBACK_FROM: "TMCC Feedback <feedback@notify.tmccdb.org>",
    FEEDBACK_RECIPIENT: "recipient@example.org",
    RATE_LIMIT_SALT: "test-salt",
    RESEND_API_KEY: "test-resend-key",
    TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    FEEDBACK_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) }
  };
}

describe("feedback Worker security", () => {
  it("allows only an exactly configured origin", () => {
    const env = envWithOrigins("https://tmccdb.org, https://www.tmccdb.org");
    const allowed = corsHeaders("https://tmccdb.org", env);

    expect(allowed?.get("access-control-allow-origin")).toBe("https://tmccdb.org");
    expect(allowed?.get("vary")).toBe("Origin");
    expect(corsHeaders("https://tmccdb.org.evil.example", env)).toBeNull();
    expect(corsHeaders("", env)).toBeNull();
  });

  it("derives a stable one-way client key", async () => {
    const first = await deriveClientKey("203.0.113.4", "test-salt");
    const second = await deriveClientKey("203.0.113.4", "test-salt");
    const other = await deriveClientKey("203.0.113.5", "test-salt");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).not.toContain("203.0.113.4");
  });

  it("validates a Turnstile token with secret, response, and remote IP", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));

    await expect(verifyTurnstile("token-value", "203.0.113.4", "secret-value", fetcher)).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toEqual({
      secret: "secret-value",
      response: "token-value",
      remoteip: "203.0.113.4"
    });
  });

  it.each([
    new Response(JSON.stringify({ success: false }), { status: 200 }),
    new Response("upstream unavailable", { status: 503 })
  ])("rejects an unsuccessful Siteverify response", async (response) => {
    const fetcher = vi.fn().mockResolvedValue(response);
    await expect(verifyTurnstile("token", "203.0.113.4", "secret", fetcher)).resolves.toBe(false);
  });

  it("treats a Siteverify network failure as unsuccessful", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("network failure"));
    await expect(verifyTurnstile("token", "203.0.113.4", "secret", fetcher)).resolves.toBe(false);
  });
});
