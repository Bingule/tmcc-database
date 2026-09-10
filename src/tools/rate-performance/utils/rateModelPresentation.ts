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

const registryTextKeys: Readonly<Record<string, TranslationKey>> = {
  "measured rate": "rate.empiricalModels.input.measuredName",
  "Capacity approached in the low-rate limit.": "rate.analysis.qmMeaning",
  "Effective model-dependent charge/discharge timescale.": "rate.analysis.tauMeaning",
  "Dimensionless exponent controlling the high-rate capacity falloff.": "rate.analysis.nMeaning",
  "Applied specific current divided by the measured capacity at that rate; equivalently inverse measured discharge time.": "rate.empiricalModels.input.measuredDefinition",
  "Positive measured-rate capacity data spanning the low-rate plateau and rate-dependent capacity decline.": "rate.model.regime.tian",
  "The conventional capacity plateau and first capacity-decay regime of positive measured-rate data.": "rate.model.regime.rational",
  "Applicability range remains unverified until the primary-source model is validated.": "rate.empiricalModels.pendingRegime",
  "R is the positive finite measured rate defined from measured discharge time, not an unconverted nominal C-rate.": "rate.empiricalModels.assumption.measuredRate",
  "Q_M, tau, and n are positive finite effective model parameters.": "rate.empiricalModels.assumption.parameters",
  "No scientific assumptions are accepted until the exact primary-source equation is verified.": "rate.empiricalModels.pendingAssumptions",
  "The fitted characteristic time is model-dependent and is not by itself a direct microscopic measurement.": "rate.analysis.limitationEffective",
  "Use outside the rate definition and applicability established by the cited publication is unsupported.": "rate.analysis.limitationDefinition",
  "The single rational term applies to the conventional capacity plateau and the first capacity-decay regime established by the cited chronoamperometry work.": "rate.empiricalModels.limitation.rationalFirstDecay",
  "If a second high-rate decay is present, restrict the fitting range to the first decay or use the original publication's two-term model.": "rate.empiricalModels.limitation.rationalSecondDecay",
  "Fitting and numerical output are disabled while the equation, units, limits, and applicability remain unverified.": "rate.empiricalModels.pendingLimitations",
};

const registryUnitKeys: Readonly<Record<string, TranslationKey>> = {
  "same capacity unit as Q": "rate.empiricalModels.unit.capacityAsQ",
  dimensionless: "rate.empiricalModels.unit.dimensionless",
  unconfirmed: "rate.empiricalModels.unit.unconfirmed",
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

export function translatedRegistryText(value: string, t: Translate): string {
  const key = registryTextKeys[value];
  return key ? t(key) : value;
}

export function translatedRegistryUnit(value: string, t: Translate): string {
  const key = registryUnitKeys[value];
  return key ? t(key) : value;
}
