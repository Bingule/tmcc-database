import { useEffect, useMemo, useState } from "react";
import { Formula } from "./Formula";
import {
  filterMaterialsByElementSet,
  formatPropertyValue,
  getDftEnergyPerFormulaUnitLabel,
  getIntercalantLabel,
  getLatticeSettingLabel,
  getPhononStabilityLabel,
  getStructureTypeLabel,
  getSitesPerCellLabel,
  getSubclassLabel,
  getSpaceGroupLabel,
  getSpaceGroupSymbol
} from "../lib/materials";
import type { MaterialRecord } from "../lib/types";

type Props = {
  materials: MaterialRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  elementSearch: {
    elements: string[];
    mode: "only" | "at_least";
  };
};

const MAX_VISIBLE_ELEMENT_SEARCH_RESULTS = 1000;

export function MaterialExplorer({ materials, selectedId, onSelect, elementSearch }: Props) {
  const [query, setQuery] = useState("");
  const [metal, setMetal] = useState("all");
  const [chalcogen, setChalcogen] = useState("all");
  const [anion, setAnion] = useState("all");
  const [subclass, setSubclass] = useState("all");
  const [structureType, setStructureType] = useState("all");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);
  const metals = [...new Set(materials.map((material) => material.host.metal))];
  const chalcogens = [...new Set(materials.map((material) => material.host.chalcogen))];
  const anions = [...new Set(materials.map((material) => material.host.anion))];
  const subclasses = [...new Set(materials.map((material) => getSubclassLabel(material)))];
  const structureTypes = [...new Set(materials.map((material) => getStructureTypeLabel(material)))];

  const filtered = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    const elementFiltered = filterMaterialsByElementSet(materials, elementSearch.elements, elementSearch.mode);
    return elementFiltered.filter((material) => {
      const matchesQuery =
        material.material_id.toLowerCase().includes(normalizedQuery) ||
        material.slug.toLowerCase().includes(normalizedQuery) ||
        material.formula.toLowerCase().includes(normalizedQuery) ||
        getSubclassLabel(material).toLowerCase().includes(normalizedQuery) ||
        getStructureTypeLabel(material).toLowerCase().includes(normalizedQuery) ||
        (material.intercalation?.intercalant ?? "").toLowerCase().includes(normalizedQuery) ||
        String(getSpaceGroupSymbol(material) ?? "").toLowerCase().includes(normalizedQuery);
      return (
        matchesQuery &&
        (metal === "all" || material.host.metal === metal) &&
        (chalcogen === "all" || material.host.chalcogen === chalcogen) &&
        (anion === "all" || material.host.anion === anion) &&
        (subclass === "all" || getSubclassLabel(material) === subclass) &&
        (structureType === "all" || getStructureTypeLabel(material) === structureType)
      );
    });
  }, [query, metal, chalcogen, anion, subclass, structureType, materials, elementSearch]);
  useEffect(() => {
    setPage(1);
  }, [query, metal, chalcogen, anion, subclass, structureType, pageSize, elementSearch.elements, elementSearch.mode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, filtered.length);
  const hasTooManyElementMatches =
    elementSearch.elements.length > 0 && filtered.length > MAX_VISIBLE_ELEMENT_SEARCH_RESULTS;
  const visibleMaterials = hasTooManyElementMatches ? [] : filtered.slice(pageStart, pageEnd);

  return (
    <section id="explorer" className="explorer">
      <div className="section-heading">
        <p className="eyebrow">Materials Explorer</p>
        <h2>Search and filter structures</h2>
      </div>
      {elementSearch.elements.length > 0 && (
        <div className="active-element-query">
          <span>Element query</span>
          <strong>{elementSearch.elements.join("-")}</strong>
          <small>{elementSearch.mode === "only" ? "Only these elements" : "At least these elements"}</small>
        </div>
      )}
      <div className="filters">
        <label>
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="TMCC-0001, Nb2S2C, P-3m1" />
        </label>
        <Filter label="Host metal" value={metal} values={metals} onChange={setMetal} />
        <Filter label="Chalcogen" value={chalcogen} values={chalcogens} onChange={setChalcogen} />
        <Filter label="A-site" value={anion} values={anions} onChange={setAnion} />
        <Filter label="Subclass" value={subclass} values={subclasses} onChange={setSubclass} />
        <Filter label="Structure type" value={structureType} values={structureTypes} onChange={setStructureType} />
      </div>
      {hasTooManyElementMatches ? (
        <div className="result-limit-warning" role="status">
          <strong>More than 1000 matching materials</strong>
          <span>Please add more elements or filters to make the search more specific.</span>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="materials-table">
              <thead>
                <tr>
                  <th>Material ID</th>
                  <th>Formula</th>
                  <th>Structure Type</th>
                  <th>Subclass</th>
                  <th>Space Group</th>
                  <th>Intercalant</th>
                  <th>Sites/cell</th>
                  <ColumnHeader label="DFT Energy" unit="eV/formula" />
                  <ColumnHeader label="Energy Above Hull" unit="eV/atom" />
                  <th>Phonon</th>
                  <ColumnHeader label="Band Gap" unit="eV" />
                </tr>
              </thead>
              <tbody>
                {visibleMaterials.map((material) => (
                  <tr
                    key={material.material_id}
                    className={material.material_id === selectedId ? "selected-row" : ""}
                    onClick={() => onSelect(material.material_id)}
                  >
                    <td><button type="button" onClick={() => onSelect(material.material_id)}>{material.material_id}</button></td>
                    <td><Formula formula={material.formula} /></td>
                    <td>
                      <span className="cell-stack">
                        <span>{formatPropertyValue(material.structure.crystal_system)}</span>
                        {getLatticeSettingLabel(material) && <small>{formatCompactLatticeSetting(getLatticeSettingLabel(material))}</small>}
                      </span>
                    </td>
                    <td>{getSubclassLabel(material)}</td>
                    <td>{getSpaceGroupLabel(getSpaceGroupSymbol(material))}</td>
                    <td>{getIntercalantLabel(material)}</td>
                    <td>{getSitesPerCellLabel(material)}</td>
                    <td>{getDftEnergyPerFormulaUnitLabel(material)}</td>
                    <td>{formatPropertyValue(material.thermodynamics.energy_above_hull)}</td>
                    <td>{getPhononStabilityLabel(material)}</td>
                    <td>{formatPropertyValue(material.electronic.band_gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination-bar" aria-label="Materials table pagination">
            <div className="page-size-controls">
              <span>Rows per page</span>
              {[5, 10, 20, 50].map((size) => (
                <button
                  key={size}
                  type="button"
                  className={pageSize === size ? "active" : ""}
                  onClick={() => setPageSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
            <span className="page-summary">
              {filtered.length === 0 ? "0 of 0" : `${pageStart + 1}-${pageEnd} of ${filtered.length}`}
            </span>
            <div className="page-nav">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
                Previous
              </button>
              <span>{currentPage} / {totalPages}</span>
              <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages}>
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function formatCompactLatticeSetting(value: string | null) {
  return value?.replace(/\s*\(.+\)$/, "") ?? null;
}

function ColumnHeader({ label, unit }: { label: string; unit: string }) {
  return (
    <th>
      <span>{label}</span>
      <small className="column-unit">{unit}</small>
    </th>
  );
}

function Filter({
  label,
  value,
  values,
  onChange
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}
