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

export interface WorkerEnv {
  ALLOWED_ORIGINS: string;
  FEEDBACK_FROM: string;
  FEEDBACK_RECIPIENT: string;
  RATE_LIMIT_SALT: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  FEEDBACK_RATE_LIMITER: RateLimitBinding;
}
