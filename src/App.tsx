import { useMemo, useState } from "react";
import { Atom, Database, FlaskConical, Layers3, Table2 } from "lucide-react";
import { MaterialDetail } from "./components/MaterialDetail";
import { MaterialExplorer } from "./components/MaterialExplorer";
import { MaterialSelector } from "./components/MaterialSelector";
import { PeriodicTable } from "./components/PeriodicTable";
import { materials } from "./data/materials";
import { getMaterialStats } from "./lib/materials";

export default function App() {
  const [selectedId, setSelectedId] = useState(() => getInitialSelectedId());
  const [elementSearch, setElementSearch] = useState<{ elements: string[]; mode: "only" | "at_least" }>({
    elements: [],
    mode: "only"
  });
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

  return (
    <main>
      <header className="site-header">
        <nav className="top-nav" aria-label="Primary">
          <a href="#selector">Selector</a>
          <a href="#periodic-table">Periodic table</a>
          <a href="#explorer">Explorer</a>
          <a href="#methodology">Methodology</a>
          <button className="login-button" type="button" title="User accounts will be added with the hosted database backend">
            Login
          </button>
        </nav>
        <section className="hero-shell">
          <div className="hero-structure-mark" aria-hidden="true">
            <div className="tmcc-wordmark">TMCC</div>
            <div className="structure-family-card family-vdws">
              <span className="family-label">vdWs M2X2A</span>
              <span className="sheet sheet-top" />
              <span className="sheet sheet-bottom" />
              <span className="atom m atom-1" />
              <span className="atom x atom-2" />
              <span className="atom a atom-3" />
              <span className="atom x atom-4" />
            </div>
            <div className="structure-family-card family-intercalated">
              <span className="family-label">Intercalated</span>
              <span className="sheet sheet-top" />
              <span className="sheet sheet-bottom" />
              <span className="atom m atom-1" />
              <span className="atom x atom-2" />
              <span className="atom a atom-3" />
              <span className="atom intercalant atom-5" />
            </div>
            <div className="structure-family-card family-m2xa">
              <span className="family-label">non-vdWs M2XA</span>
              <span className="sheet sheet-single" />
              <span className="atom m atom-1" />
              <span className="atom x atom-2" />
              <span className="atom a atom-3" />
            </div>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">TMCC Database v0.1</p>
            <h1>TMCC Materials Database</h1>
            <p className="subtitle">Two-Dimensional Transition-Metal Carbon/Nitrogen Chalcogenides</p>
            <p className="hero-note">
              A data-first foundation for vdWs M2X2A, intercalated TMCC, and non-vdWs M2XA materials where A can be C or N,
              designed for progressive computational and experimental updates.
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
        <Stat icon={<Table2 size={18} />} label="Structures" value={stats.totalStructures} />
        <Stat icon={<FlaskConical size={18} />} label="vdWs TMCCs" value={stats.vdwsTmcc} />
        <Stat icon={<Atom size={18} />} label="Intercalated TMCCs" value={stats.intercalatedTmcc} />
        <Stat icon={<Layers3 size={18} />} label="non-vdWs TMCCs (M2XA)" value={stats.nonVdwsM2xa} />
      </section>

      <section id="selector" className="section-grid single">
        <MaterialSelector materials={materials} selectedId={selectedId} onSelect={selectMaterial} />
      </section>

      <PeriodicTable materials={materials} onMetalSelect={(metal) => {
        const match = materials.find((material) => material.host.metal === metal);
        if (match) selectMaterial(match.material_id);
      }} onElementSearch={(elements, mode) => {
        setElementSearch({ elements, mode });
        const elementSet = new Set(elements);
        const match = materials.find((material) => {
          const materialElements = [material.host.metal, material.host.chalcogen, material.host.anion];
          return materialElements.every((element) => elementSet.has(element));
        });
        if (match) selectMaterial(match.material_id);
        document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }} />

      <MaterialExplorer materials={materials} selectedId={selectedId} onSelect={selectMaterial} elementSearch={elementSearch} />

      <MaterialDetail material={selectedMaterial} />

      <section id="methodology" className="methodology">
        <h2>References / Methodology</h2>
        <p>
          No publications, DOIs, computational parameters, or stability thresholds have been entered in
          this prototype. Each future calculation record should include software, version, functional,
          pseudopotential/setup, cutoff, k-points, convergence criteria, workflow version, date, and source.
        </p>
        <p className="disclaimer">
          Computationally predicted materials have not necessarily been experimentally synthesized.
          Stability classifications depend on the computational methodology and should not be interpreted
          as guarantees of experimental synthesizability.
        </p>
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

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <article className="stat">
      <div>{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}
