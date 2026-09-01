import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";

const REPOSITORY_URL = "https://github.com/Bingule/reviewer-two";
const COMMIT = "9ff847d0b23a23c87b24e5340907df4c45f32ffc";
const INSTRUCTIONS_URL = `${REPOSITORY_URL}/blob/${COMMIT}/README.md`;

const steps = [
  ["reviewerTwo.flow.step1.title", "reviewerTwo.flow.step1.body"],
  ["reviewerTwo.flow.step2.title", "reviewerTwo.flow.step2.body"],
  ["reviewerTwo.flow.step3.title", "reviewerTwo.flow.step3.body"]
] as const;

export function ReviewerTwoPage() {
  const { t } = useI18n();

  return (
    <section className="tools-page reviewer-two-page">
      <Breadcrumbs current={t("reviewerTwo.title")} />
      <header className="tool-page-header reviewer-two-header">
        <p className="reviewer-two-eyebrow">{t("reviewerTwo.eyebrow")}</p>
        <h1>{t("reviewerTwo.title")}</h1>
        <p>{t("reviewerTwo.subtitle")}</p>
        <div className="reviewer-two-actions">
          <a className="primary-button" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
            {t("reviewerTwo.actions.repository")}
          </a>
          <a className="secondary-button" href={INSTRUCTIONS_URL} target="_blank" rel="noopener noreferrer">
            {t("reviewerTwo.actions.instructions")}
          </a>
        </div>
      </header>

      <aside className="reviewer-two-privacy" role="note">
        <h2>{t("reviewerTwo.privacy.title")}</h2>
        <p>{t("reviewerTwo.privacy.body")}</p>
      </aside>

      <section className="reviewer-two-section" aria-labelledby="reviewer-two-flow-title">
        <h2 id="reviewer-two-flow-title">{t("reviewerTwo.flow.title")}</h2>
        <ol className="reviewer-two-steps">
          {steps.map(([title, body]) => (
            <li key={title}>
              <h3>{t(title)}</h3>
              <p>{t(body)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="reviewer-two-version" aria-labelledby="reviewer-two-version-title">
        <h2 id="reviewer-two-version-title">{t("reviewerTwo.version.title")}</h2>
        <p>{t("reviewerTwo.version.body")}</p>
        <p>
          <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
            github.com/Bingule/reviewer-two
          </a>
        </p>
        <p><span>{t("reviewerTwo.version.commit")}</span> <code>{COMMIT}</code></p>
      </section>
    </section>
  );
}

export default ReviewerTwoPage;
