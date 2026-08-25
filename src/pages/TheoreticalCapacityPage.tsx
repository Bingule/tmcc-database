import { useState, type FormEvent } from "react";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { useI18n } from "../i18n/I18nProvider";
import { FARADAY_CONSTANT, calculateTheoreticalCapacity } from "../lib/capacity";
import { calculateMolarMass, FormulaError } from "../lib/chemistry";

type CapacityResult = {
  formula: string;
  molarMass: number;
  electrons: number;
  capacity: number;
};

type PageError = {
  code: FormulaError["code"] | "positiveFiniteNumber" | "invalidCapacity";
  detail?: string;
};

export function TheoreticalCapacityPage() {
  const { t } = useI18n();
  const [formula, setFormula] = useState("");
  const [electrons, setElectrons] = useState("");
  const [result, setResult] = useState<CapacityResult | null>(null);
  const [error, setError] = useState<PageError | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedFormula = formula.trim();
    let molarMass: number;
    try {
      molarMass = calculateMolarMass(normalizedFormula).molarMass;
    } catch (caught) {
      setResult(null);
      setError(caught instanceof FormulaError ? caught : { code: "invalidFormula" });
      return;
    }

    const electronCount = Number(electrons);
    if (!Number.isFinite(electronCount) || electronCount <= 0) {
      setResult(null);
      setError({ code: "positiveFiniteNumber" });
      return;
    }

    let capacity: number;
    try {
      capacity = calculateTheoreticalCapacity(molarMass, electronCount);
    } catch {
      setResult(null);
      setError({ code: "invalidCapacity" });
      return;
    }

    setResult({ formula: normalizedFormula, molarMass, electrons: electronCount, capacity });
    setError(null);
  }

  return (
    <section className="tools-page calculator-page">
      <Breadcrumbs current={t("tools.capacity.title")} />
      <header className="tool-page-header">
        <h1>{t("tools.capacity.title")}</h1>
      </header>
      <div className="tool-layout">
        <div className="tool-panel">
          <form className="tool-form" noValidate onSubmit={handleSubmit}>
            <label htmlFor="capacity-formula">{t("capacity.formula")}</label>
            <input
              id="capacity-formula"
              name="formula"
              value={formula}
              onChange={(event) => setFormula(event.target.value)}
              aria-describedby="capacity-formula-help capacity-error"
            />
            <small id="capacity-formula-help">{t("capacity.formulaHelp")}</small>
            <label htmlFor="capacity-electrons">{t("capacity.electrons")}</label>
            <input
              id="capacity-electrons"
              name="electrons"
              inputMode="decimal"
              value={electrons}
              onChange={(event) => setElectrons(event.target.value)}
              aria-describedby="capacity-error"
            />
            <button type="submit">{t("calculator.calculate")}</button>
          </form>
          <div className="tool-validation" id="capacity-error" aria-live="polite">{error ? getErrorMessage(error, t) : ""}</div>
        </div>

        {result && (
          <section className="tool-panel" aria-labelledby="capacity-result">
            <h2 id="capacity-result">{t("capacity.result")}</h2>
            <p><strong>{t("capacity.formulaResult", { formula: result.formula })}</strong></p>
            <p>{t("capacity.equationExplanation")}</p>
            <ul>
              <li>{t("capacity.faradayDefinition", { faraday: Math.round(FARADAY_CONSTANT) })}</li>
              <li>{t("capacity.molarMassDefinition")}</li>
              <li>{t("capacity.electronNumberDefinition")}</li>
            </ul>
            <div className="tool-result-table">
              <table>
                <tbody>
                  <tr><th scope="row">M</th><td>{formatNumber(result.molarMass)} g/mol</td></tr>
                  <tr><th scope="row">n</th><td>{formatNumber(result.electrons)}</td></tr>
                  <tr><th scope="row">Q</th><td>{formatNumber(result.capacity)} mAh g−1</td></tr>
                </tbody>
              </table>
            </div>
            <p>{t("capacity.substitution", {
              n: formatNumber(result.electrons),
              faraday: FARADAY_CONSTANT,
              molarMass: formatNumber(result.molarMass),
              capacity: formatNumber(result.capacity)
            })}</p>
          </section>
        )}
      </div>
    </section>
  );
}

export default TheoreticalCapacityPage;

function getErrorMessage(error: PageError, t: ReturnType<typeof useI18n>["t"]) {
  switch (error.code) {
    case "emptyFormula": return t("errors.required");
    case "unsupportedHydrate": return t("errors.unsupportedHydrate");
    case "unknownElement": return t("errors.unknownElement", { element: error.detail ?? "" });
    case "invalidFormula": return t("errors.invalidFormula");
    case "positiveFiniteNumber": return t("errors.positiveFiniteNumber");
    case "invalidCapacity": return t("errors.invalidCapacity");
  }
}

function formatNumber(value: number) {
  if (value !== 0 && Math.abs(value) < 0.001) return value.toExponential(3);
  return value.toFixed(3).replace(/\.000$/, "");
}
