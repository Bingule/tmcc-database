import type { Language } from "../i18n/I18nProvider";

export type FeedbackCategory = "issue" | "unexpected_result" | "suggestion";

export interface FeedbackFormValues {
  category: FeedbackCategory;
  message: string;
  replyEmail: string;
}

export interface FeedbackSubmitPayload extends FeedbackFormValues {
  pagePath: string;
  language: Language;
  submittedAt: string;
  turnstileToken: string;
}

export type FeedbackFieldErrors = Partial<Record<keyof FeedbackFormValues, "required" | "too_short" | "too_long" | "invalid_email">>;

export type FeedbackErrorCode =
  | "invalid_payload"
  | "turnstile_failed"
  | "rate_limited"
  | "delivery_failed"
  | "service_unavailable"
  | "network_error";

type FeedbackSubmitResult = { ok: true } | { ok: false; code: FeedbackErrorCode };
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const knownErrors = new Set<FeedbackErrorCode>([
  "invalid_payload",
  "turnstile_failed",
  "rate_limited",
  "delivery_failed",
  "service_unavailable"
]);

export function validateFeedback(values: FeedbackFormValues): FeedbackFieldErrors {
  const errors: FeedbackFieldErrors = {};
  const message = values.message.trim();
  const replyEmail = values.replyEmail.trim();

  if (!message) errors.message = "required";
  else if (message.length < 20) errors.message = "too_short";
  else if (message.length > 2000) errors.message = "too_long";

  if (replyEmail.length > 254 || (replyEmail !== "" && !emailPattern.test(replyEmail))) {
    errors.replyEmail = "invalid_email";
  }
  return errors;
}

export async function submitFeedback(
  payload: FeedbackSubmitPayload,
  config: { endpoint: string },
  fetcher: Fetcher = fetch
): Promise<FeedbackSubmitResult> {
  if (!config.endpoint) return { ok: false, code: "service_unavailable" };

  try {
    const response = await fetcher(config.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      signal: AbortSignal.timeout(10_000)
    });
    if (response.ok) return { ok: true };

    const responseBody = await readResponseBody(response);
    const code = responseBody?.code;
    if (typeof code === "string" && knownErrors.has(code as FeedbackErrorCode)) {
      return { ok: false, code: code as FeedbackErrorCode };
    }
    return { ok: false, code: "service_unavailable" };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

async function readResponseBody(response: Response): Promise<{ code?: unknown } | null> {
  try {
    return await response.json() as { code?: unknown };
  } catch {
    return null;
  }
}
