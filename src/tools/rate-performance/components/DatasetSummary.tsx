import { useI18n } from "../../../i18n/I18nProvider";
import type { CapacityUnit, RateUnit } from "../models/types";

export interface RateImportSummary {
  readonly fileName: string;
  readonly sheetName: string;
  readonly detectedHeaders: ReadonlyArray<string>;
  readonly mappedRateColumn: string;
  readonly mappedCapacityColumn: string;
  readonly totalRows: number;
  readonly validPoints: number;
  readonly invalidRows: number;
  readonly missingValues: number;
  readonly rateRange: readonly [number, number] | null;
  readonly capacityRange: readonly [number, number] | null;
  readonly rateUnit: RateUnit;
  readonly capacityUnit: CapacityUnit;
}

export function DatasetSummary({ summary }: { summary: Readonly<RateImportSummary> }) {
  const { t } = useI18n();
  const range = (value: readonly [number, number] | null, unit: string) => value
    ? `${format(value[0])}–${format(value[1])} ${unit}`
    : t("rate.import.noRange");
  return <section className="rate-import-summary" aria-live="polite">
    <h3>{t("rate.import.summary")}</h3>
    <dl>
      <SummaryItem label={t("rate.import.fileName")} value={summary.fileName} />
      <SummaryItem label={t("rate.import.sheetName")} value={summary.sheetName} />
      <SummaryItem label={t("rate.import.detectedColumns")} value={summary.detectedHeaders.join(", ")} />
      <SummaryItem label={t("rate.import.mappedRate")} value={summary.mappedRateColumn} />
      <SummaryItem label={t("rate.import.mappedCapacity")} value={summary.mappedCapacityColumn} />
      <SummaryItem label={t("rate.import.rows")} value={summary.totalRows} />
      <SummaryItem label={t("rate.import.valid")} value={summary.validPoints} />
      <SummaryItem label={t("rate.import.invalid")} value={summary.invalidRows} />
      <SummaryItem label={t("rate.import.missing")} value={summary.missingValues} />
      <SummaryItem label={t("rate.import.rateRange")} value={range(summary.rateRange, summary.rateUnit)} />
      <SummaryItem label={t("rate.import.capacityRange")} value={range(summary.capacityRange, summary.capacityUnit)} />
    </dl>
    <p className="rate-import-counts">
      {t("rate.import.counts", {
        valid: summary.validPoints,
        invalid: summary.invalidRows,
        missing: summary.missingValues,
      })}
    </p>
  </section>;
}

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function format(value: number) {
  return Number(value.toPrecision(7)).toString();
}
