import { useI18n } from "../../../i18n/I18nProvider";
import type { RateModelParameterType } from "../models/types";
import { ScientificMath, ScientificSymbol, ScientificUnit } from "./ScientificTypography";

export interface RateTheoryParameter {
  readonly symbol: string;
  readonly name: string;
  readonly meaning: string;
  readonly unit: string;
  readonly type: RateModelParameterType;
}

export interface RateTheoryContent {
  readonly title: string;
  readonly equation: string;
  readonly equationTex?: string;
  readonly equationDescription: string;
  readonly parameters: ReadonlyArray<Readonly<RateTheoryParameter>>;
  readonly physicalMeaning: string;
  readonly limitingBehavior: string;
  readonly applicability: string;
  readonly assumptions: ReadonlyArray<string>;
  readonly limitations: ReadonlyArray<string>;
  readonly citationGuidance: string;
}

export function ModelTheoryPanel({ content }: { content: Readonly<RateTheoryContent> }) {
  const { t } = useI18n();
  return <section className="tool-section rate-theory-panel">
    <h2>{t("rate.theory.title")}: {content.title}</h2>
    <h3>{t("rate.theory.equation")}</h3>
    <ScientificMath
      className="rate-equation"
      tex={content.equationTex ?? String.raw`\text{${content.equation.replace(/[{}\\]/g, "")}}`}
      source={content.equation}
      label={content.equationDescription}
      display
    />
    <h3>{t("rate.theory.parameters")}</h3>
    <div className="tool-table-wrap">
      <table>
        <thead><tr>
          <th>{t("rate.theory.symbol")}</th>
          <th>{t("rate.theory.parameter")}</th>
          <th>{t("rate.theory.physicalMeaning")}</th>
          <th>{t("rate.theory.units")}</th>
          <th>{t("rate.theory.type")}</th>
        </tr></thead>
        <tbody>{content.parameters.map((parameter) => <tr key={parameter.symbol}>
          <td><ScientificSymbol value={parameter.symbol} /></td>
          <td>{parameter.name}</td>
          <td>{parameter.meaning}</td>
          <td><ScientificUnit value={parameter.unit} /></td>
          <td>{t(`rate.parameterType.${parameter.type}`)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <TheoryText heading={t("rate.theory.physicalMeaning")} value={content.physicalMeaning} />
    <TheoryText heading={t("rate.theory.limitingBehavior")} value={content.limitingBehavior} />
    <TheoryText heading={t("rate.theory.applicability")} value={content.applicability} />
    <TheoryList heading={t("rate.theory.assumptions")} values={content.assumptions} />
    <TheoryList heading={t("rate.theory.limitations")} values={content.limitations} />
    <TheoryText heading={t("rate.theory.citation")} value={content.citationGuidance} />
  </section>;
}

function TheoryText({ heading, value }: { heading: string; value: string }) {
  return <section className="rate-theory-section"><h3>{heading}</h3><p>{value}</p></section>;
}

function TheoryList({ heading, values }: { heading: string; values: ReadonlyArray<string> }) {
  return <section className="rate-theory-section"><h3>{heading}</h3><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></section>;
}
