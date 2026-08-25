import { useMemo, useState } from "react";
import { materialStatuses, periodicTableElements, transitionMetals } from "../lib/statuses";
import type { MaterialRecord } from "../lib/types";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../locales/en";

type Props = {
  materials: MaterialRecord[];
  onMetalSelect: (metal: string) => void;
  onElementSearch: (elements: string[], mode: "only" | "at_least") => void;
};

export function PeriodicTable({ materials, onMetalSelect, onElementSearch }: Props) {
  const { t } = useI18n();
  const activeMetals = new Set(materials.map((material) => material.host.metal));
  const [elementQuery, setElementQuery] = useState("");
  const [mode, setMode] = useState<"only" | "at_least">("only");
  const selectedElements = useMemo(() => parseElementQuery(elementQuery), [elementQuery]);
  const formulaQuery = selectedElements.join("-");

  function toggleElement(symbol: string) {
    const next = selectedElements.includes(symbol)
      ? selectedElements.filter((item) => item !== symbol)
      : [...selectedElements, symbol];
    setElementQuery(next.join("-"));
  }

  function clearSelection() {
    setElementQuery("");
    onElementSearch([], mode);
  }

  return (
    <section id="periodic-table" className="periodic-section">
      <div className="section-heading">
        <p className="eyebrow">{t("periodic.interactive")}</p>
        <h2>{t("periodic.elementPeriodicTable")}</h2>
      </div>
      <p className="periodic-note">
        {t("periodic.note")}
      </p>
      <div className="element-search-bar" aria-label={t("periodic.elementSearch")}>
        <label className="element-query">
          <span>{t("periodic.materials")}</span>
          <input
            value={elementQuery}
            onChange={(event) => setElementQuery(event.target.value)}
            placeholder={t("periodic.placeholder")}
            aria-label={t("periodic.selectedElements")}
          />
          {formulaQuery && <small>{t("periodic.parsed", { elements: formulaQuery })}</small>}
        </label>
        <div className="segmented compact" aria-label={t("periodic.searchMode")}>
          <button className={mode === "only" ? "active" : ""} onClick={() => setMode("only")}>
            {t("periodic.onlyElements")}
          </button>
          <button className={mode === "at_least" ? "active" : ""} onClick={() => setMode("at_least")}>
            {t("periodic.atLeastElements")}
          </button>
        </div>
        <button className="primary-button" type="button" onClick={() => onElementSearch(selectedElements, mode)}>
          {t("periodic.search")}
        </button>
        <button className="secondary-button" type="button" onClick={clearSelection} disabled={selectedElements.length === 0}>
          {t("periodic.clearShort")}
        </button>
      </div>
      <div className="periodic-table" role="list">
        <div className="periodic-composition-guide" aria-label={t("periodic.compositionGuide")}>
          <div>
            <span className="guide-marker guide-host" />
            <strong>{t("periodic.host")}</strong>
            <small>{t("periodic.transitionMetal")}</small>
          </div>
          <div>
            <span className="guide-marker guide-chalcogen" />
            <strong>{t("periodic.layer")}</strong>
            <small>S / Se / Te</small>
          </div>
          <div>
            <span className="guide-marker guide-light" />
            <strong>{t("periodic.center")}</strong>
            <small>C / N</small>
          </div>
          <div>
            <span className="guide-marker guide-intercalant" />
            <strong>{t("periodic.intercalant")}</strong>
            <small>{t("periodic.betweenLayers")}</small>
          </div>
          <ul>
            <li>
              <strong>{t("periodic.vdwTmcdc")}</strong>
              <span>M2X2A - P-3m1 / R-3m</span>
            </li>
            <li>
              <strong>{t("home.intercalated")}</strong>
              <span>{t("periodic.intercalatedDescription")}</span>
            </li>
            <li>
              <strong>TMCC</strong>
              <span>M2XA - P63/mmc</span>
            </li>
          </ul>
        </div>
        {periodicTableElements.map((element) => {
          const isHostEligible = transitionMetals.includes(element.symbol);
          const hasRecord = activeMetals.has(element.symbol);
          const isSelected = selectedElements.includes(element.symbol);
          const status = hasRecord ? materialStatuses.not_calculated : materialStatuses.not_calculated;
          return (
            <button
              key={element.symbol}
              type="button"
              className={[
                "element",
                `category-${element.category}`,
                isHostEligible ? "host-eligible" : "context-only",
                hasRecord ? "available" : "",
                isSelected ? "selected" : ""
              ].join(" ")}
              style={
                {
                  "--status-bg": status.background,
                  "--status-color": status.color,
                  gridColumn: element.group,
                  gridRow: element.period
                } as React.CSSProperties
              }
              onClick={() => {
                toggleElement(element.symbol);
                if (hasRecord) onMetalSelect(element.symbol);
              }}
              aria-pressed={isSelected}
              aria-label={`${element.name} (${element.symbol}): ${hasRecord ? t("periodic.recordAvailable") : isHostEligible ? t("periodic.hostCandidateShort") + ", " + t("status.notCalculated") : t("periodic.compositionSearch")}`}
              title={`${element.name} (${element.symbol}) - ${hasRecord ? t("periodic.recordAvailable") : isHostEligible ? t("periodic.hostCandidateShort") : t("periodic.compositionSearch")}`}
            >
              <small>{element.atomicNumber}</small>
              <strong>{element.symbol}</strong>
              <span aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="legend">
        {Object.entries(materialStatuses).map(([key, status]) => (
          <span key={key}>
            <i style={{ background: status.background, borderColor: status.color }} />
            {t(statusTranslationKeys[key as keyof typeof materialStatuses])}
          </span>
        ))}
      </div>
    </section>
  );
}

const statusTranslationKeys: Record<keyof typeof materialStatuses, TranslationKey> = {
  experimental: "status.experimentallySynthesized",
  predicted_stable: "status.computationallyPredicted",
  metastable: "status.metastable",
  unstable: "status.unstable",
  calculation_in_progress: "status.inProgress",
  not_calculated: "status.notCalculated"
};

export function parseElementQuery(query: string) {
  const symbols = new Set(periodicTableElements.map((element) => element.symbol));
  const trimmed = query.trim();
  if (!trimmed) return [];

  const separated = /[\s,;+\-/]/.test(trimmed);
  const tokens = separated
    ? trimmed.split(/[\s,;+\-/]+/)
    : trimmed.match(/[A-Z][a-z]?/g) ?? [trimmed];
  const parsed: string[] = [];

  for (const token of tokens) {
    const alpha = token.replace(/[^a-zA-Z]/g, "");
    if (!alpha) continue;
    const normalized = alpha.charAt(0).toUpperCase() + alpha.slice(1).toLowerCase();
    if (symbols.has(normalized) && !parsed.includes(normalized)) {
      parsed.push(normalized);
    }
  }

  return parsed;
}
