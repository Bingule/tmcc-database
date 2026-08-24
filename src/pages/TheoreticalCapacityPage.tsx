import { useState, type FormEvent } from "react";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { useI18n } from "../i18n/I18nProvider";
import { FARADAY_CONSTANT, calculateTheoreticalCapacity } from "../lib/capacity";
import { calculateMolarMass, FormulaError } from "../lib/chemistry";

type CapacityResult = {
  molarMass: number;
  electrons: number;
  capacity: number;
};

type PageError = {
  code: FormulaError["code"] | "positiveFiniteNumber";
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
    let molarMass: number;
    try {
      molarMass = calculateMolarMass(formula).molarMass;
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

    setResult({
      molarMass,
      electrons: electronCount,
      capacity: calculateTheoreticalCapacity(molarMass, electronCount)
    });
    setError(null);
  }

  return (
    <section className="tools-page calculator-page">
      <Breadcrumbs current={t("tools.capacity.title")} />
      <h1>{t("tools.capacity.title")}</h1>
      <form noValidate onSubmit={handleSubmit}>
        <label htmlFor="capacity-formula">{t("capacity.formula")}</label>
        <input
          id="capacity-formula"
          name="formula"
          value={formula}
          onChange={(event) => setFormula(event.target.value)}
          aria-describedby="capacity-error"
        />
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
      <div id="capacity-error" aria-live="polite">{error ? getErrorMessage(error, t) : ""}</div>

      {result && (
        <section aria-labelledby="capacity-result">
          <h2 id="capacity-result">{t("capacity.result")}</h2>
          <p>Q = nF/(3.6M)</p>
          <dl>
            <dt>M</dt>
            <dd>{formatNumber(result.molarMass)} g/mol</dd>
            <dt>n</dt>
            <dd>{formatNumber(result.electrons)}</dd>
            <dt>Q</dt>
            <dd>{formatNumber(result.capacity)} mAh/g</dd>
          </dl>
          <p>Q = ({formatNumber(result.electrons)} × {FARADAY_CONSTANT}) / (3.6 × {formatNumber(result.molarMass)}) = {formatNumber(result.capacity)} mAh/g</p>
        </section>
      )}
    </section>
  );
}

function getErrorMessage(error: PageError, t: ReturnType<typeof useI18n>["t"]) {
  switch (error.code) {
    case "emptyFormula": return t("errors.required");
    case "unsupportedHydrate": return t("errors.unsupportedHydrate");
    case "unknownElement": return t("errors.unknownElement", { element: error.detail ?? "" });
    case "invalidFormula": return t("errors.invalidFormula");
    case "positiveFiniteNumber": return t("errors.positiveFiniteNumber");
  }
}

function formatNumber(value: number) {
  return value.toFixed(3).replace(/\.000$/, "");
}
