import { useCallback, useRef, useState, type FormEvent } from "react";
import { useI18n } from "../i18n/I18nProvider";
import {
  submitFeedback,
  validateFeedback,
  type FeedbackCategory,
  type FeedbackErrorCode,
  type FeedbackFieldErrors
} from "../lib/feedback";
import { TurnstileWidget } from "./TurnstileWidget";

type SubmissionState = "idle" | "submitting" | "success" | "error";

export function ToolFeedbackPanel() {
  const { language, t } = useI18n();
  const feedbackEndpoint = import.meta.env.VITE_FEEDBACK_ENDPOINT?.trim() ?? "";
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
  const [category, setCategory] = useState<FeedbackCategory>("issue");
  const [message, setMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [errors, setErrors] = useState<FeedbackFieldErrors>({});
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [submissionError, setSubmissionError] = useState<FeedbackErrorCode | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const configured = feedbackEndpoint !== "" && turnstileSiteKey !== "";

  const handleToken = useCallback((token: string) => setTurnstileToken(token), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateFeedback({ category, message, replyEmail });
    setErrors(nextErrors);
    setSubmissionError(null);
    if (Object.keys(nextErrors).length > 0) {
      setSubmissionState("idle");
      return;
    }
    if (!configured) {
      setSubmissionState("error");
      setSubmissionError("service_unavailable");
      return;
    }
    if (!turnstileToken) {
      setSubmissionState("error");
      setSubmissionError("turnstile_failed");
      return;
    }

    setSubmissionState("submitting");
    const result = await submitFeedback({
      category,
      message: message.trim(),
      replyEmail: replyEmail.trim(),
      pagePath: window.location.pathname,
      language,
      submittedAt: new Date().toISOString(),
      turnstileToken
    }, { endpoint: feedbackEndpoint });

    setTurnstileToken("");
    setResetKey((value) => value + 1);
    if (result.ok) {
      setMessage("");
      setReplyEmail("");
      setErrors({});
      setSubmissionState("success");
    } else {
      setSubmissionState("error");
      setSubmissionError(result.code);
    }
    queueMicrotask(() => statusRef.current?.focus());
  }

  return (
    <aside className="tool-feedback-panel" aria-labelledby="tool-feedback-title">
      <div className="tool-feedback-heading">
        <p className="tool-feedback-kicker">{t("feedback.kicker")}</p>
        <h2 id="tool-feedback-title">{t("feedback.title")}</h2>
        <p>{t("feedback.intro")}</p>
      </div>

      <form className="tool-feedback-form" noValidate onSubmit={handleSubmit}>
        <div className="tool-feedback-grid">
          <div className="tool-feedback-field">
            <label htmlFor="tool-feedback-category">{t("feedback.category")}</label>
            <select
              id="tool-feedback-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
              disabled={submissionState === "submitting"}
            >
              <option value="issue">{t("feedback.category.issue")}</option>
              <option value="unexpected_result">{t("feedback.category.unexpectedResult")}</option>
              <option value="suggestion">{t("feedback.category.suggestion")}</option>
            </select>
          </div>

          <div className="tool-feedback-field">
            <label htmlFor="tool-feedback-email">{t("feedback.email")}</label>
            <input
              id="tool-feedback-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={replyEmail}
              onChange={(event) => setReplyEmail(event.target.value)}
              aria-invalid={errors.replyEmail ? "true" : undefined}
              aria-describedby={errors.replyEmail ? "tool-feedback-email-error" : undefined}
              disabled={submissionState === "submitting"}
            />
            {errors.replyEmail && <span id="tool-feedback-email-error" className="tool-feedback-error">{t("feedback.validation.email")}</span>}
          </div>
        </div>

        <div className="tool-feedback-field">
          <label htmlFor="tool-feedback-message">{t("feedback.message")}</label>
          <textarea
            id="tool-feedback-message"
            rows={5}
            minLength={20}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            aria-invalid={errors.message ? "true" : undefined}
            aria-describedby={errors.message ? "tool-feedback-message-error" : "tool-feedback-message-help"}
            disabled={submissionState === "submitting"}
          />
          <span id="tool-feedback-message-help" className="tool-feedback-help">{t("feedback.messageHelp")}</span>
          {errors.message && (
            <span id="tool-feedback-message-error" className="tool-feedback-error">
              {t(errors.message === "too_long" ? "feedback.validation.messageLong" : errors.message === "required" ? "feedback.validation.messageRequired" : "feedback.validation.messageShort")}
            </span>
          )}
        </div>

        <p className="tool-feedback-warning">{t("feedback.confidentiality")}</p>
        <p className="tool-feedback-privacy">{t("feedback.privacy")}</p>

        {configured ? (
          <TurnstileWidget siteKey={turnstileSiteKey} resetKey={resetKey} onToken={handleToken} />
        ) : (
          <p className="tool-feedback-unavailable">{t("feedback.unavailable")}</p>
        )}

        <div className="tool-feedback-actions">
          <button type="submit" disabled={!configured || submissionState === "submitting"}>
            {submissionState === "submitting" ? t("feedback.submitting") : t("feedback.submit")}
          </button>
          <p
            className={`tool-feedback-status tool-feedback-status-${submissionState}`}
            role="status"
            aria-live="polite"
            tabIndex={-1}
            ref={statusRef}
          >
            {submissionState === "success" && t("feedback.success")}
            {submissionState === "error" && submissionError && feedbackErrorMessage(submissionError, t)}
          </p>
        </div>
      </form>

      <p className="tool-feedback-contact">
        {t("tools.contactPrompt")} <a href="mailto:wui@vscht.cz">wui@vscht.cz</a>
      </p>
    </aside>
  );
}

function feedbackErrorMessage(code: FeedbackErrorCode, t: ReturnType<typeof useI18n>["t"]): string {
  if (code === "turnstile_failed") return t("feedback.error.turnstile");
  if (code === "rate_limited") return t("feedback.error.rateLimited");
  if (code === "delivery_failed") return t("feedback.error.delivery");
  if (code === "network_error") return t("feedback.error.network");
  return t("feedback.error.unavailable");
}
