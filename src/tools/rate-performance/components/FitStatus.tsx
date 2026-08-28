import { useI18n } from "../../../i18n/I18nProvider";

export type RateFitUiStatus = "idle" | "loading" | "converged" | "partial" | "failed";

export function FitStatus({
  status,
  message,
  warnings = [],
}: {
  status: RateFitUiStatus;
  message?: string;
  warnings?: ReadonlyArray<string>;
}) {
  const { t } = useI18n();
  return <section className={`rate-fit-status rate-fit-status-${status}`} role="status" aria-live="polite">
    <strong>{t(`rate.status.${status}`)}</strong>
    {message ? <p>{message}</p> : null}
    {warnings.length > 0 ? <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
  </section>;
}
