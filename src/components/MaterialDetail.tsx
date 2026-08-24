import { Download } from "lucide-react";
import { lazy, Suspense } from "react";
import { ElectronicStructureViewer } from "./ElectronicStructureViewer";
import { Formula } from "./Formula";
import { XrdViewer } from "./XrdViewer";
import {
  formatPropertyValue,
  getDftEnergyPerFormulaUnitLabel,
  getCellVolumeLabel,
  getDensityLabel,
  getFormationEnergyPerAtomLabel,
  getIntercalantLabel,
  getLatticeSettingLabel,
  getMechanicalStabilityLabel,
  getNumberOfSitesLabel,
  getSpaceGroupLabel,
  getSpaceGroupSymbol,
  getStructureTypeLabel,
  getSubclassLabel,
  getUnavailableLabel,
  makeStructureDownloadFilename
} from "../lib/materials";
import { formatParameterGroup } from "../lib/crystal";
import { publicAssetPath } from "../lib/paths";
import type { MaterialRecord } from "../lib/types";

const StructureViewer = lazy(() => import("./StructureViewer"));

export function MaterialDetail({ material }: { material: MaterialRecord }) {
  return (
    <section id="material-detail" className="detail">
      <div className="section-heading">
        <p className="eyebrow">Material page template</p>
        <h2><Formula formula={material.formula} /> - {getSpaceGroupLabel(getSpaceGroupSymbol(material))}</h2>
      </div>

      <div className="detail-grid">
        <Panel title="Crystal Structure">
          <Suspense fallback={<div className="structure-viewer"><span>Loading 3D structure viewer...</span></div>}>
            <StructureViewer material={material} />
          </Suspense>
          <div className="button-row compact structure-downloads">
            <FileButton
              label="CIF"
              href={publicAssetPath(material.files.cif)}
              filename={makeStructureDownloadFilename(material, "cif")}
            />
            <FileButton
              label="POSCAR"
              href={publicAssetPath(material.files.poscar)}
              filename={makeStructureDownloadFilename(material, "poscar")}
            />
          </div>
          <Data label="Space group" value={getSpaceGroupLabel(getSpaceGroupSymbol(material))} />
          <Data label="Formula" value={<Formula formula={material.formula} />} />
          <Data label="Family" value={material.family} />
          <Data label="Subclass" value={getSubclassLabel(material)} />
          <Data label="General formula" value={getStructureTypeLabel(material)} />
          <Data label="Structure type" value={getUnavailableLabel(material.structure.crystal_system)} />
          <Data label="Intercalant" value={getIntercalantLabel(material)} />
          <Data label="Number of sites" value={getNumberOfSitesLabel(material)} />
          <Data label="Space group number" value={getUnavailableLabel(material.structure.space_group_number)} />
          {getLatticeSettingLabel(material) && (
            <Data label="Lattice setting" value={getLatticeSettingLabel(material)} />
          )}
          <Data label="Lattice a, b, c" value={formatParameterGroup(material.structure.lattice_parameters)} />
          <Data label="Angles alpha, beta, gamma" value={formatParameterGroup(material.structure.angles)} />
          <Data label="Cell volume (Å³)" value={getCellVolumeLabel(material)} />
          <Data label="Density (g/cm³)" value={getDensityLabel(material)} />
          <Data label="Layer thickness" value={formatUnitValue(material.structure.layer_thickness)} />
          <Data label="van der Waals gap" value={formatUnitValue(material.structure.vdw_gap)} />
          <AtomicSitesTable sites={material.structure.atomic_sites} />
        </Panel>

        <Panel title="XRD / PDF">
          <XrdViewer material={material} />
          <div className="embedded-electronic">
            <h4>DOS / Band Structure</h4>
            <ElectronicStructureViewer material={material} />
          </div>
        </Panel>

        <Panel title="Thermodynamics">
          <Data label="E_DFT / f.u." value={getDftEnergyPerFormulaUnitLabel(material)} />
          <Data label="E_form (eV/atom)" value={getFormationEnergyPerAtomLabel(material)} />
          <Data label="E_hull (eV/atom)" value={formatPropertyValue(material.thermodynamics.energy_above_hull)} />
          <Data label="Relative energy between configurations" value={formatPropertyValue(material.thermodynamics.relative_structure_energy)} />
        </Panel>

        <Panel title="Stability And Properties">
          <Data label="Phonon calculated" value={getUnavailableLabel(material.phonons.phonon_calculated)} />
          <Data label="Dynamically stable" value={getUnavailableLabel(material.phonons.dynamically_stable)} />
          <Data label="Mechanical Stability" value={getMechanicalStabilityLabel(material)} />
          <Data label="Electronic character" value={getUnavailableLabel(material.electronic.electronic_character)} />
          <Data label="Magnetic state" value={getUnavailableLabel(material.electronic.magnetic_ground_state)} />
          <Data label="Li/Na storage data" value="-" />
        </Panel>

        <ElasticProperties material={material} />

        <Panel title="Experimental Data">
          <Data label="Synthesis method" value={getUnavailableLabel(material.structure.synthesis_method, "scientific")} />
          <Data label="Experimental files" value={<ExperimentalFiles material={material} />} />
          <Data label="Reference" value={<ReferenceValue material={material} />} />
        </Panel>

        <Panel title="Calculation Details">
          <Data label="Software" value={getUnavailableLabel(material.provenance.software)} />
          <Data label="Functional" value={getUnavailableLabel(material.provenance.exchange_correlation)} />
          <Data label="Plane-wave cutoff" value={formatUnitValue(material.provenance.plane_wave_cutoff)} />
          <Data label="K-points" value={formatKPoints(material.provenance.k_points)} />
          <Data label="Spin polarization" value={formatBooleanSetting(material.provenance.spin_polarization)} />
          <Data label="Initial magnetic moments" value={formatMagneticMoments(material.provenance.initial_magnetic_moments)} />
          <Data label="DFT+U" value={formatDftU(material.provenance.dft_u)} />
          <Data label="Calculation date" value={getUnavailableLabel(material.provenance.calculation_date)} />
          <Data label="Pseudopotential/setup" value={getUnavailableLabel(material.provenance.pseudopotential)} />
          <Data label="Workflow version" value={getUnavailableLabel(material.provenance.workflow_version)} />
        </Panel>
      </div>
    </section>
  );
}

function ElasticProperties({ material }: { material: MaterialRecord }) {
  const elastic = material.mechanical.elastic_constants;
  if (!elastic?.independent || Object.keys(elastic.independent).length === 0) return null;

  const born = material.mechanical.born_stability;
  const bornLabel = born
    ? `${born.criterion}: ${born.stable ? "Stable" : "Unstable"}`
    : "-";

  return (
    <Panel id="mechanical-properties" title="Mechanical / Elastic Properties">
      <Data label="Crystal class" value={getUnavailableLabel(material.mechanical.crystal_class)} />
      <Data label="Born stability" value={bornLabel} />
      {Object.entries(elastic.independent).map(([name, value]) => (
        <Data key={name} label={name} value={`${formatElasticValue(value)} ${elastic.unit}`} />
      ))}
    </Panel>
  );
}

function formatElasticValue(value: number) {
  return value.toFixed(2);
}

function Panel({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <article id={id} className="panel">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function Data({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="data-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExperimentalFiles({ material }: { material: MaterialRecord }) {
  const entries = [
    { label: "XRD", href: publicAssetPath(material.files.experimental_xrd ?? null) },
    { label: "Raman", href: publicAssetPath(material.files.raman ?? null) },
    { label: "SEM", href: publicAssetPath(material.files.sem ?? null) }
  ];

  return (
    <div className="experimental-file-row">
      {entries.map((entry) => (
        <ExperimentalFileButton key={entry.label} label={entry.label} href={entry.href} />
      ))}
    </div>
  );
}

function ExperimentalFileButton({ label, href }: { label: string; href: string | null }) {
  if (!href) {
    return (
      <button className="secondary-button experimental-file-button" disabled>
        {label}
      </button>
    );
  }

  return (
    <a className="secondary-button experimental-file-button" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function ReferenceValue({ material }: { material: MaterialRecord }) {
  const reference =
    readString(material.provenance.reference) ??
    readString(material.provenance.doi) ??
    readString(material.provenance.source) ??
    readString(material.files.reference);

  if (!reference) return "Not available";

  const href = getReferenceHref(reference);
  if (!href) return reference;

  return (
    <a className="reference-link" href={href} target="_blank" rel="noreferrer">
      {reference}
    </a>
  );
}

function readString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== "-" ? trimmed : null;
}

function getReferenceHref(reference: string) {
  if (/^https?:\/\//i.test(reference)) return reference;
  if (/^10\.\S+\/\S+$/i.test(reference)) return `https://doi.org/${reference}`;
  if (/^\/?(structures|figures)\//.test(reference)) return publicAssetPath(reference);
  return null;
}

function AtomicSitesTable({ sites }: { sites: unknown }) {
  if (!Array.isArray(sites) || sites.length === 0) return null;

  return (
    <div className="atomic-sites">
      <h4>Atomic sites</h4>
      <table>
        <thead>
          <tr>
            <th>Site</th>
            <th>Element</th>
            <th>x</th>
            <th>y</th>
            <th>z</th>
            <th>Occ.</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((site, index) => {
            const row = site as { label?: unknown; element?: unknown; fract_x?: unknown; fract_y?: unknown; fract_z?: unknown; occupancy?: unknown };
            return (
              <tr key={`${String(row.label)}-${index}`}>
                <td>{getUnavailableLabel(row.label)}</td>
                <td>{getUnavailableLabel(row.element)}</td>
                <td>{formatSiteNumber(row.fract_x)}</td>
                <td>{formatSiteNumber(row.fract_y)}</td>
                <td>{formatSiteNumber(row.fract_z)}</td>
                <td>{formatSiteNumber(row.occupancy)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatSiteNumber(value: unknown) {
  if (typeof value !== "number") return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

function formatKPoints(value: unknown) {
  if (!value || typeof value !== "object") return "-";
  const kpoints = value as { size?: unknown; density?: unknown; gamma?: unknown };
  if (Array.isArray(kpoints.size)) {
    const size = kpoints.size.join(" x ");
    return kpoints.gamma ? `${size}, gamma` : size;
  }
  if (typeof kpoints.density === "number") {
    const density = `density ${kpoints.density}`;
    return kpoints.gamma ? `${density}, gamma` : density;
  }
  return "-";
}

function formatBooleanSetting(value: unknown) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "-";
}

function formatMagneticMoments(value: unknown) {
  if (!value || typeof value !== "object") return "-";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, moment]) => typeof moment === "number" && moment !== 0)
    .map(([element, moment]) => `${element}=${moment} μB`);

  return entries.length > 0 ? entries.join(", ") : "-";
}

function formatDftU(value: unknown) {
  if (!value || typeof value !== "object") return "not used";
  const dftU = value as { enabled?: unknown; element?: unknown; orbital?: unknown; u_eff_ev?: unknown };
  if (dftU.enabled === false) return "not used";
  if (dftU.enabled === true && typeof dftU.element === "string" && typeof dftU.u_eff_ev === "number") {
    const orbital = typeof dftU.orbital === "string" ? dftU.orbital : "d";
    return `${dftU.element}-${orbital}, Ueff=${dftU.u_eff_ev} eV`;
  }

  return "not used";
}

function formatUnitValue(value: unknown) {
  if (!value || typeof value !== "object" || !("value" in value) || !("unit" in value)) return "-";
  const unitValue = value as { value?: unknown; unit?: unknown };
  if (unitValue.value === null || unitValue.value === undefined) return "-";
  return `${unitValue.value} ${formatDetailUnit(unitValue.unit)}`.trim();
}

function formatDetailUnit(unit: unknown) {
  if (unit === "angstrom") return "Å";
  if (unit === "degree") return "°";
  return typeof unit === "string" ? unit : "";
}

function FileButton({ label, href, filename }: { label: string; href: string | null; filename: string }) {
  if (!href) {
    return (
      <button className="secondary-button" disabled>
        <Download size={15} />
        {label}
      </button>
    );
  }

  return (
    <a className="secondary-button" href={href} download={filename}>
      <Download size={15} />
      {label}
    </a>
  );
}
