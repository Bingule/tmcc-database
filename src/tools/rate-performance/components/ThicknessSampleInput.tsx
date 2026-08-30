import { useI18n } from "../../../i18n/I18nProvider";
import type { ThicknessUnit } from "../analysis/thicknessScaling";
import { RateDataInput, type RateDataInputValue } from "./RateDataInput";

export interface ThicknessElectrodeDraft {
  readonly id: string;
  readonly sampleName: string;
  readonly thickness: number | null;
  readonly thicknessUnit: ThicknessUnit;
  readonly massLoading: number | null;
  readonly rateInput: RateDataInputValue;
}

export function ThicknessSampleInput({
  sample,
  onChange,
  onDuplicate,
  onDelete,
}: {
  sample: Readonly<ThicknessElectrodeDraft>;
  onChange: (sample: ThicknessElectrodeDraft) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return <article className="tool-section rate-thickness-sample" data-thickness-sample-id={sample.id}>
    <div className="rate-thickness-sample-header">
      <label>{t("rate.thickness.sampleName")}
        <input
          type="text"
          aria-label={t("rate.thickness.sampleName")}
          value={sample.sampleName}
          onChange={(event) => onChange({ ...sample, sampleName: event.target.value })}
        />
      </label>
      <div className="rate-input-actions">
        <button type="button" onClick={onDuplicate}>{t("rate.thickness.duplicate")}</button>
        <button type="button" onClick={onDelete}>{t("rate.thickness.delete")}</button>
      </div>
    </div>
    <div className="rate-thickness-metadata">
      <label>{t("rate.thickness.thickness")}
        <input
          type="number"
          min="0"
          step="any"
          aria-label={t("rate.thickness.thickness")}
          value={sample.thickness ?? ""}
          onChange={(event) => onChange({ ...sample, thickness: event.target.value === "" ? null : Number(event.target.value) })}
        />
      </label>
      <label>{t("rate.thickness.thicknessUnit")}
        <select
          aria-label={t("rate.thickness.thicknessUnit")}
          value={sample.thicknessUnit}
          onChange={(event) => onChange({ ...sample, thicknessUnit: event.target.value as ThicknessUnit })}
        >
          <option value="um">µm</option>
          <option value="mm">mm</option>
          <option value="m">m</option>
        </select>
      </label>
      <label>{t("rate.thickness.massLoading")}
        <input
          type="number"
          min="0"
          step="any"
          aria-label={t("rate.thickness.massLoading")}
          value={sample.massLoading ?? ""}
          onChange={(event) => onChange({ ...sample, massLoading: event.target.value === "" ? null : Number(event.target.value) })}
        />
      </label>
    </div>
    <RateDataInput value={sample.rateInput} onChange={(rateInput) => onChange({ ...sample, rateInput })} />
  </article>;
}
