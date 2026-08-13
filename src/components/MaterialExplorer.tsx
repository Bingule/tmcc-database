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
  categoryFilter?: ExplorerCategoryFilter;
  onCategoryFilterChange?: (filter: ExplorerCategoryFilter) => void;
  onResultCountChange?: (count: number) => void;
};

const MAX_VISIBLE_ELEMENT_SEARCH_RESULTS = 1000;
export type ExplorerCategoryFilter = "tmcdc" | "intercalated" | "tmcc" | null;
type SortKey =
  | "material_id"
  | "formula"
  | "structure_type"
  | "subclass"
  | "space_group"
  | "intercalant"
  | "sites"
  | "dft_energy"
  | "energy_above_hull"
  | "phonon"
  | "band_gap";
type SortDirection = "asc" | "desc";

export function MaterialExplorer({
  materials,
  selectedId,
  onSelect,
  elementSearch,
  categoryFilter = null,
  onCategoryFilterChange = () => undefined,
  onResultCountChange = () => undefined
}: Props) {
  const [query, setQuery] = useState("");
  const [metal, setMetal] = useState("all");
  const [chalcogen, setChalcogen] = useState("all");
  const [anion, setAnion] = useState("all");
  const [subclass, setSubclass] = useState("all");
  const [structureType, setStructureType] = useState("all");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "material_id",
    direction: "asc"
  });
  const metals = [...new Set(materials.map((material) => material.host.metal))];
  const chalcogens = [...new Set(materials.map((material) => material.host.chalcogen))];
  const anions = [...new Set(materials.map((material) => material.host.anion))];
  const subclasses = [...new Set(materials.map((material) => getSubclassLabel(material)))];
  const structureTypes = [...new Set(materials.map((material) => getStructureTypeLabel(material)))];

  const filtered = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    const categoryFiltered = filterMaterialsByCategory(materials, categoryFilter);
    const elementFiltered = filterMaterialsByElementSet(categoryFiltered, elementSearch.elements, elementSearch.mode);
    const matchingMaterials = elementFiltered.filter((material) => {
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
    return [...matchingMaterials].sort((a, b) => compareMaterials(a, b, sort));
  }, [query, metal, chalcogen, anion, subclass, structureType, materials, elementSearch, sort, categoryFilter]);
  useEffect(() => {
    setPage(1);
  }, [query, metal, chalcogen, anion, subclass, structureType, pageSize, elementSearch.elements, elementSearch.mode, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, filtered.length);
  const hasTooManyElementMatches =
    elementSearch.elements.length > 0 && filtered.length > MAX_VISIBLE_ELEMENT_SEARCH_RESULTS;
  const visibleMaterials = hasTooManyElementMatches ? [] : filtered.slice(pageStart, pageEnd);
  useEffect(() => {
    onResultCountChange(filtered.length);
  }, [filtered.length, onResultCountChange]);

  const handleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const selectAndScrollToDetail = (materialId: string) => {
    onSelect(materialId);
    window.setTimeout(() => {
      document.getElementById("material-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

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
          <span>Category</span>
          <select
            value={categoryFilter ?? "all"}
            onChange={(event) => {
              const value = event.target.value;
              onCategoryFilterChange(value === "all" ? null : value as ExplorerCategoryFilter);
            }}
          >
            <option value="all">All</option>
            <option value="tmcdc">TMCDCs (M2X2C)</option>
            <option value="intercalated">Intercalated TMCC/TMCDC</option>
            <option value="tmcc">TMCCs (M2XC / M2XA)</option>
          </select>
        </label>
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
                  <SortHeader label="Material ID" sortKey="material_id" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="Formula" sortKey="formula" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="Structure Type" sortKey="structure_type" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="Subclass" sortKey="subclass" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="Space Group" sortKey="space_group" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="Intercalant" sortKey="intercalant" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="Sites/cell" sortKey="sites" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="DFT Energy" unit="eV/formula" sortKey="dft_energy" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="Energy Above Hull" unit="eV/atom" sortKey="energy_above_hull" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="Phonon" sortKey="phonon" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="Band Gap" unit="eV" sortKey="band_gap" activeSort={sort} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {visibleMaterials.map((material) => (
                  <tr
                    key={material.material_id}
                    className={material.material_id === selectedId ? "selected-row" : ""}
                    onClick={() => selectAndScrollToDetail(material.material_id)}
                  >
                    <td>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          selectAndScrollToDetail(material.material_id);
                        }}
                      >
                        {material.material_id}
                      </button>
                    </td>
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

function filterMaterialsByCategory(materials: MaterialRecord[], categoryFilter: ExplorerCategoryFilter) {
  if (!categoryFilter) return materials;

  return materials.filter((material) => {
    if (categoryFilter === "intercalated") {
      return material.material_type === "tm_intercalated";
    }

    if (categoryFilter === "tmcdc") {
      return getSubclassLabel(material) === "TMCDC" && material.material_type !== "tm_intercalated";
    }

    return getSubclassLabel(material) === "TMCC" && material.material_type !== "tm_intercalated";
  });
}

function getCategoryFilterLabel(categoryFilter: ExplorerCategoryFilter) {
  if (categoryFilter === "tmcdc") return "TMCDCs (M2X2C)";
  if (categoryFilter === "intercalated") return "Intercalated TMCC/TMCDC";
  if (categoryFilter === "tmcc") return "TMCCs (M2XC / M2XA)";
  return "";
}

function formatCompactLatticeSetting(value: string | null) {
  return value?.replace(/\s*\(.+\)$/, "") ?? null;
}

function compareMaterials(
  a: MaterialRecord,
  b: MaterialRecord,
  sort: { key: SortKey; direction: SortDirection }
) {
  const left = getSortValue(a, sort.key);
  const right = getSortValue(b, sort.key);
  const multiplier = sort.direction === "asc" ? 1 : -1;
  let result = 0;

  if (typeof left === "number" || typeof right === "number") {
    const leftNumber = typeof left === "number" ? left : Number.POSITIVE_INFINITY;
    const rightNumber = typeof right === "number" ? right : Number.POSITIVE_INFINITY;
    result = leftNumber - rightNumber;
  } else {
    result = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  }

  if (result === 0 && sort.key !== "material_id") {
    result = a.material_id.localeCompare(b.material_id, undefined, { numeric: true, sensitivity: "base" });
  }

  return result * multiplier;
}

function getSortValue(material: MaterialRecord, key: SortKey): string | number {
  switch (key) {
    case "material_id":
      return material.material_id;
    case "formula":
      return material.formula;
    case "structure_type":
      return formatPropertyValue(material.structure.crystal_system);
    case "subclass":
      return getSubclassLabel(material);
    case "space_group":
      return String(getSpaceGroupSymbol(material) ?? "");
    case "intercalant":
      return getIntercalantLabel(material);
    case "sites":
      return numericOrInfinity(getSitesPerCellLabel(material));
    case "dft_energy":
      return numericOrInfinity(getDftEnergyPerFormulaUnitLabel(material));
    case "energy_above_hull":
      return numericOrInfinity(formatPropertyValue(material.thermodynamics.energy_above_hull));
    case "phonon":
      return getPhononStabilityLabel(material);
    case "band_gap":
      return numericOrInfinity(formatPropertyValue(material.electronic.band_gap));
    default:
      return "";
  }
}

function numericOrInfinity(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function SortHeader({
  label,
  unit,
  sortKey,
  activeSort,
  onSort
}: {
  label: string;
  unit?: string;
  sortKey: SortKey;
  activeSort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeSort.key === sortKey;
  const directionLabel = activeSort.direction === "asc" ? "ascending" : "descending";
  return (
    <th aria-sort={isActive ? directionLabel : "none"}>
      <button type="button" className="sort-header-button" onClick={() => onSort(sortKey)}>
        <span className="column-heading-text">
          <span>{label}</span>
          {unit && <small className="column-unit">{unit}</small>}
        </span>
        <span
          className={`sort-indicator ${isActive ? "active" : ""} ${activeSort.direction}`}
          aria-hidden="true"
        />
      </button>
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
