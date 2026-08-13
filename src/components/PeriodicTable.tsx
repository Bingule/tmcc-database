import { useMemo, useState } from "react";
import { materialStatuses, periodicTableElements, transitionMetals } from "../lib/statuses";
import type { MaterialRecord } from "../lib/types";

type Props = {
  materials: MaterialRecord[];
  onMetalSelect: (metal: string) => void;
  onElementSearch: (elements: string[], mode: "only" | "at_least") => void;
};

export function PeriodicTable({ materials, onMetalSelect, onElementSearch }: Props) {
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
        <p className="eyebrow">Interactive periodic table</p>
        <h2>Element periodic table</h2>
      </div>
      <p className="periodic-note">
        Select elements such as Nb, S, and C, then search matching TMCC/TMCDC records. Transition metals remain
        eligible host M candidates, while C/N and S/Se/Te are used as composition elements.
      </p>
      <div className="element-search-bar" aria-label="Element search">
        <label className="element-query">
          <span>Materials</span>
          <input
            value={elementQuery}
            onChange={(event) => setElementQuery(event.target.value)}
            placeholder="Select elements or type Nb-S-C"
            aria-label="Selected elements"
          />
          {formulaQuery && <small>Parsed: {formulaQuery}</small>}
        </label>
        <div className="segmented compact" aria-label="Element search mode">
          <button className={mode === "only" ? "active" : ""} onClick={() => setMode("only")}>
            Only Elements
          </button>
          <button className={mode === "at_least" ? "active" : ""} onClick={() => setMode("at_least")}>
            At Least Elements
          </button>
        </div>
        <button className="primary-button" type="button" onClick={() => onElementSearch(selectedElements, mode)}>
          Search
        </button>
        <button className="secondary-button" type="button" onClick={clearSelection} disabled={selectedElements.length === 0}>
          Clear
        </button>
      </div>
      <div className="periodic-table" role="list">
        <div className="periodic-composition-guide" aria-label="TMCC composition guide">
          <div>
            <span className="guide-marker guide-host" />
            <strong>M host</strong>
            <small>transition metal</small>
          </div>
          <div>
            <span className="guide-marker guide-chalcogen" />
            <strong>X layer</strong>
            <small>S / Se / Te</small>
          </div>
          <div>
            <span className="guide-marker guide-light" />
            <strong>A center</strong>
            <small>C / N</small>
          </div>
          <div>
            <span className="guide-marker guide-intercalant" />
            <strong>M' intercalant</strong>
            <small>metal between layers</small>
          </div>
          <ul>
            <li>
              <strong>vdW TMCDC</strong>
              <span>M2X2A · P-3m1 / R-3m</span>
            </li>
            <li>
              <strong>Intercalated vdW TMCDC</strong>
              <span>M'M2X2A · P/R variants</span>
            </li>
            <li>
              <strong>TMCC</strong>
              <span>M2XA · P63/mmc</span>
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
              aria-label={`${element.name} (${element.symbol}): ${hasRecord ? "record available" : isHostEligible ? "host candidate, not calculated" : "composition search element"}`}
              title={`${element.name} (${element.symbol}) - ${hasRecord ? "record available" : isHostEligible ? "host candidate" : element.category.replaceAll("_", " ")}`}
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
            {status.label}
          </span>
        ))}
      </div>
    </section>
  );
}

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
