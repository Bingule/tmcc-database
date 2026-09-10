import { describe, expect, it, vi } from "vitest";
import { createFeedbackHandler } from "../src/index";
import type { Fetcher, WorkerEnv } from "../src/types";

const validPayload = {
  category: "issue",
  message: "The calculated result was unexpected.",
  replyEmail: "reader@example.org",
  pagePath: "/tools/reviewer-two",
  language: "en",
  submittedAt: "2026-09-01T10:00:00.000Z",
  turnstileToken: "turnstile-secret-token"
};

function fakeEnv(rateLimitSuccess = true): WorkerEnv {
  return {
    ALLOWED_ORIGINS: "https://tmccdb.org",
    FEEDBACK_FROM: "TMCC Feedback <feedback@notify.tmccdb.org>",
    FEEDBACK_RECIPIENT: "bingwu233@gmail.com",
    RATE_LIMIT_SALT: "rate-limit-salt",
    RESEND_API_KEY: "resend-secret-key",
    TURNSTILE_SECRET_KEY: "turnstile-secret-key",
    FEEDBACK_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: rateLimitSuccess }) }
  };
}

function request(
  payload: unknown = validPayload,
  options: { method?: string; origin?: string; contentType?: string; body?: string } = {}
): Request {
  return new Request("https://feedback.example.workers.dev/", {
    method: options.method ?? "POST",
    headers: {
      origin: options.origin ?? "https://tmccdb.org",
      "content-type": options.contentType ?? "application/json",
      "cf-connecting-ip": "203.0.113.4"
    },
    body: options.method === "OPTIONS" || options.method === "GET"
      ? undefined
      : options.body ?? JSON.stringify(payload)
  });
}

function successfulFetcher(): Fetcher {
  return vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("siteverify")) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url === "https://api.resend.com/emails") {
      return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

const silentLogger = { info: vi.fn(), error: vi.fn() };

function handlerWith(fetcher: Fetcher) {
  return createFeedbackHandler({ fetcher, logger: silentLogger, requestId: () => "request-1" });
}

describe("feedback Worker endpoint", () => {
  it("keeps the default request ID generator bound to Web Crypto", async () => {
    const randomUuid = vi.spyOn(crypto, "randomUUID").mockImplementation(function (this: Crypto) {
      if (this !== crypto) throw new TypeError("Illegal invocation");
      return "00000000-0000-4000-8000-000000000000";
    });

    try {
      const handler = createFeedbackHandler({ fetcher: successfulFetcher(), logger: silentLogger });
      const response = await handler.fetch(request(validPayload, { method: "GET" }), fakeEnv());

      expect(response.status).toBe(405);
      expect(await body(response)).toEqual({
        code: "method_not_allowed",
        requestId: "00000000-0000-4000-8000-000000000000"
      });
    } finally {
      randomUuid.mockRestore();
    }
  });

  it("answers an allowed CORS preflight without invoking providers", async () => {
    const fetcher = successfulFetcher();
    const handler = handlerWith(fetcher);
    const response = await handler.fetch(request(undefined, { method: "OPTIONS" }), fakeEnv());

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://tmccdb.org");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [request(validPayload, { origin: "https://evil.example" }), 403, "forbidden"],
    [request(validPayload, { method: "GET" }), 405, "method_not_allowed"],
    [request(validPayload, { contentType: "text/plain" }), 415, "unsupported_media"],
    [request(validPayload, { body: "{" }), 400, "invalid_payload"],
    [request({ ...validPayload, message: "short" }), 400, "invalid_payload"]
  ])("returns a safe boundary error", async (incoming, status, code) => {
    const handler = handlerWith(successfulFetcher());
    const response = await handler.fetch(incoming, fakeEnv());

    expect(response.status).toBe(status);
    expect(await body(response)).toEqual({ code, requestId: "request-1" });
  });

  it("returns 429 with Retry-After when the derived client key is limited", async () => {
    const env = fakeEnv(false);
    const handler = handlerWith(successfulFetcher());
    const response = await handler.fetch(request(), env);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await body(response)).toEqual({ code: "rate_limited", requestId: "request-1" });
  });

  it("rejects failed Turnstile before contacting Resend", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }));
    const handler = handlerWith(fetcher);
    const response = await handler.fetch(request(), fakeEnv());

    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ code: "turnstile_failed", requestId: "request-1" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("returns a generic upstream error when Resend fails", async () => {
    const fetcher = vi.fn(async (input) => String(input).includes("siteverify")
      ? new Response(JSON.stringify({ success: true }), { status: 200 })
      : new Response("private provider detail", { status: 422 }));
    const handler = handlerWith(fetcher);
    const response = await handler.fetch(request(), fakeEnv());

    expect(response.status).toBe(502);
    expect(await body(response)).toEqual({ code: "delivery_failed", requestId: "request-1" });
  });

  it("sends valid feedback and logs only non-sensitive metadata", async () => {
    const entries: unknown[] = [];
    const logger = { info: (entry: unknown) => entries.push(entry), error: (entry: unknown) => entries.push(entry) };
    const fetcher = successfulFetcher();
    const env = fakeEnv();
    const handler = createFeedbackHandler({ fetcher, logger, requestId: () => "request-1" });
    const response = await handler.fetch(request(), env);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true, requestId: "request-1" });
    expect(env.FEEDBACK_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(entries).toEqual([{
      event: "feedback_sent",
      requestId: "request-1",
      category: "issue",
      pagePath: "/tools/reviewer-two"
    }]);

    const serialized = JSON.stringify(entries);
    for (const secret of [
      validPayload.message,
      validPayload.replyEmail,
      validPayload.turnstileToken,
      "203.0.113.4",
      env.RESEND_API_KEY,
      env.TURNSTILE_SECRET_KEY
    ]) expect(serialized).not.toContain(secret);
  });
});
