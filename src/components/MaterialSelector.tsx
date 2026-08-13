import { Download, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { anions, chalcogens, transitionMetals } from "../lib/statuses";
import {
  findMaterialsByComposition,
  getSpaceGroupLabel,
  getSpaceGroupSymbol,
  makeStructureDownloadFilename
} from "../lib/materials";
import { publicAssetPath } from "../lib/paths";
import type { MaterialRecord } from "../lib/types";
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
  const current = materials.find((material) => material.material_id === selectedId) ?? materials[0];
  const metals = useMemo(() => [...new Set(materials.map((material) => material.host.metal))], [materials]);
  const [materialType, setMaterialType] = useState<SelectorMode>("pristine");
  const [metal, setMetal] = useState(current.host.metal);
  const [chalcogen, setChalcogen] = useState(current.host.chalcogen);
  const [anion, setAnion] = useState(current.host.anion);
  const [intercalant, setIntercalant] = useState("All");
  const [intercalantConcentration, setIntercalantConcentration] = useState("All");
  const availableStructures = findMaterialsByComposition(materials, metal, chalcogen, anion);
  const matched = availableStructures.find((material) => material.material_id === selectedId) ?? availableStructures[0];
  const downloadable = materialType === "pristine" ? matched : undefined;

  function updateSelection(
    nextMetal: string = metal,
    nextChalcogen: string = chalcogen,
    nextAnion: string = anion
  ) {
    const next = findMaterialsByComposition(materials, nextMetal, nextChalcogen, nextAnion)[0];
    if (next) onSelect(next.material_id);
  }

  return (
    <section className="selector-card" aria-labelledby="selector-title">
      <div className="section-heading">
        <p className="eyebrow">Material selector</p>
        <h2 id="selector-title">Build a TMCC query</h2>
      </div>

      <div className="segmented three" aria-label="Material type">
        <button className={materialType === "pristine" ? "active" : ""} onClick={() => setMaterialType("pristine")}>
          vdWs TMCC
        </button>
        <button className={materialType === "intercalated" ? "active" : ""} onClick={() => setMaterialType("intercalated")}>
          Intercalated TMCC
        </button>
        <button className={materialType === "single_chalcogen" ? "active" : ""} onClick={() => setMaterialType("single_chalcogen")}>
          non-vdWs TMCC (M2XA)
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
                updateSelection(event.target.value, chalcogen, anion);
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
                updateSelection(metal, event.target.value, anion);
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
                updateSelection(metal, chalcogen, event.target.value);
              }}
            >
              {anions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <div className="intercalated-placeholder">
          <label>
            <span>Intercalant M'</span>
            <select value={intercalant} onChange={(event) => setIntercalant(event.target.value)}>
              {intercalantOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>x</span>
            <select value={intercalantConcentration} onChange={(event) => setIntercalantConcentration(event.target.value)}>
              {intercalantConcentrationOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Host M</span>
            <select value={metal} onChange={(event) => setMetal(event.target.value)}>
              {metals.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>X</span>
            <select value={chalcogen} onChange={(event) => setChalcogen(event.target.value as "S" | "Se" | "Te")}>
              {chalcogens.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>A</span>
            <select value={anion} onChange={(event) => setAnion(event.target.value as "C" | "N")}>
              {anions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label><span>Host structure</span><input value={matched ? getSpaceGroupLabel(getSpaceGroupSymbol(matched)) : "Data in progress"} readOnly /></label>
          <label><span>Configuration</span><input value="Data in progress" readOnly /></label>
        </div>
      )}

      {materialType === "pristine" && (
        <div className="structure-options compact-inline" aria-label="Available crystal structures">
          {availableStructures.map((material) => (
            <button
              key={material.material_id}
              type="button"
              className={material.material_id === selectedId ? "active" : ""}
              onClick={() => onSelect(material.material_id)}
            >
              <Formula formula={material.formula} />
              <span className="structure-option-meta">{getSpaceGroupLabel(getSpaceGroupSymbol(material))}</span>
              <small>{material.material_id}</small>
            </button>
          ))}
        </div>
      )}

      <div className="button-row">
        <a className="primary-button" href="#material-detail">
          <ExternalLink size={16} />
          View Material
        </a>
        <DownloadButton
          label="Download CIF"
          href={publicAssetPath(downloadable?.files.cif)}
          filename={downloadable ? makeStructureDownloadFilename(downloadable, "cif") : null}
        />
        <DownloadButton
          label="Download POSCAR"
          href={publicAssetPath(downloadable?.files.poscar)}
          filename={downloadable ? makeStructureDownloadFilename(downloadable, "poscar") : null}
        />
      </div>
    </section>
  );
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
