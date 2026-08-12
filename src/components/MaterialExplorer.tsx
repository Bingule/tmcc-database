import { useEffect, useMemo, useState } from "react";
import { Formula } from "./Formula";
import {
  filterMaterialsByElementSet,
  formatPropertyValue,
  getDftEnergyPerFormulaUnitLabel,
  getSitesPerCellLabel,
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

export function MaterialExplorer({ materials, selectedId, onSelect, elementSearch }: Props) {
  const [query, setQuery] = useState("");
  const [metal, setMetal] = useState("all");
  const [chalcogen, setChalcogen] = useState("all");
  const [anion, setAnion] = useState("all");
  const [type, setType] = useState("all");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);
  const metals = [...new Set(materials.map((material) => material.host.metal))];
  const chalcogens = [...new Set(materials.map((material) => material.host.chalcogen))];
  const anions = [...new Set(materials.map((material) => material.host.anion))];

  const filtered = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    const elementFiltered = filterMaterialsByElementSet(materials, elementSearch.elements, elementSearch.mode);
    return elementFiltered.filter((material) => {
      const matchesQuery =
        material.material_id.toLowerCase().includes(normalizedQuery) ||
        material.slug.toLowerCase().includes(normalizedQuery) ||
        material.formula.toLowerCase().includes(normalizedQuery) ||
        String(getSpaceGroupSymbol(material) ?? "").toLowerCase().includes(normalizedQuery);
      return (
        matchesQuery &&
        (metal === "all" || material.host.metal === metal) &&
        (chalcogen === "all" || material.host.chalcogen === chalcogen) &&
        (anion === "all" || material.host.anion === anion) &&
        (type === "all" || material.material_type === type)
      );
    });
  }, [query, metal, chalcogen, anion, type, materials, elementSearch]);
  useEffect(() => {
    setPage(1);
  }, [query, metal, chalcogen, anion, type, pageSize, elementSearch.elements, elementSearch.mode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, filtered.length);
  const visibleMaterials = filtered.slice(pageStart, pageEnd);

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
        <Filter label="Type" value={type} values={["pristine", "tm_intercalated", "m2xa"]} onChange={setType} />
      </div>
      <div className="table-wrap">
        <table className="materials-table">
          <thead>
            <tr>
              <th>Material ID</th>
              <th>Formula</th>
              <th>Crystal System</th>
              <th>Space Group</th>
              <th>Intercalant</th>
              <th>Sites/cell</th>
              <ColumnHeader label="DFT Energy" unit="eV/f.u." />
              <ColumnHeader label="Formation Energy" unit="eV/formula" />
              <ColumnHeader label="Energy Above Hull" unit="eV/atom" />
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
                <td>{formatPropertyValue(material.structure.crystal_system)}</td>
                <td>{getSpaceGroupLabel(getSpaceGroupSymbol(material))}</td>
                <td>{material.intercalation?.intercalant ?? "-"}</td>
                <td>{getSitesPerCellLabel(material)}</td>
                <td>{getDftEnergyPerFormulaUnitLabel(material)}</td>
                <td>{formatPropertyValue(material.thermodynamics.formation_energy)}</td>
                <td>{formatPropertyValue(material.thermodynamics.energy_above_hull)}</td>
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
    </section>
  );
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
