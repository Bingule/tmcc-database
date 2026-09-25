import { describe, expect, it, vi } from "vitest";
import { buildEmail, sendFeedbackEmail } from "../src/email";
import type { ValidatedFeedback } from "../src/types";

const validFeedback: ValidatedFeedback = {
  category: "suggestion",
  message: "Please add clearer export guidance.",
  replyEmail: "reader@example.org",
  pagePath: "/tools/reviewer-two",
  language: "en",
  submittedAt: "2026-09-01T10:00:00.000Z",
  turnstileToken: "verified-token"
};

describe("feedback email delivery", () => {
  it("builds a plain-text message with a fixed recipient and optional reply-to", () => {
    const email = buildEmail(
      validFeedback,
      "bingwu233@gmail.com",
      "TMCC Feedback <feedback@notify.tmccdb.org>"
    );

    expect(email).toEqual({
      from: "TMCC Feedback <feedback@notify.tmccdb.org>",
      to: ["bingwu233@gmail.com"],
      subject: "[TMCC feedback] Suggestion — /tools/reviewer-two",
      text: [
        "Category: Suggestion",
        "Page: /tools/reviewer-two",
        "Language: en",
        "Submitted: 2026-09-01T10:00:00.000Z",
        "Reply email: reader@example.org",
        "",
        "Message:",
        "Please add clearer export guidance."
      ].join("\n"),
      reply_to: "reader@example.org"
    });
    expect(email).not.toHaveProperty("html");
    expect(JSON.stringify(email)).not.toContain("verified-token");
  });

  it("omits reply_to when the visitor did not provide an address", () => {
    const email = buildEmail(
      { ...validFeedback, category: "unexpected_result", replyEmail: "", language: "zh" },
      "recipient@example.org",
      "feedback@notify.tmccdb.org"
    );

    expect(email.subject).toBe("[TMCC feedback] Unexpected result — /tools/reviewer-two");
    expect(email.text).toContain("Reply email: Not provided");
    expect(email).not.toHaveProperty("reply_to");
  });

  it.each([
    ["recipient@example.org\r\nBcc: bad@example.org", "feedback@example.org"],
    ["recipient@example.org", "feedback@example.org\nBcc: bad@example.org"]
  ])("rejects header control characters", (recipient, sender) => {
    expect(() => buildEmail(validFeedback, recipient, sender)).toThrow("Unsafe email header");
  });

  it("posts the complete documented Resend request", async () => {
    const email = buildEmail(validFeedback, "recipient@example.org", "feedback@example.org");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-id" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));

    await expect(sendFeedbackEmail(email, "resend-key", fetcher)).resolves.toBe(true);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer resend-key",
        "content-type": "application/json"
      },
      body: JSON.stringify(email)
    });
  });

  it("returns false for provider and network failures without exposing bodies", async () => {
    const email = buildEmail(validFeedback, "recipient@example.org", "feedback@example.org");
    const providerFailure = vi.fn().mockResolvedValue(new Response("secret provider detail", { status: 422 }));
    const networkFailure = vi.fn().mockRejectedValue(new TypeError("network detail"));

    await expect(sendFeedbackEmail(email, "key", providerFailure)).resolves.toBe(false);
    await expect(sendFeedbackEmail(email, "key", networkFailure)).resolves.toBe(false);
  });
});
