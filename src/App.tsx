import { useMemo, useState } from "react";
import { Atom, Database, FlaskConical, Layers3, Table2 } from "lucide-react";
import { MaterialDetail } from "./components/MaterialDetail";
import { MaterialExplorer, type ExplorerCategoryFilter } from "./components/MaterialExplorer";
import { MaterialSelector } from "./components/MaterialSelector";
import { PeriodicTable } from "./components/PeriodicTable";
import { materials } from "./data/materials";
import { filterMaterialsByElementSet, getMaterialStats } from "./lib/materials";

export default function App() {
  const [selectedId, setSelectedId] = useState(() => getInitialSelectedId());
  const [elementSearch, setElementSearch] = useState<{ elements: string[]; mode: "only" | "at_least" }>({
    elements: [],
    mode: "only"
  });
  const [explorerCategoryFilter, setExplorerCategoryFilter] = useState<ExplorerCategoryFilter>(null);
  const [explorerResultCount, setExplorerResultCount] = useState(materials.length);
  const selectedMaterial = materials.find((material) => material.material_id === selectedId) ?? materials[0];
  const stats = useMemo(() => getMaterialStats(materials), []);

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
    if (typeof window === "undefined") {
      return;
    }

    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main>
      <header className="site-header">
        <nav className="top-nav" aria-label="Primary">
          <button className="nav-button" type="button" onClick={goHome}>
            Home
          </button>
          <a href="#selector">Selector</a>
          <a href="#periodic-table">Periodic table</a>
          <a href="#explorer">Explorer</a>
          <a href="#methodology">Methodology</a>
          <button className="login-button" type="button" title="User accounts will be added with the hosted database backend">
            Login
          </button>
        </nav>
        <section
          className="hero-shell home-click-target"
          role="button"
          tabIndex={0}
          title="Back to main page"
          onClick={goHome}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              goHome();
            }
          }}
        >
          <div className="hero-structure-mark" aria-hidden="true">
            <div className="tmcc-wordmark">TMCC</div>
            <div className="structure-family-card family-vdws">
              <span className="family-label">TMCDC M2X2C</span>
              <span className="sheet sheet-top" />
              <span className="sheet sheet-bottom" />
              <span className="atom m atom-1" />
              <span className="atom x atom-2" />
              <span className="atom a atom-3" />
              <span className="atom x atom-4" />
            </div>
            <div className="structure-family-card family-intercalated">
              <span className="family-label">Intercalated TMCC/TMCDC</span>
              <span className="sheet sheet-top" />
              <span className="sheet sheet-bottom" />
              <span className="atom m atom-1" />
              <span className="atom x atom-2" />
              <span className="atom a atom-3" />
              <span className="atom intercalant atom-5" />
            </div>
            <div className="structure-family-card family-m2xa">
              <span className="family-label">TMCC M2XC/M2XA</span>
              <span className="sheet sheet-single" />
              <span className="atom m atom-1" />
              <span className="atom x atom-2" />
              <span className="atom a atom-3" />
            </div>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">TMCC Database v0.1</p>
            <h1>TMCC Materials Database</h1>
            <p className="subtitle">A computational database for layered transition-metal chalcogenide carbides and nitrides</p>
            <p className="hero-note">
              TMCC is used here as the broad family for M2XC, M2X2C, intercalated, and non-vdW related structures
              where M is a transition metal, X is S/Se/Te, and the central light element can expand from C to N.
              TMCDC is the M2X2C carbodichalcogenide subclass with X-M-C-M-X layered units.
            </p>
            <div className="update-strip" aria-label="Database update status">
              <span className="status-dot" aria-hidden="true" />
              <span>Continuously updated</span>
              <span>DFT results, DOS, band structures, and stability data are added as calculations finish.</span>
            </div>
          </div>
        </section>
      </header>

      <section className="stats-grid" aria-label="Database statistics">
        <Stat icon={<Database size={18} />} label="Compositions" value={stats.totalCompositions} />
        <Stat
          icon={<Table2 size={18} />}
          label="Structures"
          value={stats.totalStructures}
          active={explorerCategoryFilter === null}
          onClick={() => setExplorerCategoryFilter(null)}
        />
        <Stat
          icon={<FlaskConical size={18} />}
          label="TMCDCs (M2X2C)"
          value={stats.tmcdc}
          active={explorerCategoryFilter === "tmcdc"}
          onClick={() => setExplorerCategoryFilter((current) => current === "tmcdc" ? null : "tmcdc")}
        />
        <Stat
          icon={<Atom size={18} />}
          label="Intercalated TMCC/TMCDC"
          value={stats.intercalatedTmcc}
          active={explorerCategoryFilter === "intercalated"}
          onClick={() => setExplorerCategoryFilter((current) => current === "intercalated" ? null : "intercalated")}
        />
        <Stat
          icon={<Layers3 size={18} />}
          label="TMCCs (M2XC / M2XA)"
          value={stats.nonVdwsM2xa}
          active={explorerCategoryFilter === "tmcc"}
          onClick={() => setExplorerCategoryFilter((current) => current === "tmcc" ? null : "tmcc")}
        />
      </section>

      <section id="selector" className="section-grid single">
        <MaterialSelector materials={materials} selectedId={selectedId} onSelect={selectMaterial} />
      </section>

      <PeriodicTable materials={materials} onMetalSelect={(metal) => {
        const match = materials.find((material) => material.host.metal === metal);
        if (match) selectMaterial(match.material_id);
      }} onElementSearch={(elements, mode) => {
        setElementSearch({ elements, mode });
        const match = filterMaterialsByElementSet(materials, elements, mode)[0];
        if (match) selectMaterial(match.material_id);
        document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }} />

      <MaterialExplorer
        materials={materials}
        selectedId={selectedId}
        onSelect={selectMaterial}
        elementSearch={elementSearch}
        categoryFilter={explorerCategoryFilter}
        onCategoryFilterChange={setExplorerCategoryFilter}
        onResultCountChange={setExplorerResultCount}
      />

      {explorerResultCount > 0 && <MaterialDetail material={selectedMaterial} />}

      <section id="methodology" className="methodology">
        <h2>References / Methodology</h2>
        <p>
          No publications, DOIs, computational parameters, or stability thresholds have been entered in
          this prototype. TMCC is used as the general material-family name; TMCDC is reserved for M2X2C
          carbodichalcogenides. Each future calculation record should include software, version, functional,
          pseudopotential/setup, cutoff, k-points, convergence criteria, workflow version, date, and source.
        </p>
        <p className="disclaimer">
          Computationally predicted materials have not necessarily been experimentally synthesized.
          Stability classifications depend on the computational methodology and should not be interpreted
          as guarantees of experimental synthesizability.
        </p>
        <div className="methodology-contact" aria-label="Contact">
          <span className="contact-label">Contact</span>
          <div className="contact-details">
            <div className="contact-links">
              <a href="mailto:wui@vscht.cz">Dr. Wu: wui@vscht.cz</a>
              <a href="mailto:soferz@vscht.cz">Dr. Sofer: soferz@vscht.cz</a>
            </div>
            <p>Department of Inorganic Chemistry, University of Chemistry and Technology Prague, Technická 5, 166 28 Prague, Czech Republic.</p>
          </div>
        </div>
      </section>

      <footer>
        <span>TMCC Database v0.1</span>
        <span>Last update: 2026-08-12</span>
        <span>{materials.length} records</span>
      </footer>
    </main>
  );
}

function getInitialSelectedId() {
  if (typeof window === "undefined") {
    return materials[0]?.material_id ?? "";
  }

  const materialParam = new URLSearchParams(window.location.search).get("material");
  const match = materials.find(
    (material) => material.slug === materialParam || material.material_id === materialParam
  );
  return match?.material_id ?? materials[0]?.material_id ?? "";
}

function Stat({
  icon,
  label,
  value,
  active = false,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`stat stat-button ${active ? "active" : ""}`}
        onClick={() => {
          onClick();
          document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        aria-pressed={active}
      >
        {content}
      </button>
    );
  }

  return (
    <article className="stat">
      {content}
    </article>
  );
}
