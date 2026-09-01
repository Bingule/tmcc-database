import { useI18n } from "../../../i18n/I18nProvider";
import type { RateModelParameterType } from "../models/types";
import { ScientificSymbol, ScientificUnit } from "./ScientificTypography";

export interface RateResultCardItem {
  readonly id: string;
  readonly label: string;
  readonly value: string | number;
  readonly unit?: string;
  readonly detail?: string;
  readonly type?: RateModelParameterType;
}

export function ResultCards({
  kind,
  items,
}: {
  kind: "example" | "user";
  items: ReadonlyArray<Readonly<RateResultCardItem>>;
}) {
  const { t } = useI18n();
  return <section className={`rate-results rate-results-${kind}`} aria-label={t(`rate.results.${kind}`)}>
    <p className="rate-result-badge">{t(`rate.results.${kind}`)}</p>
    {items.length === 0
      ? <p className="rate-results-empty">{t("rate.results.empty")}</p>
      : <dl className="rate-result-grid">
        {items.map((item) => <div className="rate-result-card" key={item.id}>
          <dt><ScientificSymbol value={item.label} /></dt>
          <dd>{item.value}{item.unit ? <> <ScientificUnit className="rate-result-unit" value={item.unit} /></> : null}</dd>
          {item.type ? <p>{t(`rate.parameterType.${item.type}`)}</p> : null}
          {item.detail ? <p>{item.detail}</p> : null}
        </div>)}
      </dl>}
  </section>;
}
