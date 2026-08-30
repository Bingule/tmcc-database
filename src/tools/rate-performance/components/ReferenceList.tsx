import { useI18n } from "../../../i18n/I18nProvider";
import type { RateReference } from "../references/types";

export function ReferenceList({ references }: { references: ReadonlyArray<Readonly<RateReference>> }) {
  const { t } = useI18n();
  return <section className="tool-section rate-reference-list">
    <h2>{t("rate.references.title")}</h2>
    {references.length === 0
      ? <p>{t("rate.references.empty")}</p>
      : <ol>{references.map((reference) => <li key={reference.id}>
        <span>{reference.authors.join(", ")}. “{reference.title}.” <i>{reference.journal}</i> {reference.volume}{reference.pages ? `, ${reference.pages}` : ""}{reference.articleNumber ? `, ${reference.articleNumber}` : ""} ({reference.year}). </span>
        <a href={reference.url} rel="noreferrer">DOI: {reference.doi}</a>
      </li>)}</ol>}
  </section>;
}
