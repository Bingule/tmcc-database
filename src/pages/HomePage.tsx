import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Atom, CircleDot, Database, FlaskConical, Layers3, Search, ShieldCheck, Table2, Zap } from "lucide-react";
import { MaterialDetail } from "../components/MaterialDetail";
import { MaterialExplorer, type ExplorerCategoryFilter } from "../components/MaterialExplorer";
import { MaterialSelector } from "../components/MaterialSelector";
import { PeriodicTable } from "../components/PeriodicTable";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { materials } from "../data/materials";
import { filterMaterialsByElementSet, getMaterialStats } from "../lib/materials";
import { useI18n } from "../i18n/I18nProvider";

export function HomePage() {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState(() => getInitialSelectedId());
  const [elementSearch, setElementSearch] = useState<{ elements: string[]; mode: "only" | "at_least" }>({ elements: [], mode: "only" });
  const [explorerCategoryFilter, setExplorerCategoryFilter] = useState<ExplorerCategoryFilter>(null);
  const [explorerResultCount, setExplorerResultCount] = useState(materials.length);
  const selectedMaterial = materials.find((material) => material.material_id === selectedId) ?? materials[0];
  const stats = useMemo(() => getMaterialStats(materials), []);

  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!new Set(["mechanical-properties", "phonon-properties"]).has(targetId)) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedMaterial.material_id]);

  function selectMaterial(materialId: string) {
    setSelectedId(materialId);
    const next = materials.find((material) => material.material_id === materialId);
    if (next && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("material", next.slug);
      window.history.replaceState(null, "", url);
    }
  }

  function goHome() {
    if (typeof window !== "undefined") window.location.href = "https://tmccdb.org/";
  }

  return (
    <>
      <SiteHeader>
        <section className="hero-shell home-click-target" role="button" tabIndex={0} title={t("home.backToMain")} onClick={goHome} onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); goHome(); }
        }}>
          <div className="hero-copy">
            <p className="eyebrow">{t("home.transitionMetalCarbochalcogenide")}</p>
            <h1><span>TMCC</span><span>{t("home.materialsDatabase")}</span></h1>
            <p className="subtitle">{t("home.subtitle")}</p>
            <p className="hero-note">{t("home.heroNote")}</p>
            <p className="hero-seo-line">{t("home.seoLine")}</p>
            <div className="update-strip" aria-label={t("home.updateStatus")}><span className="status-dot" aria-hidden="true" /><span>{t("home.continuouslyUpdated")}</span><span>{t("home.updateDetails")}</span></div>
          </div>
          <WhatIsTmccSchematic />
          <div className="hero-affiliation" aria-label={t("home.projectAffiliation")}><strong>{t("home.researchers")}</strong><span>{t("home.department")}</span><span>{t("home.university")}</span><span>wui@vscht.cz / soferz@vscht.cz</span></div>
        </section>
      </SiteHeader>
      <section className="database-glance" aria-label={t("home.databaseAtAGlance")}>
        <div className="glance-main"><div className="glance-heading"><h2>{t("home.databaseAtAGlance")}</h2><p>{t("home.clickCategory")}</p></div><div className="stats-grid" aria-label={t("home.databaseStatistics")}>
          <Stat icon={<Database size={18} />} label={t("home.compositions")} value={stats.totalCompositions} />
          <Stat icon={<Table2 size={18} />} label={t("home.structures")} value={stats.totalStructures} active={explorerCategoryFilter === null} onClick={() => setExplorerCategoryFilter(null)} />
          <Stat icon={<FlaskConical size={18} />} label={t("home.tmcdcs")} value={stats.tmcdc} active={explorerCategoryFilter === "tmcdc"} onClick={() => setExplorerCategoryFilter((current) => current === "tmcdc" ? null : "tmcdc")} />
          <Stat icon={<Atom size={18} />} label={t("home.intercalated")} value={stats.intercalatedTmcc} active={explorerCategoryFilter === "intercalated"} onClick={() => setExplorerCategoryFilter((current) => current === "intercalated" ? null : "intercalated")} />
          <Stat icon={<Layers3 size={18} />} label={t("home.tmccs")} value={stats.nonVdwsM2xa} active={explorerCategoryFilter === "tmcc"} onClick={() => setExplorerCategoryFilter((current) => current === "tmcc" ? null : "tmcc")} />
        </div></div>
        <aside className="glance-actions" aria-label={t("home.exploreDatabase")}><h2>{t("home.exploreDatabase")}</h2><a className="glance-action search-action" href="#selector"><Search size={18} /><span>{t("home.searchSelector")}</span><ArrowRight size={18} /></a><a className="glance-action table-action" href="#periodic-table"><Table2 size={18} /><span>{t("home.periodicTable")}</span><ArrowRight size={18} /></a><a className="glance-action explorer-action" href="#explorer"><FlaskConical size={18} /><span>{t("home.dataExplorer")}</span><ArrowRight size={18} /></a></aside>
        <a className="latest-update-row" href="#explorer"><span className="latest-icon"><Database size={17} /></span><strong>{t("home.latestUpdate")}</strong><span>{t("home.latestUpdateDetails")}</span><ArrowRight size={18} /></a>
      </section>
      <section id="selector" className="section-grid single"><MaterialSelector materials={materials} selectedId={selectedId} onSelect={selectMaterial} /></section>
      <PeriodicTable materials={materials} onMetalSelect={(metal) => { const match = materials.find((material) => material.host.metal === metal); if (match) selectMaterial(match.material_id); }} onElementSearch={(elements, mode) => {
        setElementSearch({ elements, mode });
        const match = filterMaterialsByElementSet(materials, elements, mode)[0];
        if (match) selectMaterial(match.material_id);
        document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }} />
      <MaterialExplorer materials={materials} selectedId={selectedId} onSelect={selectMaterial} elementSearch={elementSearch} categoryFilter={explorerCategoryFilter} onCategoryFilterChange={setExplorerCategoryFilter} onResultCountChange={setExplorerResultCount} />
      {explorerResultCount > 0 && <MaterialDetail material={selectedMaterial} />}
      <section id="methodology" className="methodology"><h2>{t("footer.references")}</h2><p>{t("home.methodologyBody")}</p><p className="disclaimer">{t("home.disclaimer")}</p><div className="methodology-contact" aria-label={t("footer.contact")}><span className="contact-label">{t("footer.contact")}</span><div className="contact-details"><div className="contact-links"><a href="mailto:wui@vscht.cz">{t("home.contactWu", { email: "wui@vscht.cz" })}</a><a href="mailto:soferz@vscht.cz">{t("home.contactSofer", { email: "soferz@vscht.cz" })}</a></div><p>{t("home.contactAddress")}</p></div></div></section>
      <SiteFooter />
    </>
  );
}

function WhatIsTmccSchematic() {
  const { t } = useI18n();
  return (
    <aside className="tmcc-schematic" aria-label={t("home.tmccSchematic")}>
      <div className="schematic-heading"><h2>{t("home.whatIsTmcc")}</h2><p>{t("home.tmccMotif")}</p></div>
      <div className="schematic-flow" aria-hidden="true"><LayerDiagram type="tmd" title={t("home.tmdLayer")} formula="X-M-X" /><span className="flow-symbol">+</span><LayerDiagram type="mxene" title={t("home.mxeneLayer")} formula="M-C-M" /><span className="flow-symbol arrow">→</span><LayerDiagram type="tmcc" title={t("home.tmccMonolayer")} formula="X-M-C-M-X" /></div>
      <div className="schematic-legend" aria-hidden="true"><span><i className="legend-m" /> {t("home.transitionMetalLegend")}</span><span><i className="legend-x" /> {t("home.chalcogenLegend")}</span><span><i className="legend-c" /> {t("home.centerLegend")}</span></div>
      <div className="feature-strip" aria-label={t("home.features")}><Feature icon={<Zap size={18} />} title={t("home.metallicConductivity")} text={t("home.metallicConductivityText")} /><Feature icon={<CircleDot size={18} />} title={t("home.activeChalcogenSurfaces")} text={t("home.activeChalcogenSurfacesText")} /><Feature icon={<ShieldCheck size={18} />} title={t("home.robustBackbone")} text={t("home.robustBackboneText")} /><Feature icon={<Layers3 size={18} />} title={t("home.vdwInterlayerSpace")} text={t("home.vdwInterlayerSpaceText")} /></div>
    </aside>
  );
}

function LayerDiagram({ type, title, formula }: { type: "tmd" | "mxene" | "tmcc"; title: string; formula: string }) {
  const nodes = {
    tmd: [["x", 20, 34], ["x", 92, 34], ["x", 164, 34], ["m", 56, 78], ["m", 128, 78], ["x", 20, 122], ["x", 92, 122], ["x", 164, 122]],
    mxene: [["m", 34, 44], ["m", 94, 44], ["m", 154, 44], ["m", 214, 44], ["c", 4, 82], ["c", 64, 82], ["c", 124, 82], ["c", 184, 82], ["c", 244, 82], ["m", 34, 120], ["m", 94, 120], ["m", 154, 120], ["m", 214, 120]],
    tmcc: [["x", 22, 28], ["x", 82, 28], ["x", 142, 28], ["x", 202, 28], ["m", 52, 58], ["m", 112, 58], ["m", 172, 58], ["c", 22, 88], ["c", 82, 88], ["c", 142, 88], ["c", 202, 88], ["m", 52, 118], ["m", 112, 118], ["m", 172, 118], ["x", 22, 148], ["x", 82, 148], ["x", 142, 148], ["x", 202, 148]]
  }[type] as Array<[string, number, number]>;
  const bonds = {
    tmd: [[3, 0], [3, 1], [3, 5], [3, 6], [4, 1], [4, 2], [4, 6], [4, 7]],
    mxene: [[4, 0], [4, 9], [5, 0], [5, 1], [5, 9], [5, 10], [6, 1], [6, 2], [6, 10], [6, 11], [7, 2], [7, 3], [7, 11], [7, 12], [8, 3], [8, 12]],
    tmcc: [[4, 0], [4, 1], [4, 7], [4, 8], [5, 1], [5, 2], [5, 8], [5, 9], [6, 2], [6, 3], [6, 9], [6, 10], [11, 7], [11, 8], [11, 14], [11, 15], [12, 8], [12, 9], [12, 15], [12, 16], [13, 9], [13, 10], [13, 16], [13, 17]]
  }[type];
  const viewBox = type === "tmd" ? "0 0 184 156" : type === "mxene" ? "0 0 248 156" : "0 0 224 176";
  return <div className={`layer-diagram ${type}`}><strong>{title}</strong><span>{formula}</span><svg viewBox={viewBox} role="img" aria-label={`${title} ${formula}`}>{bonds.map(([from, to]) => { const start = nodes[from]; const end = nodes[to]; return <line key={`${from}-${to}`} x1={start[1]} y1={start[2]} x2={end[1]} y2={end[2]} />; })}{nodes.map(([kind, x, y], index) => <circle key={`${kind}-${index}`} className={`schematic-atom ${kind}`} cx={x} cy={y} r={kind === "c" ? 6 : 8} />)}</svg></div>;
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <article className="feature-item"><span aria-hidden="true">{icon}</span><strong>{title}</strong><p>{text}</p></article>;
}

function getInitialSelectedId() {
  if (typeof window === "undefined") return materials[0]?.material_id ?? "";
  const materialParam = new URLSearchParams(window.location.search).get("material");
  const match = materials.find((material) => material.slug === materialParam || material.material_id === materialParam);
  return match?.material_id ?? materials[0]?.material_id ?? "";
}

function Stat({ icon, label, value, active = false, onClick }: { icon: React.ReactNode; label: string; value: number; active?: boolean; onClick?: () => void }) {
  const content = <><div>{icon}</div><strong>{value}</strong><span>{label}</span></>;
  if (!onClick) return <article className="stat">{content}</article>;
  return <button type="button" className={`stat stat-button ${active ? "active" : ""}`} onClick={() => { onClick(); document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} aria-pressed={active}>{content}</button>;
}
