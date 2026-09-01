import { useI18n } from "../../../i18n/I18nProvider";
import { getRateReference } from "../references/rateReferences";
import { ModelTheoryPanel, type RateTheoryContent } from "./ModelTheoryPanel";
import { ReferenceList } from "./ReferenceList";
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
    equationTex: String.raw`\begin{aligned}
      \text{Eq. 5a:}\quad &\tau=\tau_{\mathrm{Electrical}}+\tau_{\mathrm{Diffusive}}+t_{\mathrm c}\\
      \text{Eq. 5b:}\quad &\tau_{\mathrm{Diffusive}}=\frac{L_{\mathrm E}^2}{D_{\mathrm P}}+\frac{L_{\mathrm S}^2}{D_{\mathrm S}}+\frac{L_{\mathrm{AM}}^2}{D_{\mathrm{AM}}}\\
      \text{Eq. 5c:}\quad &\tau_{\mathrm{Electrical}}=C_{\mathrm{eff}}\left(R_{\mathrm{E,E}}+R_{\mathrm{I,P}}+R_{\mathrm{I,S}}\right)\\
      \text{Eq. 5d:}\quad &\tau=C_{\mathrm{eff}}\left(R_{\mathrm{E,E}}+R_{\mathrm{I,P}}+R_{\mathrm{I,S}}\right)+\frac{L_{\mathrm E}^2}{D_{\mathrm P}}+\frac{L_{\mathrm S}^2}{D_{\mathrm S}}+\frac{L_{\mathrm{AM}}^2}{D_{\mathrm{AM}}}+t_{\mathrm c}\\
      \text{Tian Eq. 6a:}\quad &\tau=L_{\mathrm E}^2\left[\frac{C_{\mathrm{V,eff}}}{2\sigma_{\mathrm E}}+\frac{C_{\mathrm{V,eff}}}{2\sigma_{\mathrm{BL}}P_{\mathrm E}^{3/2}}+\frac{1}{D_{\mathrm{BL}}P_{\mathrm E}^{3/2}}\right]\\
      &\quad+L_{\mathrm E}\left[\frac{L_{\mathrm S}C_{\mathrm{V,eff}}}{\sigma_{\mathrm{BL}}P_{\mathrm S}^{3/2}}\right]+\left[\frac{L_{\mathrm S}^2}{D_{\mathrm{BL}}P_{\mathrm S}^{3/2}}+\frac{L_{\mathrm{AM}}^2}{D_{\mathrm{AM}}}+t_{\mathrm c}\right]\\
      \text{Eq. 6b:}\quad &\tau=aL_{\mathrm E}^2+bL_{\mathrm E}+c
    \end{aligned}`,
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
