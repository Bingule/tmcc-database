import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cellToVectors, fractionalToCartesian, parseCifStructure, type ParsedCrystalStructure } from "../lib/crystal";
import { publicAssetPath } from "../lib/paths";
import type { MaterialRecord } from "../lib/types";
import { useI18n } from "../i18n/I18nProvider";

type Orientation = "iso" | "ab" | "ac" | "bc";
type StructureStyle = "ball-stick" | "space-filling" | "polyhedral";
type Axis = "a" | "b" | "c";
type Supercell = Record<Axis, number>;
type RenderedAtom = {
  element: string;
  position: THREE.Vector3;
};

const elementStyle: Record<string, { color: number; radius: number }> = {
  Nb: { color: 0x4e79a7, radius: 0.34 },
  Ta: { color: 0x6b6f8f, radius: 0.34 },
  S: { color: 0xe0b33d, radius: 0.26 },
  Se: { color: 0xc56b3f, radius: 0.28 },
  C: { color: 0x2f3437, radius: 0.22 },
  N: { color: 0x5f8dd3, radius: 0.22 },
  Fe: { color: 0xb55346, radius: 0.3 },
  Cu: { color: 0xc9823f, radius: 0.3 }
};

function StructureViewer({ material }: { material: MaterialRecord }) {
  const { t } = useI18n();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [structure, setStructure] = useState<ParsedCrystalStructure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [supercell, setSupercell] = useState<Supercell>({ a: 1, b: 1, c: 1 });
  const [orientation, setOrientation] = useState<Orientation>("iso");
  const [style, setStyle] = useState<StructureStyle>("ball-stick");
  const cifPath = publicAssetPath(material.files.cif);

  useEffect(() => {
    let cancelled = false;
    setStructure(null);
    setError(null);

    if (!cifPath) {
      return;
    }

    setLoading(true);
    fetch(cifPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load ${cifPath}`);
        }
        return response.text();
      })
      .then((text) => {
        if (!cancelled) {
          setStructure(parseCifStructure(text));
        }
      })
      .catch((nextError: Error) => {
        if (!cancelled) {
          setError(nextError.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cifPath]);

  const elementLegend = useMemo(() => {
    if (!structure) return [];
    return [...new Set(structure.atoms.map((atom) => atom.element))];
  }, [structure]);

  useEffect(() => {
    if (!mountRef.current || !structure) {
      return;
    }

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8faf8);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.85;

    const group = buildCrystalGroup(structure, supercell, style);
    scene.add(group);
    const bounds = new THREE.Box3().setFromObject(group);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    group.position.sub(center);

    const light = new THREE.DirectionalLight(0xffffff, 2.4);
    light.position.set(6, 8, 10);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const span = Math.max(size.x, size.y, size.z, 5);
    positionCamera(camera, controls, orientation, span);
    updateOrthographicFrustum(camera, mount.clientWidth, mount.clientHeight, span);

    const resizeObserver = new ResizeObserver(() => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      updateOrthographicFrustum(camera, mount.clientWidth, mount.clientHeight, span);
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    resizeObserver.observe(mount);

    let frame = 0;
    function animate() {
      frame = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      mount.replaceChildren();
    };
  }, [structure, supercell, orientation, style]);

  if (!cifPath) {
    return (
      <div className="structure-viewer empty">
        <span>{t("structure.noCif")}</span>
      </div>
    );
  }

  return (
    <div className="structure-viewer interactive">
      <div className="viewer-toolbar" aria-label={t("structure.controls")}>
        <fieldset className="viewer-style-control">
          <legend>{t("structure.style")}</legend>
          <label>
            <input
              type="radio"
              name={`${material.material_id}-structure-style`}
              checked={style === "ball-stick"}
              onChange={() => setStyle("ball-stick")}
            />
            <span>{t("structure.ballStick")}</span>
          </label>
          <label>
            <input
              type="radio"
              name={`${material.material_id}-structure-style`}
              checked={style === "space-filling"}
              onChange={() => setStyle("space-filling")}
            />
            <span>{t("structure.spaceFilling")}</span>
          </label>
          <label>
            <input
              type="radio"
              name={`${material.material_id}-structure-style`}
              checked={style === "polyhedral"}
              onChange={() => setStyle("polyhedral")}
            />
            <span>{t("structure.polyhedral")}</span>
          </label>
        </fieldset>
        <label>
          <span>{t("structure.supercellA")}</span>
          <AxisSelect value={supercell.a} onChange={(value) => setSupercell((current) => ({ ...current, a: value }))} />
        </label>
        <label>
          <span>{t("structure.supercellB")}</span>
          <AxisSelect value={supercell.b} onChange={(value) => setSupercell((current) => ({ ...current, b: value }))} />
        </label>
        <label>
          <span>{t("structure.supercellC")}</span>
          <AxisSelect value={supercell.c} onChange={(value) => setSupercell((current) => ({ ...current, c: value }))} />
        </label>
        <label>
          <span>{t("structure.orientation")}</span>
          <select value={orientation} onChange={(event) => setOrientation(event.target.value as Orientation)}>
            <option value="iso">{t("structure.isometric")}</option>
            <option value="ab">{t("structure.abPlane")}</option>
            <option value="ac">{t("structure.acPlane")}</option>
            <option value="bc">{t("structure.bcPlane")}</option>
          </select>
        </label>
      </div>

      <div className="crystal-canvas" ref={mountRef} aria-label={t("structure.crystalAria", { formula: material.formula })} />

      <div className="viewer-status">
        {loading && <span>{t("structure.loadingCif")}</span>}
        {error && <span>{t("structure.loadError")}</span>}
        {!loading && !error && structure && (
          <>
            <span>{t("structure.atomsShown", { count: structure.atoms.length * supercell.a * supercell.b * supercell.c })}</span>
            <span>{styleLabel(style, t("structure.ballStick"), t("structure.spaceFilling"), t("structure.polyhedral"))}</span>
            <span>{t("structure.instructions")}</span>
          </>
        )}
      </div>

      {elementLegend.length > 0 && (
        <div className="atom-legend">
          {elementLegend.map((element) => (
            <span key={element}>
              <i style={{ background: `#${getElementStyle(element).color.toString(16).padStart(6, "0")}` }} />
              {element}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default StructureViewer;

function AxisSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {[1, 2, 3, 4].map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
  );
}

function buildCrystalGroup(structure: ParsedCrystalStructure, supercell: Supercell, style: StructureStyle) {
  const group = new THREE.Group();
  const vectors = cellToVectors(structure.cell).map((vector, index) => {
    const multiplier = index === 0 ? supercell.a : index === 1 ? supercell.b : supercell.c;
    return new THREE.Vector3(vector[0] * multiplier, vector[1] * multiplier, vector[2] * multiplier);
  }) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  const unitVectors = cellToVectors(structure.cell);
  const renderedAtoms: RenderedAtom[] = [];

  for (let i = 0; i < supercell.a; i += 1) {
    for (let j = 0; j < supercell.b; j += 1) {
      for (let k = 0; k < supercell.c; k += 1) {
        for (const atom of structure.atoms) {
          const position = fractionalToCartesian(
            [atom.fract[0] + i, atom.fract[1] + j, atom.fract[2] + k],
            unitVectors
          );
          const atomStyle = getElementStyle(atom.element);
          renderedAtoms.push({ element: atom.element, position: new THREE.Vector3(position[0], position[1], position[2]) });
          if (style !== "polyhedral" || !isTransitionMetal(atom.element)) {
            const mesh = new THREE.Mesh(
              new THREE.SphereGeometry(getRenderedRadius(atom.element, style), 40, 28),
              new THREE.MeshStandardMaterial({
                color: atomStyle.color,
                roughness: style === "space-filling" ? 0.78 : 0.42,
                metalness: style === "space-filling" ? 0.02 : 0.12
              })
            );
            mesh.position.set(position[0], position[1], position[2]);
            group.add(mesh);
          }
        }
      }
    }
  }

  if (style === "ball-stick") {
    addBonds(group, renderedAtoms);
  }
  if (style === "polyhedral") {
    addPolyhedra(group, renderedAtoms);
  }
  group.add(makeCellEdges(vectors));
  return group;
}

function addBonds(group: THREE.Group, atoms: RenderedAtom[], radius = 0.035, color = 0x6f7f85) {
  for (let i = 0; i < atoms.length; i += 1) {
    for (let j = i + 1; j < atoms.length; j += 1) {
      const distance = atoms[i].position.distanceTo(atoms[j].position);
      if (distance > 0.35 && distance < getBondCutoff(atoms[i].element, atoms[j].element)) {
        group.add(makeCylinderBetween(atoms[i].position, atoms[j].position, radius, color));
      }
    }
  }
}

function addPolyhedra(group: THREE.Group, atoms: RenderedAtom[]) {
  const ligandElements = new Set(["S", "Se", "Te", "C", "N"]);
  for (const center of atoms) {
    if (!isTransitionMetal(center.element)) continue;
    const neighbors = atoms
      .filter((atom) => ligandElements.has(atom.element))
      .map((atom) => ({ atom, distance: atom.position.distanceTo(center.position) }))
      .filter((item) => item.distance > 0.35 && item.distance < 3.2)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 6)
      .map((item) => item.atom);

    if (neighbors.length < 3) continue;

    group.add(makePolyhedronMesh(center, neighbors));
    group.add(makePolyhedronWireframe(center, neighbors));
  }
}

function makePolyhedronMesh(center: RenderedAtom, neighbors: RenderedAtom[]) {
  const centered = neighbors
    .map((neighbor) => ({
      atom: neighbor,
      vector: neighbor.position.clone().sub(center.position).normalize()
    }))
    .sort((first, second) => Math.atan2(first.vector.y, first.vector.x) - Math.atan2(second.vector.y, second.vector.x));
  const positions: number[] = [];
  for (let i = 0; i < centered.length; i += 1) {
    const first = centered[i].atom.position;
    const second = centered[(i + 1) % centered.length].atom.position;
    positions.push(
      center.position.x, center.position.y, center.position.z,
      first.x, first.y, first.z,
      second.x, second.y, second.z
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: getElementStyle(center.element).color,
      transparent: true,
      opacity: 0.34,
      roughness: 0.72,
      metalness: 0,
      side: THREE.DoubleSide
    })
  );
}

function makePolyhedronWireframe(center: RenderedAtom, neighbors: RenderedAtom[]) {
  const positions: number[] = [];
  for (const neighbor of neighbors) {
    positions.push(center.position.x, center.position.y, center.position.z);
    positions.push(neighbor.position.x, neighbor.position.y, neighbor.position.z);
  }
  for (let i = 0; i < neighbors.length; i += 1) {
    const first = neighbors[i].position;
    const second = neighbors[(i + 1) % neighbors.length].position;
    positions.push(first.x, first.y, first.z);
    positions.push(second.x, second.y, second.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x51646c, transparent: true, opacity: 0.72 }));
}

function makeCylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, color: number) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const cylinder = new THREE.Mesh(geometry, material);
  cylinder.position.copy(start).add(end).multiplyScalar(0.5);
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return cylinder;
}

function makeCellEdges(vectors: [THREE.Vector3, THREE.Vector3, THREE.Vector3]) {
  const [a, b, c] = vectors;
  const origin = new THREE.Vector3(0, 0, 0);
  const corners = [
    origin,
    a,
    b,
    c,
    a.clone().add(b),
    a.clone().add(c),
    b.clone().add(c),
    a.clone().add(b).add(c)
  ];
  const edgePairs = [
    [0, 1], [0, 2], [0, 3],
    [1, 4], [1, 5],
    [2, 4], [2, 6],
    [3, 5], [3, 6],
    [4, 7], [5, 7], [6, 7]
  ];
  const positions: number[] = [];
  for (const [start, end] of edgePairs) {
    positions.push(corners[start].x, corners[start].y, corners[start].z);
    positions.push(corners[end].x, corners[end].y, corners[end].z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x4f626b }));
}

function positionCamera(
  camera: THREE.OrthographicCamera,
  controls: OrbitControls,
  orientation: Orientation,
  span: number
) {
  const distance = span * 2.6;
  const positions: Record<Orientation, [number, number, number]> = {
    iso: [distance * 0.85, -distance, distance * 0.72],
    ab: [0, 0, distance],
    ac: [0, -distance, 0],
    bc: [distance, 0, 0]
  };
  camera.position.set(...positions[orientation]);
  controls.target.set(0, 0, 0);
  controls.update();
}

function updateOrthographicFrustum(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
  span: number
) {
  const aspect = width / Math.max(height, 1);
  const viewSize = span * 1.45;
  camera.left = (-viewSize * aspect) / 2;
  camera.right = (viewSize * aspect) / 2;
  camera.top = viewSize / 2;
  camera.bottom = -viewSize / 2;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
}

function getElementStyle(element: string) {
  return elementStyle[element] ?? { color: 0x8a9499, radius: 0.24 };
}

function getRenderedRadius(element: string, style: StructureStyle) {
  const base = getElementStyle(element).radius;
  if (style === "space-filling") return base * 2.85;
  if (style === "polyhedral") return base * 0.55;
  return base;
}

function getBondCutoff(first: string, second: string) {
  return getElementStyle(first).radius + getElementStyle(second).radius + 2.05;
}

function isTransitionMetal(element: string) {
  return [
    "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
    "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd",
    "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg"
  ].includes(element);
}

function styleLabel(style: StructureStyle, ballStickLabel: string, spaceFillingLabel: string, polyhedralLabel: string) {
  if (style === "ball-stick") return ballStickLabel;
  if (style === "space-filling") return spaceFillingLabel;
  return polyhedralLabel;
}
