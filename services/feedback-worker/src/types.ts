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

export type ValidationResult =
  | { ok: true; value: ValidatedFeedback }
  | { ok: false; code: "invalid_payload" };

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface FeedbackLogger {
  info(entry: Record<string, unknown>): void;
  error(entry: Record<string, unknown>): void;
}

export interface WorkerEnv {
  ALLOWED_ORIGINS: string;
  FEEDBACK_FROM: string;
  FEEDBACK_RECIPIENT: string;
  RATE_LIMIT_SALT: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  FEEDBACK_RATE_LIMITER: RateLimitBinding;
}
