import type {
  FeedbackCategory,
  FeedbackLanguage,
  ValidatedFeedback,
  ValidationResult
} from "./types";

const expectedKeys = [
  "category",
  "language",
  "message",
  "pagePath",
  "replyEmail",
  "submittedAt",
  "turnstileToken"
];
const categories = new Set<FeedbackCategory>(["issue", "unexpected_result", "suggestion"]);
const languages = new Set<FeedbackLanguage>(["en", "zh"]);
const toolsPathPattern = /^\/tools(?:\/[a-z0-9-]+)*\/?$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseFeedbackPayload(value: unknown): ValidationResult {
  if (!isRecord(value) || !hasExactKeys(value)) return invalidPayload();

  const {
    category,
    language,
    message,
    pagePath,
    replyEmail,
    submittedAt,
    turnstileToken
  } = value;

  if (!isCategory(category) || !isLanguage(language)) return invalidPayload();
  if (typeof message !== "string" || typeof replyEmail !== "string") return invalidPayload();
  if (typeof pagePath !== "string" || !toolsPathPattern.test(pagePath)) return invalidPayload();
  if (typeof submittedAt !== "string" || Number.isNaN(Date.parse(submittedAt))) return invalidPayload();
  if (typeof turnstileToken !== "string" || turnstileToken.length < 1 || turnstileToken.length > 2048) {
    return invalidPayload();
  }

  const normalizedMessage = message.trim();
  const normalizedEmail = replyEmail.trim();
  if (normalizedMessage.length < 20 || normalizedMessage.length > 2000) return invalidPayload();
  if (normalizedEmail.length > 254 || (normalizedEmail !== "" && !emailPattern.test(normalizedEmail))) {
    return invalidPayload();
  }

  const normalized: ValidatedFeedback = {
    category,
    language,
    message: normalizedMessage,
    pagePath,
    replyEmail: normalizedEmail,
    submittedAt,
    turnstileToken
  };
  return { ok: true, value: normalized };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function isCategory(value: unknown): value is FeedbackCategory {
  return typeof value === "string" && categories.has(value as FeedbackCategory);
}

function isLanguage(value: unknown): value is FeedbackLanguage {
  return typeof value === "string" && languages.has(value as FeedbackLanguage);
}

function invalidPayload(): ValidationResult {
  return { ok: false, code: "invalid_payload" };
}
