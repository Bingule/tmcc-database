import { useState, type FormEvent } from "react";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { calculateMolarMass, FormulaError, type MolarMassResult } from "../lib/chemistry";
import { useI18n } from "../i18n/I18nProvider";

export function MolecularWeightPage() {
  const { t } = useI18n();
  const [formula, setFormula] = useState("");
  const [result, setResult] = useState<MolarMassResult | null>(null);
  const [error, setError] = useState<FormulaError | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setResult(calculateMolarMass(formula));
      setError(null);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof FormulaError ? caught : new FormulaError("invalidFormula"));
    }
  }

  return (
    <section className="tools-page calculator-page">
      <Breadcrumbs current={t("tools.molecularWeight.title")} />
      <h1>{t("tools.molecularWeight.title")}</h1>
      <form noValidate onSubmit={handleSubmit}>
        <label htmlFor="molecular-weight-formula">{t("molecularWeight.formula")}</label>
        <input
          id="molecular-weight-formula"
          name="formula"
          value={formula}
          onChange={(event) => setFormula(event.target.value)}
          aria-describedby="molecular-weight-error"
        />
        <button type="submit">{t("calculator.calculate")}</button>
      </form>
      <div id="molecular-weight-error" aria-live="polite">{error ? getFormulaError(error, t) : ""}</div>

      {result && (
        <section aria-labelledby="molecular-weight-result">
          <h2 id="molecular-weight-result">{t("molecularWeight.result")}</h2>
          <p><strong>{formatNumber(result.molarMass)} g/mol</strong></p>
          <div className="calculator-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t("molecularWeight.element")}</th>
                  <th scope="col">{t("molecularWeight.count")}</th>
                  <th scope="col">{t("molecularWeight.atomicWeight")}</th>
                  <th scope="col">{t("molecularWeight.massContribution")}</th>
                  <th scope="col">{t("molecularWeight.massPercent")}</th>
                </tr>
              </thead>
              <tbody>
                {result.elements.map((element) => (
                  <tr key={element.element}>
                    <th scope="row">{element.element}</th>
                    <td>{formatNumber(element.count)}</td>
                    <td>{formatNumber(element.atomicWeight)} g/mol</td>
                    <td>{formatNumber(element.mass)} g/mol</td>
                    <td>{formatNumber(element.massPercent)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

function getFormulaError(error: FormulaError, t: ReturnType<typeof useI18n>["t"]) {
  switch (error.code) {
    case "emptyFormula": return t("errors.required");
    case "unsupportedHydrate": return t("errors.unsupportedHydrate");
    case "unknownElement": return t("errors.unknownElement", { element: error.detail ?? "" });
    case "invalidFormula": return t("errors.invalidFormula");
  }
}

function formatNumber(value: number) {
  return value.toFixed(3).replace(/\.000$/, "");
}
