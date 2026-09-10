import { describe, expect, it } from "vitest";
import { parseFeedbackPayload } from "../src/validation";

const validPayload = {
  category: "suggestion",
  message: "  Please add clearer export guidance.  ",
  replyEmail: "reader@example.org",
  pagePath: "/tools/reviewer-two",
  language: "en",
  submittedAt: "2026-09-01T10:00:00.000Z",
  turnstileToken: "test-token"
};

describe("parseFeedbackPayload", () => {
  it.each([
    null,
    {},
    { ...validPayload, category: "other" },
    { ...validPayload, message: "short" },
    { ...validPayload, message: "x".repeat(2001) },
    { ...validPayload, replyEmail: "bad" },
    { ...validPayload, replyEmail: "x".repeat(255) },
    { ...validPayload, pagePath: "/about" },
    { ...validPayload, pagePath: "/tools/../admin" },
    { ...validPayload, language: "de" },
    { ...validPayload, submittedAt: "not-a-date" },
    { ...validPayload, turnstileToken: "" },
    { ...validPayload, turnstileToken: "x".repeat(2049) },
    { ...validPayload, extra: true }
  ])("rejects invalid or non-exact payload %#", (payload) => {
    expect(parseFeedbackPayload(payload)).toEqual({ ok: false, code: "invalid_payload" });
  });

  it("normalizes an exact valid payload", () => {
    expect(parseFeedbackPayload(validPayload)).toEqual({
      ok: true,
      value: {
        ...validPayload,
        message: "Please add clearer export guidance."
      }
    });
  });

  it("accepts an empty reply address and Chinese Tools routes", () => {
    expect(parseFeedbackPayload({
      ...validPayload,
      category: "unexpected_result",
      replyEmail: "",
      pagePath: "/tools/rate-performance/model-comparison",
      language: "zh"
    }).ok).toBe(true);
  });

  it("accepts the trailing slash used by GitHub Pages Tools routes", () => {
    expect(parseFeedbackPayload({
      ...validPayload,
      pagePath: "/tools/reviewer-two/"
    }).ok).toBe(true);
  });
});
