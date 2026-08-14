import { useMemo, useState } from "react";
import { Atom, CircleDot, Database, FlaskConical, Layers3, ShieldCheck, Table2, Zap } from "lucide-react";
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

  const selectedMaterial =
    materials.find((material) => material.material_id === selectedId) ?? materials[0];

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

    window.location.href = "https://tmccdb.org/";
  }

  return (
    <main>
      <header className="site-header">
        <div className="hero-topbar">
          <button className="brand-lockup" type="button" onClick={goHome} aria-label="TMCC Database home">
            <span className="brand-mark" aria-hidden="true" />
            <span>TMCC Database <b>v0.1</b></span>
          </button>
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
        </div>
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
          <div className="hero-copy">
            <p className="eyebrow">Transition Metal Carbochalcogenide</p>
            <h1>
              <span>TMCC</span>
              <span>Materials Database</span>
            </h1>
            <p className="subtitle">A materials database for layered transition-metal chalcogenide carbides, nitrides, and related intercalated structures.</p>
            <p className="hero-note">
              The TMCC Database is a materials database for transition metal carbochalcogenides (TMCCs),
              covering TMCC, TMCDC, and intercalated layered materials. TMCC is the broad family for
              M2XA, M2X2A, and metal-intercalated records where M is a transition metal, X is S/Se/Te,
              and A is C or N. TMCDC is the M2X2A subclass with X-M-A-M-X layered units.
            </p>
            <p className="hero-seo-line">
              The term transition metal carbo-chalcogenide is used here as a searchable synonym for TMCC materials.
            </p>

            <div className="update-strip" aria-label="Database update status">
              <span className="status-dot" aria-hidden="true" />
              <span>Continuously updated</span>
              <span>
                DFT results, DOS, structural files, and experimental records are added
                as calculations and measurements finish.
              </span>
            </div>
          </div>
          <WhatIsTmccSchematic />
          <div className="hero-affiliation" aria-label="Project affiliation">
            <strong>Dr. Wu / Dr. Sofer</strong>
            <span>Department of Inorganic Chemistry</span>
            <span>University of Chemistry and Technology Prague</span>
            <span>wui@vscht.cz / soferz@vscht.cz</span>
          </div>
        </section>
      </header>

      <section className="stats-grid" aria-label="Database statistics">
        <Stat
          icon={<Database size={18} />}
          label="Compositions"
          value={stats.totalCompositions}
        />

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
          onClick={() =>
            setExplorerCategoryFilter((current) =>
              current === "tmcdc" ? null : "tmcdc"
            )
          }
        />

        <Stat
          icon={<Atom size={18} />}
          label="Intercalated TMCC/TMCDC"
          value={stats.intercalatedTmcc}
          active={explorerCategoryFilter === "intercalated"}
          onClick={() =>
            setExplorerCategoryFilter((current) =>
              current === "intercalated" ? null : "intercalated"
            )
          }
        />

        <Stat
          icon={<Layers3 size={18} />}
          label="TMCCs (M2XC / M2XA)"
          value={stats.nonVdwsM2xa}
          active={explorerCategoryFilter === "tmcc"}
          onClick={() =>
            setExplorerCategoryFilter((current) =>
              current === "tmcc" ? null : "tmcc"
            )
          }
        />
      </section>

      <section id="selector" className="section-grid single">
        <MaterialSelector
          materials={materials}
          selectedId={selectedId}
          onSelect={selectMaterial}
        />
      </section>

      <PeriodicTable
        materials={materials}
        onMetalSelect={(metal) => {
          const match = materials.find(
            (material) => material.host.metal === metal
          );

          if (match) {
            selectMaterial(match.material_id);
          }
        }}
        onElementSearch={(elements, mode) => {
          setElementSearch({ elements, mode });

          const match = filterMaterialsByElementSet(
            materials,
            elements,
            mode
          )[0];

          if (match) {
            selectMaterial(match.material_id);
          }

          document
            .getElementById("explorer")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <MaterialExplorer
        materials={materials}
        selectedId={selectedId}
        onSelect={selectMaterial}
        elementSearch={elementSearch}
        categoryFilter={explorerCategoryFilter}
        onCategoryFilterChange={setExplorerCategoryFilter}
        onResultCountChange={setExplorerResultCount}
      />

      {explorerResultCount > 0 && (
        <MaterialDetail material={selectedMaterial} />
      )}

      <section id="methodology" className="methodology">
        <h2>References / Methodology</h2>

        <p>
          No publications, DOIs, experimental datasets, or stability thresholds
          have been entered in this prototype. TMCC is used as the general
          material-family name; TMCDC is reserved for vdW M2X2A
          carbodichalcogenide/carbonitride structures and their intercalated
          derivatives. Each future record should include calculation settings,
          structural files, experimental source files where available, workflow
          version, date, and source.
        </p>

        <p className="disclaimer">
          Computationally predicted materials have not necessarily been
          experimentally synthesized. Stability classifications depend on the
          computational methodology and should not be interpreted as guarantees
          of experimental synthesizability.
        </p>

        <div className="methodology-contact" aria-label="Contact">
          <span className="contact-label">Contact</span>

          <div className="contact-details">
            <div className="contact-links">
              <a href="mailto:wui@vscht.cz">
                Dr. Wu: wui@vscht.cz
              </a>

              <a href="mailto:soferz@vscht.cz">
                Dr. Sofer: soferz@vscht.cz
              </a>
            </div>

            <p>
              Department of Inorganic Chemistry, University of Chemistry and
              Technology Prague, Technická 5, 166 28 Prague, Czech Republic.
            </p>
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

function WhatIsTmccSchematic() {
  return (
    <aside className="tmcc-schematic" aria-label="What is a TMCC schematic">
      <div className="schematic-heading">
        <h2>What is a TMCC?</h2>
        <p>TMD-like and MXene-like motifs combine into a layered TMCC monolayer.</p>
      </div>
      <div className="schematic-flow" aria-hidden="true">
        <LayerDiagram type="tmd" title="TMD-like layer" formula="X-M-X" />
        <span className="flow-symbol">+</span>
        <LayerDiagram type="mxene" title="MXene-like layer" formula="M-C-M" />
        <span className="flow-symbol arrow">→</span>
        <LayerDiagram type="tmcc" title="TMCC monolayer" formula="X-M-C-M-X" />
      </div>
      <div className="schematic-legend" aria-hidden="true">
        <span><i className="legend-m" /> M = transition metal</span>
        <span><i className="legend-x" /> X = S, Se, Te</span>
        <span><i className="legend-c" /> C = carbon</span>
      </div>
      <div className="feature-strip" aria-label="TMCC features">
        <Feature icon={<Zap size={18} />} title="Metallic conductivity" text="Conductive M-C backbone for electron transport." />
        <Feature icon={<CircleDot size={18} />} title="Active chalcogen surfaces" text="Outer S/Se/Te layers expose reactive sites." />
        <Feature icon={<ShieldCheck size={18} />} title="Robust M2C backbone" text="Covalent M-C bonding stabilizes the central slab." />
        <Feature icon={<Layers3 size={18} />} title="vdW interlayer space" text="Layer gaps support intercalation and ion access." />
      </div>
    </aside>
  );
}

function LayerDiagram({ type, title, formula }: { type: "tmd" | "mxene" | "tmcc"; title: string; formula: string }) {
  const nodes = {
    tmd: [
      ["x", 20, 34], ["x", 92, 34], ["x", 164, 34],
      ["m", 56, 78], ["m", 128, 78],
      ["x", 20, 122], ["x", 92, 122], ["x", 164, 122]
    ],
    mxene: [
      ["m", 34, 44], ["m", 94, 44], ["m", 154, 44], ["m", 214, 44],
      ["c", 4, 82], ["c", 64, 82], ["c", 124, 82], ["c", 184, 82], ["c", 244, 82],
      ["m", 34, 120], ["m", 94, 120], ["m", 154, 120], ["m", 214, 120]
    ],
    tmcc: [
      ["x", 22, 28], ["x", 82, 28], ["x", 142, 28], ["x", 202, 28],
      ["m", 52, 58], ["m", 112, 58], ["m", 172, 58],
      ["c", 22, 88], ["c", 82, 88], ["c", 142, 88], ["c", 202, 88],
      ["m", 52, 118], ["m", 112, 118], ["m", 172, 118],
      ["x", 22, 148], ["x", 82, 148], ["x", 142, 148], ["x", 202, 148]
    ]
  }[type];

  const bonds = {
    tmd: [
      [3, 0], [3, 1], [3, 5], [3, 6],
      [4, 1], [4, 2], [4, 6], [4, 7]
    ],
    mxene: [
      [4, 0], [4, 9],
      [5, 0], [5, 1], [5, 9], [5, 10],
      [6, 1], [6, 2], [6, 10], [6, 11],
      [7, 2], [7, 3], [7, 11], [7, 12],
      [8, 3], [8, 12]
    ],
    tmcc: [
      [4, 0], [4, 1], [4, 7], [4, 8],
      [5, 1], [5, 2], [5, 8], [5, 9],
      [6, 2], [6, 3], [6, 9], [6, 10],
      [11, 7], [11, 8], [11, 14], [11, 15],
      [12, 8], [12, 9], [12, 15], [12, 16],
      [13, 9], [13, 10], [13, 16], [13, 17]
    ]
  }[type];

  const viewBox = type === "tmd" ? "0 0 184 156" : type === "mxene" ? "0 0 248 156" : "0 0 224 176";

  return (
    <div className={`layer-diagram ${type}`}>
      <strong>{title}</strong>
      <span>{formula}</span>
      <svg viewBox={viewBox} role="img" aria-label={`${title} ${formula}`}>
        {bonds.map(([from, to]) => {
          const start = nodes[from];
          const end = nodes[to];
          return <line key={`${from}-${to}`} x1={start[1]} y1={start[2]} x2={end[1]} y2={end[2]} />;
        })}
        {nodes.map(([kind, x, y], index) => (
          <circle key={`${kind}-${index}`} className={`schematic-atom ${kind}`} cx={Number(x)} cy={Number(y)} r={kind === "c" ? 6 : 8} />
        ))}
      </svg>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="feature-item">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </article>
  );
}

function getInitialSelectedId() {
  if (typeof window === "undefined") {
    return materials[0]?.material_id ?? "";
  }

  const materialParam = new URLSearchParams(
    window.location.search
  ).get("material");

  const match = materials.find(
    (material) =>
      material.slug === materialParam ||
      material.material_id === materialParam
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

          document
            .getElementById("explorer")
            ?.scrollIntoView({
              behavior: "smooth",
              block: "start"
            });
        }}
        aria-pressed={active}
      >
        {content}
      </button>
    );
  }

  return <article className="stat">{content}</article>;
}
