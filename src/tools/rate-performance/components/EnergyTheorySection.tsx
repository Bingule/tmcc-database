import { useI18n } from "../../../i18n/I18nProvider";
import { ModelTheoryPanel, type RateTheoryContent } from "./ModelTheoryPanel";
import { RATE_DISPLAY_EQUATIONS } from "../models/displayEquations";

export function EnergyTheorySection() {
  const { t } = useI18n();
  const content: RateTheoryContent = {
    title: t("rate.energy.theory.title"),
    equation: RATE_DISPLAY_EQUATIONS.energy.source,
    equationTex: RATE_DISPLAY_EQUATIONS.energy.tex,
    equationDescription: t("rate.energy.theory.equationDescription"),
    parameters: [
      { symbol: "V", name: t("rate.energy.theory.voltage"), meaning: t("rate.energy.theory.voltageMeaning"), unit: "V", type: "measured" },
      { symbol: "Q", name: t("rate.energy.theory.capacity"), meaning: t("rate.energy.theory.capacityMeaning"), unit: "Ah kg^-1", type: "measured" },
      { symbol: "Δt", name: t("rate.energy.theory.duration"), meaning: t("rate.energy.theory.durationMeaning"), unit: "h", type: "measured" },
      { symbol: "E, P_avg", name: t("rate.energy.theory.outputs"), meaning: t("rate.energy.theory.outputsMeaning"), unit: "Wh kg^-1; W kg^-1", type: "derived" },
    ],
    physicalMeaning: t("rate.energy.theory.physical"),
    limitingBehavior: t("rate.energy.theory.limits"),
    applicability: t("rate.energy.theory.applicability"),
    assumptions: [t("rate.energy.theory.assumption1"), t("rate.energy.theory.assumption2")],
    limitations: [t("rate.energy.theory.limitation1"), t("rate.energy.theory.limitation2")],
    citationGuidance: t("rate.energy.theory.cite"),
  };
  return <ModelTheoryPanel content={content} />;
}
