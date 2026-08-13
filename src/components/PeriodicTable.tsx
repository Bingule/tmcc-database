import { useState } from "react";
import { materialStatuses, periodicTableElements, transitionMetals } from "../lib/statuses";
import type { MaterialRecord } from "../lib/types";

type Props = {
  materials: MaterialRecord[];
  onMetalSelect: (metal: string) => void;
  onElementSearch: (elements: string[], mode: "only" | "at_least") => void;
};

export function PeriodicTable({ materials, onMetalSelect, onElementSearch }: Props) {
  const activeMetals = new Set(materials.map((material) => material.host.metal));
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [mode, setMode] = useState<"only" | "at_least">("only");
  const formulaQuery = selectedElements.join("-");

  function toggleElement(symbol: string) {
    setSelectedElements((current) =>
      current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]
    );
  }

  function clearSelection() {
    setSelectedElements([]);
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
        <div className="element-query">
          <span>Materials</span>
          <strong>{formulaQuery || "Select elements"}</strong>
        </div>
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
            >
              <small>{element.atomicNumber}</small>
              <strong>{element.symbol}</strong>
              <span>{isSelected ? "selected" : hasRecord ? "record" : isHostEligible ? "host M" : element.category.replaceAll("_", " ")}</span>
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
