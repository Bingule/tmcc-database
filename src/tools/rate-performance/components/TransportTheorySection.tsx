import { useI18n } from "../../../i18n/I18nProvider";
import { getRateReference } from "../references/rateReferences";
import { ModelTheoryPanel, type RateTheoryContent } from "./ModelTheoryPanel";
import { ReferenceList } from "./ReferenceList";
import { RATE_DISPLAY_EQUATIONS } from "../models/displayEquations";
import {
  displayTransportUnit,
  FIELD_DEFINITIONS,
  type TransportTranslator,
} from "./transportTimePresentation";

const reference = getRateReference("tian-2019-rate-performance");

export function TransportTheorySection() {
  const { t } = useI18n();
  return <>
    <ModelTheoryPanel content={theoryContent(t)} />
    <ReferenceList references={reference ? [reference] : []} />
  </>;
}

function theoryContent(t: TransportTranslator): RateTheoryContent {
  return {
    title: t("rate.transport.theoryName"),
    equation: t("rate.transport.theoryEquation"),
    equationTex: RATE_DISPLAY_EQUATIONS.transport.tex,
    equationDescription: t("rate.transport.theoryEquationDescription"),
    parameters: [
      { symbol: "τ", name: t("rate.transport.fittedTau"), meaning: t("rate.analysis.tauMeaning"), unit: t("rate.transport.theoryTauUnit"), type: "user-input" },
      { symbol: "τ_Eq.6a", name: t("rate.transport.calculatedTotal"), meaning: t("rate.transport.theoryEquationDescription"), unit: "s", type: "derived" },
      ...FIELD_DEFINITIONS.map((definition) => ({
        symbol: definition.symbol,
        name: t(definition.label),
        meaning: t("rate.transport.theoryInputMeaning"),
        unit: displayTransportUnit(definition.unit),
        type: "user-input" as const,
      })),
    ],
    physicalMeaning: t("rate.transport.theoryPhysical"),
    limitingBehavior: t("rate.transport.theoryLimits"),
    applicability: t("rate.transport.theoryApplicability"),
    assumptions: [t("rate.transport.theoryAssumptionSi"), t("rate.transport.theoryAssumptionBruggeman")],
    limitations: [t("rate.transport.theoryLimitationEffective"), t("rate.transport.theoryLimitationMissing")],
    citationGuidance: t("rate.transport.theoryCitation"),
  };
}
