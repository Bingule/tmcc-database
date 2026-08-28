import { useI18n } from "../../../i18n/I18nProvider";

export interface RateColumnMappingValue {
  readonly rateColumn: number;
  readonly capacityColumn: number;
}

export function ColumnMapping({
  headers,
  value,
  onChange,
}: {
  headers: ReadonlyArray<string>;
  value: Readonly<RateColumnMappingValue>;
  onChange: (value: RateColumnMappingValue) => void;
}) {
  const { t } = useI18n();
  return <fieldset className="rate-column-mapping">
    <legend>{t("rate.import.mapping")}</legend>
    <label>{t("rate.import.rateColumn")}
      <select
        aria-label={t("rate.import.rateColumn")}
        value={value.rateColumn}
        onChange={(event) => onChange({ ...value, rateColumn: Number(event.target.value) })}
      >
        {headers.map((header, index) => <option value={index} key={`${index}-${header}`}>{header}</option>)}
      </select>
    </label>
    <label>{t("rate.import.capacityColumn")}
      <select
        aria-label={t("rate.import.capacityColumn")}
        value={value.capacityColumn}
        onChange={(event) => onChange({ ...value, capacityColumn: Number(event.target.value) })}
      >
        {headers.map((header, index) => <option value={index} key={`${index}-${header}`}>{header}</option>)}
      </select>
    </label>
  </fieldset>;
}
