import { useEffect, useMemo, useState } from "react";
import { Formula } from "./Formula";
import {
  filterMaterialsByElementSet,
  formatPropertyValue,
  getDftEnergyPerFormulaUnitLabel,
  getFormationEnergyPerAtomLabel,
  getIntercalantLabel,
  getLatticeSettingLabel,
  getMechanicalStabilityLabel,
  getPhononStabilityLabel,
  getStructureTypeLabel,
  getSitesPerCellLabel,
  getSubclassLabel,
  getSpaceGroupLabel,
  getSpaceGroupSymbol
} from "../lib/materials";
import type { MaterialRecord } from "../lib/types";
import { useI18n } from "../i18n/I18nProvider";
import { getCrystalSystemTranslationKey } from "../i18n/displayLabels";

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
  | "formation_energy"
  | "mechanical_stability"
  | "phonon_stability"
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
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [metal, setMetal] = useState("all");
  const [chalcogen, setChalcogen] = useState("all");
  const [anion, setAnion] = useState("all");
  const [subclass, setSubclass] = useState("all");
  const [structureType, setStructureType] = useState("all");
  const [mechanicallyStableOnly, setMechanicallyStableOnly] = useState(false);
  const [dynamicallyStableOnly, setDynamicallyStableOnly] = useState(false);
  const [pageSize, setPageSize] = useState(10);
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
        (structureType === "all" || getStructureTypeLabel(material) === structureType) &&
        (!mechanicallyStableOnly || material.mechanical?.mechanically_stable === true) &&
        (!dynamicallyStableOnly || material.phonons?.dynamically_stable === true)
      );
    });
    return [...matchingMaterials].sort((a, b) => compareMaterials(a, b, sort));
  }, [query, metal, chalcogen, anion, subclass, structureType, mechanicallyStableOnly, dynamicallyStableOnly, materials, elementSearch, sort, categoryFilter]);
  useEffect(() => {
    setPage(1);
  }, [query, metal, chalcogen, anion, subclass, structureType, mechanicallyStableOnly, dynamicallyStableOnly, pageSize, elementSearch.elements, elementSearch.mode, categoryFilter]);

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
        <p className="eyebrow">{t("explorer.eyebrow")}</p>
        <h2>{t("explorer.title")}</h2>
      </div>
      {elementSearch.elements.length > 0 && (
        <div className="active-element-query">
          <span>{t("explorer.elementQuery")}</span>
          <strong>{elementSearch.elements.join("-")}</strong>
          <small>{elementSearch.mode === "only" ? t("periodic.onlyThese") : t("periodic.atLeastThese")}</small>
        </div>
      )}
      <div className="filters">
        <label>
          <span>{t("explorer.category")}</span>
          <select
            value={categoryFilter ?? "all"}
            onChange={(event) => {
              const value = event.target.value;
              onCategoryFilterChange(value === "all" ? null : value as ExplorerCategoryFilter);
            }}
          >
            <option value="all">{t("explorer.all")}</option>
            <option value="tmcdc">{t("explorer.tmcdcs")}</option>
            <option value="intercalated">{t("explorer.intercalated")}</option>
            <option value="tmcc">{t("explorer.tmccs")}</option>
          </select>
        </label>
        <label>
          <span>{t("explorer.search")}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="TMCC-0001, Nb2S2C, P-3m1" />
        </label>
        <Filter label={t("explorer.hostMetal")} value={metal} values={metals} onChange={setMetal} />
        <Filter label={t("explorer.chalcogen")} value={chalcogen} values={chalcogens} onChange={setChalcogen} />
        <Filter label={t("explorer.anion")} value={anion} values={anions} onChange={setAnion} />
        <Filter label={t("explorer.subclass")} value={subclass} values={subclasses} onChange={setSubclass} />
        <Filter label={t("explorer.structureType")} value={structureType} values={structureTypes} onChange={setStructureType} />
        <div className="stability-filter-group" role="group" aria-label={t("explorer.stabilityFilters")}>
          <label className="stability-checkbox">
            <input
              name="mechanically-stable-only"
              type="checkbox"
              checked={mechanicallyStableOnly}
              onChange={(event) => setMechanicallyStableOnly(event.target.checked)}
            />
            <span>{t("explorer.mechanicallyStableOnly")}</span>
          </label>
          <label className="stability-checkbox">
            <input
              name="dynamically-stable-only"
              type="checkbox"
              checked={dynamicallyStableOnly}
              onChange={(event) => setDynamicallyStableOnly(event.target.checked)}
            />
            <span>{t("explorer.dynamicallyStableOnly")}</span>
          </label>
        </div>
      </div>
      {hasTooManyElementMatches ? (
        <div className="result-limit-warning" role="status">
          <strong>{t("explorer.moreThan1000")}</strong>
          <span>{t("explorer.refineSearch")}</span>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="materials-table">
              <thead>
                <tr>
                  <SortHeader label={t("explorer.materialId")} sortKey="material_id" activeSort={sort} onSort={handleSort} />
                  <SortHeader label={t("explorer.formula")} sortKey="formula" activeSort={sort} onSort={handleSort} />
                  <SortHeader label={t("explorer.structureTypeColumn")} sortKey="structure_type" activeSort={sort} onSort={handleSort} />
                  <SortHeader label={t("explorer.subclass")} sortKey="subclass" activeSort={sort} onSort={handleSort} />
                  <SortHeader label={t("explorer.spaceGroup")} sortKey="space_group" activeSort={sort} onSort={handleSort} />
                  <SortHeader label={t("explorer.intercalant")} sortKey="intercalant" activeSort={sort} onSort={handleSort} />
                  <SortHeader label={t("explorer.sitesPerCell")} sortKey="sites" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="E_DFT" unit="eV/f.u." sortKey="dft_energy" activeSort={sort} onSort={handleSort} />
                  <SortHeader label="E_form" unit="eV/atom" sortKey="formation_energy" activeSort={sort} onSort={handleSort} />
                  <SortHeader label={t("explorer.mechanicalStability")} sortKey="mechanical_stability" activeSort={sort} onSort={handleSort} />
                  <SortHeader label={t("explorer.phononStability")} sortKey="phonon_stability" activeSort={sort} onSort={handleSort} />
                  <SortHeader label={t("explorer.bandGap")} unit="eV" sortKey="band_gap" activeSort={sort} onSort={handleSort} />
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
                        <span>{formatCrystalSystemLabel(material.structure.crystal_system, t)}</span>
                        {getLatticeSettingLabel(material) && <small>{t("material.rhombohedralSettingCompact")}</small>}
                      </span>
                    </td>
                    <td>{getSubclassLabel(material)}</td>
                    <td>{getSpaceGroupLabel(getSpaceGroupSymbol(material))}</td>
                    <td>{getIntercalantLabel(material)}</td>
                    <td>{getSitesPerCellLabel(material)}</td>
                    <td>{getDftEnergyPerFormulaUnitLabel(material)}</td>
                    <td>{getFormationEnergyPerAtomLabel(material)}</td>
                    <td><MechanicalStabilityValue material={material} /></td>
                    <td><PhononStabilityValue material={material} /></td>
                    <td>{formatPropertyValue(material.electronic.band_gap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination-bar" aria-label={t("explorer.pagination")}>
            <div className="page-size-controls">
              <span>{t("explorer.rowsPerPage")}</span>
              {[10, 20, 50].map((size) => (
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
              {filtered.length === 0
                ? t("explorer.noResults")
                : t("explorer.pageRange", { start: pageStart + 1, end: pageEnd, total: filtered.length })}
            </span>
            <div className="page-nav">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>
                {t("explorer.previous")}
              </button>
              <span>{currentPage} / {totalPages}</span>
              <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages}>
                {t("explorer.next")}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function formatCrystalSystemLabel(value: unknown, t: ReturnType<typeof useI18n>["t"]) {
  const translationKey = getCrystalSystemTranslationKey(value);
  return translationKey ? t(translationKey) : formatPropertyValue(value);
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
    case "formation_energy":
      return numericOrInfinity(getFormationEnergyPerAtomLabel(material));
    case "mechanical_stability":
      return getMechanicalStabilityLabel(material);
    case "phonon_stability":
      return getPhononStabilityLabel(material);
    case "band_gap":
      return numericOrInfinity(formatPropertyValue(material.electronic.band_gap));
    default:
      return "";
  }
}

function MechanicalStabilityValue({ material }: { material: MaterialRecord }) {
  const { t } = useI18n();
  const label = getMechanicalStabilityLabel(material);
  const translatedLabel = label === "Stable"
    ? t("material.stable")
    : label === "Unstable"
      ? t("material.unstable")
      : t("material.pending");
  if (label === "Pending") return translatedLabel;

  return (
    <a
      className="mechanical-stability-link"
      href={`/?material=${encodeURIComponent(material.slug)}#mechanical-properties`}
      onClick={(event) => event.stopPropagation()}
    >
      {translatedLabel}
    </a>
  );
}

function PhononStabilityValue({ material }: { material: MaterialRecord }) {
  const { t } = useI18n();
  const label = getPhononStabilityLabel(material);
  const translatedLabel = label === "Stable"
    ? t("material.stable")
    : label === "Unstable"
      ? t("material.unstable")
      : t("material.pending");
  if (label === "Pending") return translatedLabel;

  return (
    <a
      className="mechanical-stability-link"
      href={`/?material=${encodeURIComponent(material.slug)}#phonon-properties`}
      onClick={(event) => event.stopPropagation()}
    >
      {translatedLabel}
    </a>
  );
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
  const { t } = useI18n();
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">{t("explorer.all")}</option>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}
