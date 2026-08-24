import { Download, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { anions, chalcogens, transitionMetals } from "../lib/statuses";
import {
  findMaterialsByComposition,
  getStructureTypeLabel,
  getSpaceGroupLabel,
  getSpaceGroupSymbol,
  makeStructureDownloadFilename
} from "../lib/materials";
import { publicAssetPath } from "../lib/paths";
import type { MaterialRecord } from "../lib/types";
import { useI18n } from "../i18n/I18nProvider";
import { Formula } from "./Formula";

type Props = {
  materials: MaterialRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
};

type SelectorMode = "pristine" | "intercalated" | "single_chalcogen";

export const intercalantOptions = ["All", ...transitionMetals];
export const intercalantConcentrationOptions = ["All", "0.125", "0.25", "1/3", "0.5", "1"];

export function MaterialSelector({ materials, selectedId, onSelect }: Props) {
  const { t } = useI18n();
  const current = materials.find((material) => material.material_id === selectedId) ?? materials[0];
  const metals = useMemo(() => [...new Set(materials.map((material) => material.host.metal))], [materials]);
  const [materialType, setMaterialType] = useState<SelectorMode>("pristine");
  const [metal, setMetal] = useState(current.host.metal);
  const [chalcogen, setChalcogen] = useState(current.host.chalcogen);
  const [anion, setAnion] = useState(current.host.anion);
  const [intercalant, setIntercalant] = useState("All");
  const [intercalantConcentration, setIntercalantConcentration] = useState("All");
  const availableStructures = getSelectorMatches(
    materials,
    materialType,
    metal,
    chalcogen,
    anion,
    intercalant,
    intercalantConcentration
  );
  const matched = availableStructures.find((material) => material.material_id === selectedId) ?? availableStructures[0];
  const downloadable = matched;

  function updateSelection(
    nextType: SelectorMode = materialType,
    nextMetal: string = metal,
    nextChalcogen: string = chalcogen,
    nextAnion: string = anion,
    nextIntercalant: string = intercalant,
    nextIntercalantConcentration: string = intercalantConcentration
  ) {
    const next = getSelectorMatches(
      materials,
      nextType,
      nextMetal,
      nextChalcogen,
      nextAnion,
      nextIntercalant,
      nextIntercalantConcentration
    )[0];
    if (next) onSelect(next.material_id);
  }

  function chooseMode(nextType: SelectorMode) {
    setMaterialType(nextType);
    updateSelection(nextType);
  }

  return (
    <section className="selector-card" aria-labelledby="selector-title">
      <div className="section-heading">
        <p className="eyebrow">{t("selector.eyebrow")}</p>
        <h2 id="selector-title">{t("selector.title")}</h2>
      </div>

      <div className="segmented three" aria-label={t("selector.materialType")}>
        <button className={materialType === "pristine" ? "active" : ""} onClick={() => chooseMode("pristine")}>
          {t("home.tmcdcs")}
        </button>
        <button className={materialType === "intercalated" ? "active" : ""} onClick={() => chooseMode("intercalated")}>
          {t("home.intercalated")}
        </button>
        <button className={materialType === "single_chalcogen" ? "active" : ""} onClick={() => chooseMode("single_chalcogen")}>
          {t("home.tmccs")}
        </button>
      </div>

      {materialType === "pristine" || materialType === "single_chalcogen" ? (
        <div className="selector-controls">
          <label>
            <span>M</span>
            <select
              value={metal}
              onChange={(event) => {
                setMetal(event.target.value);
                updateSelection(materialType, event.target.value, chalcogen, anion);
              }}
            >
              {metals.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>X</span>
            <select
              value={chalcogen}
              onChange={(event) => {
                setChalcogen(event.target.value as "S" | "Se" | "Te");
                updateSelection(materialType, metal, event.target.value, anion);
              }}
            >
              {chalcogens.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>A</span>
            <select
              value={anion}
              onChange={(event) => {
                setAnion(event.target.value as "C" | "N");
                updateSelection(materialType, metal, chalcogen, event.target.value);
              }}
            >
              {anions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <div className="intercalated-placeholder">
          <label>
            <span>{t("selector.intercalant")}</span>
            <select
              value={intercalant}
              onChange={(event) => {
                setIntercalant(event.target.value);
                updateSelection(materialType, metal, chalcogen, anion, event.target.value, intercalantConcentration);
              }}
            >
              {intercalantOptions.map((item) => <option key={item}>{item === "All" ? t("common.all") : item}</option>)}
            </select>
          </label>
          <label>
            <span>x</span>
            <select
              value={intercalantConcentration}
              onChange={(event) => {
                setIntercalantConcentration(event.target.value);
                updateSelection(materialType, metal, chalcogen, anion, intercalant, event.target.value);
              }}
            >
              {intercalantConcentrationOptions.map((item) => <option key={item}>{item === "All" ? t("common.all") : item}</option>)}
            </select>
          </label>
          <label>
            <span>{t("selector.hostMetal")} M</span>
            <select
              value={metal}
              onChange={(event) => {
                setMetal(event.target.value);
                updateSelection(materialType, event.target.value, chalcogen, anion);
              }}
            >
              {metals.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>X</span>
            <select
              value={chalcogen}
              onChange={(event) => {
                setChalcogen(event.target.value as "S" | "Se" | "Te");
                updateSelection(materialType, metal, event.target.value, anion);
              }}
            >
              {chalcogens.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>A</span>
            <select
              value={anion}
              onChange={(event) => {
                setAnion(event.target.value as "C" | "N");
                updateSelection(materialType, metal, chalcogen, event.target.value);
              }}
            >
              {anions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label><span>{t("selector.hostStructure")}</span><input value={matched ? getSpaceGroupLabel(getSpaceGroupSymbol(matched)) : t("selector.dataInProgress")} readOnly /></label>
          <label><span>{t("selector.configuration")}</span><input value={matched?.intercalation?.configuration ?? t("selector.dataInProgress")} readOnly /></label>
        </div>
      )}

      {availableStructures.length > 0 && (
        <div className="structure-options compact-inline" aria-label={t("selector.availableStructures")}>
          {availableStructures.map((material) => (
            <button
              key={material.material_id}
              type="button"
              className={material.material_id === selectedId ? "active" : ""}
              onClick={() => onSelect(material.material_id)}
            >
              <Formula formula={material.formula} />
              <span className="structure-option-meta">{getSpaceGroupLabel(getSpaceGroupSymbol(material))}</span>
              {material.intercalation?.intercalant && <span className="structure-option-meta">{material.intercalation.intercalant} x={material.intercalation.x}</span>}
              <small>{material.material_id}</small>
            </button>
          ))}
        </div>
      )}

      <div className="button-row">
        <a className="primary-button" href="#material-detail">
          <ExternalLink size={16} />
          {t("selector.viewMaterial")}
        </a>
        <DownloadButton
          label={t("selector.downloadCif")}
          href={publicAssetPath(downloadable?.files.cif)}
          filename={downloadable ? makeStructureDownloadFilename(downloadable, "cif") : null}
        />
        <DownloadButton
          label={t("selector.downloadPoscar")}
          href={publicAssetPath(downloadable?.files.poscar)}
          filename={downloadable ? makeStructureDownloadFilename(downloadable, "poscar") : null}
        />
      </div>
    </section>
  );
}

export function getSelectorMatches(
  materials: MaterialRecord[],
  materialType: SelectorMode,
  metal: string,
  chalcogen: string,
  anion: string,
  intercalant = "All",
  concentration = "All"
) {
  if (materialType === "pristine") {
    return findMaterialsByComposition(materials, metal, chalcogen, anion);
  }

  if (materialType === "single_chalcogen") {
    return materials.filter(
      (material) =>
        (material.material_type === "m2xa" || getStructureTypeLabel(material).startsWith("M2X")) &&
        !getStructureTypeLabel(material).startsWith("M2X2") &&
        material.host.metal === metal &&
        material.host.chalcogen === chalcogen &&
        material.host.anion === anion
    );
  }

  return materials.filter((material) => {
    const x = material.intercalation?.x;
    return (
      material.material_type === "tm_intercalated" &&
      material.host.metal === metal &&
      material.host.chalcogen === chalcogen &&
      material.host.anion === anion &&
      (intercalant === "All" || material.intercalation?.intercalant === intercalant) &&
      (concentration === "All" || formatConcentration(x) === concentration)
    );
  });
}

function formatConcentration(value: unknown) {
  if (typeof value !== "number") return "";
  if (Math.abs(value - 1 / 3) < 1e-5) return "1/3";
  return String(value);
}

function DownloadButton({ label, href, filename }: { label: string; href: string | null; filename: string | null }) {
  if (!href) {
    return (
      <button className="secondary-button" disabled>
        <Download size={16} />
        {label}
      </button>
    );
  }

  return (
    <a className="secondary-button" href={href} download={filename ?? true}>
      <Download size={16} />
      {label}
    </a>
  );
}
