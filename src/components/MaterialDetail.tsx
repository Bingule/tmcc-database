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
import { useI18n } from "../i18n/I18nProvider";
import { getCrystalSystemTranslationKey } from "../i18n/displayLabels";

const StructureViewer = lazy(() => import("./StructureViewer"));

export function MaterialDetail({ material }: { material: MaterialRecord }) {
  const { t } = useI18n();
  const mechanicalStability = getMechanicalStabilityLabel(material);
  const crystalSystemTranslationKey = getCrystalSystemTranslationKey(material.structure.crystal_system);
  return (
    <section id="material-detail" className="detail">
      <div className="section-heading">
        <p className="eyebrow">{t("material.template")}</p>
        <h2><Formula formula={material.formula} /> - {getSpaceGroupLabel(getSpaceGroupSymbol(material))}</h2>
      </div>

      <div className="detail-grid">
        <Panel title={t("material.crystalStructure")}>
          <Suspense fallback={<div className="structure-viewer"><span>{t("material.loadingStructure")}</span></div>}>
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
          <Data label={t("material.spaceGroup")} value={getSpaceGroupLabel(getSpaceGroupSymbol(material))} />
          <Data label={t("material.formula")} value={<Formula formula={material.formula} />} />
          <Data label={t("material.family")} value={material.family} />
          <Data label={t("material.subclass")} value={getSubclassLabel(material)} />
          <Data label={t("material.generalFormula")} value={getStructureTypeLabel(material)} />
          <Data label={t("material.structureType")} value={crystalSystemTranslationKey ? t(crystalSystemTranslationKey) : getUnavailableLabel(material.structure.crystal_system)} />
          <Data label={t("material.intercalant")} value={getIntercalantLabel(material)} />
          <Data label={t("material.numberOfSites")} value={getNumberOfSitesLabel(material)} />
          <Data label={t("material.spaceGroupNumber")} value={getUnavailableLabel(material.structure.space_group_number)} />
          {getLatticeSettingLabel(material) && (
            <Data label={t("material.latticeSetting")} value={t("material.rhombohedralSetting")} />
          )}
          <Data label={t("material.latticeParameters")} value={formatParameterGroup(material.structure.lattice_parameters)} />
          <Data label={t("material.angles")} value={formatParameterGroup(material.structure.angles)} />
          <Data label={t("material.cellVolume")} value={getCellVolumeLabel(material)} />
          <Data label={t("material.density")} value={getDensityLabel(material)} />
          <Data label={t("material.layerThickness")} value={formatUnitValue(material.structure.layer_thickness)} />
          <Data label={t("material.vdwGap")} value={formatUnitValue(material.structure.vdw_gap)} />
          <AtomicSitesTable sites={material.structure.atomic_sites} />
        </Panel>

        <Panel title={t("xrd.title")}>
          <XrdViewer material={material} />
          <div className="embedded-electronic">
            <h4>{t("material.dosBandStructure")}</h4>
            <ElectronicStructureViewer material={material} />
          </div>
        </Panel>

        <Panel title={t("material.thermodynamics")}>
          <Data label="E_DFT / f.u." value={getDftEnergyPerFormulaUnitLabel(material)} />
          <Data label="E_form (eV/atom)" value={getFormationEnergyPerAtomLabel(material)} />
          <Data label="E_hull (eV/atom)" value={formatPropertyValue(material.thermodynamics.energy_above_hull)} />
          <Data label={t("material.relativeEnergy")} value={formatPropertyValue(material.thermodynamics.relative_structure_energy)} />
        </Panel>

        <Panel title={t("material.stabilityProperties")}>
          <Data label={t("material.phononCalculated")} value={formatOptionalBoolean(material.phonons.phonon_calculated, t("common.yes"), t("common.no"))} />
          <Data label={t("material.dynamicallyStable")} value={formatOptionalBoolean(material.phonons.dynamically_stable, t("common.yes"), t("common.no"))} />
          <Data label={t("material.mechanicalStability")} value={mechanicalStability === "Stable" ? t("material.stable") : mechanicalStability === "Unstable" ? t("material.unstable") : t("material.pending")} />
          <Data label={t("material.electronicCharacter")} value={formatElectronicCharacter(
            material.electronic.electronic_character,
            t("material.metallic"),
            t("material.metallicDosDerived"),
            t("material.semiconductingDosEstimate")
          )} />
          <Data label={t("material.magneticState")} value={getUnavailableLabel(material.electronic.magnetic_ground_state)} />
          <Data label={t("material.storageData")} value="-" />
        </Panel>

        <ElasticProperties material={material} />

        <Panel title={t("material.experimentalData")}>
          <Data label={t("material.synthesisMethod")} value={getUnavailableLabel(material.structure.synthesis_method, "scientific")} />
          <Data label={t("material.experimentalFiles")} value={<ExperimentalFiles material={material} />} />
          <Data label={t("material.reference")} value={<ReferenceValue material={material} />} />
        </Panel>

        <Panel title={t("material.calculationDetails")}>
          <Data label={t("material.software")} value={getUnavailableLabel(material.provenance.software)} />
          <Data label={t("material.functional")} value={getUnavailableLabel(material.provenance.exchange_correlation)} />
          <Data label={t("material.planeWaveCutoff")} value={formatUnitValue(material.provenance.plane_wave_cutoff)} />
          <Data label={t("material.kPoints")} value={formatKPoints(material.provenance.k_points, t("material.densitySetting"), t("material.gamma"))} />
          <Data label={t("material.spinPolarization")} value={formatBooleanSetting(material.provenance.spin_polarization, t("common.yes"), t("common.no"))} />
          <Data label={t("material.initialMagneticMoments")} value={formatMagneticMoments(material.provenance.initial_magnetic_moments)} />
          <Data label="DFT+U" value={formatDftU(material.provenance.dft_u, t("material.notUsed"))} />
          <Data label={t("material.calculationDate")} value={getUnavailableLabel(material.provenance.calculation_date)} />
          <Data label={t("material.pseudopotential")} value={getUnavailableLabel(material.provenance.pseudopotential)} />
          <Data label={t("material.workflowVersion")} value={getUnavailableLabel(material.provenance.workflow_version)} />
        </Panel>
      </div>
    </section>
  );
}

function ElasticProperties({ material }: { material: MaterialRecord }) {
  const { t } = useI18n();
  const elastic = material.mechanical.elastic_constants;
  if (!elastic?.independent || Object.keys(elastic.independent).length === 0) return null;

  const born = material.mechanical.born_stability;
  const bornLabel = born
    ? `${born.criterion === "Born criteria for trigonal crystals" ? t("material.bornCriteriaTrigonal") : born.criterion}: ${born.stable ? t("material.stable") : t("material.unstable")}`
    : "-";

  return (
    <Panel id="mechanical-properties" title={t("material.mechanicalProperties")}>
      <Data label={t("material.crystalClass")} value={material.mechanical.crystal_class === "trigonal (-3m)" ? t("material.trigonalClass") : getUnavailableLabel(material.mechanical.crystal_class)} />
      <Data label={t("material.bornStability")} value={bornLabel} />
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
  const { t } = useI18n();
  const reference =
    readString(material.provenance.reference) ??
    readString(material.provenance.doi) ??
    readString(material.provenance.source) ??
    readString(material.files.reference);

  if (!reference) return t("common.notAvailable");

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
  const { t } = useI18n();
  if (!Array.isArray(sites) || sites.length === 0) return null;

  return (
    <div className="atomic-sites">
      <h4>{t("material.atomicSites")}</h4>
      <table>
        <thead>
          <tr>
            <th>{t("material.site")}</th>
            <th>{t("material.element")}</th>
            <th>x</th>
            <th>y</th>
            <th>z</th>
            <th>{t("material.occupancy")}</th>
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

function formatKPoints(value: unknown, densityLabel: string, gammaLabel: string) {
  if (!value || typeof value !== "object") return "-";
  const kpoints = value as { size?: unknown; density?: unknown; gamma?: unknown };
  if (Array.isArray(kpoints.size)) {
    const size = kpoints.size.join(" x ");
    return kpoints.gamma ? `${size}, ${gammaLabel}` : size;
  }
  if (typeof kpoints.density === "number") {
    const density = `${densityLabel} ${kpoints.density}`;
    return kpoints.gamma ? `${density}, ${gammaLabel}` : density;
  }
  return "-";
}

function formatBooleanSetting(value: unknown, yesLabel: string, noLabel: string) {
  if (value === true) return yesLabel;
  if (value === false) return noLabel;
  return "-";
}

function formatMagneticMoments(value: unknown) {
  if (!value || typeof value !== "object") return "-";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, moment]) => typeof moment === "number" && moment !== 0)
    .map(([element, moment]) => `${element}=${moment} μB`);

  return entries.length > 0 ? entries.join(", ") : "-";
}

function formatDftU(value: unknown, notUsedLabel: string) {
  if (!value || typeof value !== "object") return notUsedLabel;
  const dftU = value as { enabled?: unknown; element?: unknown; orbital?: unknown; u_eff_ev?: unknown };
  if (dftU.enabled === false) return notUsedLabel;
  if (dftU.enabled === true && typeof dftU.element === "string" && typeof dftU.u_eff_ev === "number") {
    const orbital = typeof dftU.orbital === "string" ? dftU.orbital : "d";
    return `${dftU.element}-${orbital}, Ueff=${dftU.u_eff_ev} eV`;
  }

  return notUsedLabel;
}

function formatOptionalBoolean(value: unknown, yesLabel: string, noLabel: string) {
  if (value === true) return yesLabel;
  if (value === false) return noLabel;
  return "-";
}

function formatElectronicCharacter(
  value: unknown,
  metallicLabel: string,
  metallicDosLabel: string,
  semiconductingDosLabel: string
) {
  if (value === "metallic") return metallicLabel;
  if (value === "metallic (DOS-derived)") return metallicDosLabel;
  if (value === "semiconducting (DOS-derived estimate)") return semiconductingDosLabel;
  return getUnavailableLabel(value);
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
