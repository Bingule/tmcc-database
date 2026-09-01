import type { Fetcher, ValidatedFeedback } from "./types";

export interface ResendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  text: string;
  reply_to?: string;
}

const categoryLabels: Record<ValidatedFeedback["category"], string> = {
  issue: "Issue",
  unexpected_result: "Unexpected result",
  suggestion: "Suggestion"
};

export function buildEmail(
  feedback: ValidatedFeedback,
  recipient: string,
  sender: string
): ResendEmailPayload {
  assertSafeHeader(recipient);
  assertSafeHeader(sender);
  if (feedback.replyEmail) assertSafeHeader(feedback.replyEmail);

  const category = categoryLabels[feedback.category];
  const email: ResendEmailPayload = {
    from: sender,
    to: [recipient],
    subject: `[TMCC feedback] ${category} — ${feedback.pagePath}`,
    text: [
      `Category: ${category}`,
      `Page: ${feedback.pagePath}`,
      `Language: ${feedback.language}`,
      `Submitted: ${feedback.submittedAt}`,
      `Reply email: ${feedback.replyEmail || "Not provided"}`,
      "",
      "Message:",
      feedback.message
    ].join("\n")
  };

  if (feedback.replyEmail) email.reply_to = feedback.replyEmail;
  return email;
}

export async function sendFeedbackEmail(
  email: ResendEmailPayload,
  apiKey: string,
  fetcher: Fetcher = fetch
): Promise<boolean> {
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(email),
      signal: AbortSignal.timeout(8_000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

function assertSafeHeader(value: string): void {
  if (/[\r\n]/.test(value)) throw new Error("Unsafe email header");
}
