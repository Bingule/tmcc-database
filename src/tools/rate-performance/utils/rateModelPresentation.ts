import type { useI18n } from "../../../i18n/I18nProvider";
import type { TranslationKey } from "../../../locales/en";

type Translate = ReturnType<typeof useI18n>["t"];

const modelNameKeys: Readonly<Record<string, TranslationKey>> = {
  "tian-characteristic-time": "rate.model.name.tian",
  "rational-characteristic-time": "rate.model.name.rational",
  "peukert-type": "rate.model.name.peukert",
  exponential: "rate.model.name.exponential",
  "power-law": "rate.model.name.powerLaw",
  "wong-type": "rate.model.name.wong",
  "heubner-type": "rate.model.name.heubner",
};

export function translatedRateModelName(modelId: string, t: Translate): string {
  const key = modelNameKeys[modelId];
  return key ? t(key) : modelId;
}

export function translatedRateModelFamily(family: string, t: Translate): string {
  return t(family === "characteristic time"
    ? "rate.model.family.characteristicTime"
    : "rate.model.family.empiricalCandidate");
}

export function translatedRateParameterName(parameterId: string, t: Translate): string {
  if (parameterId === "qM") return t("rate.analysis.qmName");
  if (parameterId === "tau") return t("rate.analysis.tauName");
  return t("rate.analysis.nName");
}
