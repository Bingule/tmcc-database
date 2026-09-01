import { describe, expect, it, vi } from "vitest";
import {
  submitFeedback,
  validateFeedback,
  type FeedbackSubmitPayload
} from "../src/lib/feedback";

const validPayload: FeedbackSubmitPayload = {
  category: "suggestion",
  message: "Please add clearer export guidance.",
  replyEmail: "reader@example.org",
  pagePath: "/tools/reviewer-two",
  language: "en",
  submittedAt: "2026-09-01T10:00:00.000Z",
  turnstileToken: "test-token"
};

describe("feedback client", () => {
  it("validates message and optional reply email before submission", () => {
    expect(validateFeedback({ category: "issue", message: "too short", replyEmail: "" }))
      .toEqual({ message: "too_short" });
    expect(validateFeedback({
      category: "suggestion",
      message: "A message long enough for feedback.",
      replyEmail: "bad"
    })).toEqual({ replyEmail: "invalid_email" });
    expect(validateFeedback({
      category: "unexpected_result",
      message: "A message long enough for feedback.",
      replyEmail: ""
    })).toEqual({});
  });

  it("posts one exact JSON request and returns success", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, requestId: "request-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));

    await expect(submitFeedback(validPayload, { endpoint: "https://feedback.example.workers.dev" }, fetcher))
      .resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("https://feedback.example.workers.dev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload),
      credentials: "omit",
      signal: expect.any(AbortSignal)
    });
  });

  it.each([
    [400, "invalid_payload"],
    [403, "turnstile_failed"],
    [429, "rate_limited"],
    [502, "delivery_failed"],
    [503, "service_unavailable"]
  ])("maps a %i API response to %s without retrying", async (status, code) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code, requestId: "request-1" }), {
      status,
      headers: { "content-type": "application/json" }
    }));

    await expect(submitFeedback(validPayload, { endpoint: "https://feedback.example.workers.dev" }, fetcher))
      .resolves.toEqual({ ok: false, code });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("maps malformed and unknown server failures to service_unavailable", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("not json", { status: 500 }));
    await expect(submitFeedback(validPayload, { endpoint: "https://feedback.example.workers.dev" }, fetcher))
      .resolves.toEqual({ ok: false, code: "service_unavailable" });
  });

  it("maps a network failure without exposing the exception", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("private network detail"));
    await expect(submitFeedback(validPayload, { endpoint: "https://feedback.example.workers.dev" }, fetcher))
      .resolves.toEqual({ ok: false, code: "network_error" });
  });

  it("does not call fetch when the public endpoint is unavailable", async () => {
    const fetcher = vi.fn();
    await expect(submitFeedback(validPayload, { endpoint: "" }, fetcher))
      .resolves.toEqual({ ok: false, code: "service_unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
