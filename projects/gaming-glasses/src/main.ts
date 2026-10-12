// App shell: the 3D scene, the control panel, the fit report and the exports.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { buildGlasses, type Built } from "./frame";
import { computeReport } from "./fit";
import { buildHeadGuide } from "./head";
import { DEFAULTS, PRESETS, RANGES, sizeLabel, type Params, type PresetId } from "./params";
import { THEMES } from "./themes";
import { softShadow } from "./themes/textures";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- state ----------
const params: Params = { ...DEFAULTS };
let theme = THEMES[0];
const view = { head: false, xray: false };
let built: Built | null = null;
let headGuide: THREE.Group | null = null;

// ---------- renderer, camera, lights ----------
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.style.position = "absolute";
labels.domElement.style.inset = "0";
labels.domElement.style.pointerEvents = "none";
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
// A soft studio "room" reflected in the glossy surfaces: this is what makes the candy look shiny.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(120, 200, 180);
scene.add(key);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c2ff, 0.5));

const camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotateSpeed = 1.2;
controls.autoRotate = true;
const TARGET = new THREE.Vector3(0, 0, -55);

const VIEWS: Record<string, [number, number, number]> = {
  hero: [260, 130, 300],
  front: [0, 15, 470],
  side: [480, 25, -55],
  top: [0, 500, -54],
};
function setView(name: string) {
  const [x, y, z] = VIEWS[name];
  camera.position.set(x, y, z);
  controls.target.copy(TARGET);
  controls.update();
}
setView("hero");

const shadow = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ map: softShadow(), transparent: true, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2;
shadow.position.set(0, -60, -55);
scene.add(shadow);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---------- building ----------
function dispose(obj: THREE.Object3D) {
  const doomed: CSS2DObject[] = [];
  obj.traverse((o) => {
    if (o instanceof CSS2DObject) doomed.push(o);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of ([] as THREE.Material[]).concat(mesh.material)) {
      (m as THREE.MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
  });
  doomed.forEach((d) => d.removeFromParent()); // removes the label's HTML element too
  obj.removeFromParent();
}

function rebuild() {
  if (built) dispose(built.root);
  if (headGuide) dispose(headGuide);
  built = buildGlasses(params, theme);
  scene.add(built.root);

  // X-ray: make the shell see-through and show the electronics.
  built.root.traverse((o) => {
    const kind = o.userData.kind;
    if (kind === "electronics") o.visible = view.xray;
    const mesh = o as THREE.Mesh;
    if (view.xray && mesh.isMesh && (kind === "frame" || kind === "pad" || kind === "decal")) {
      const m = (mesh.material as THREE.Material).clone();
      m.transparent = true;
      m.opacity = 0.16;
      m.depthWrite = false;
      mesh.material = m;
    }
  });

  headGuide = view.head ? buildHeadGuide(params, built) : null;
  if (headGuide) scene.add(headGuide);

  renderReport();
  $("spec").textContent = sizeLabel(params);
}

function renderReport() {
  if (!built) return;
  const r = computeReport(params, built, theme);
  $("weight").innerHTML = `${Math.round(r.totalG)} g <small>estimated total</small>`;
  const ul = $("checks");
  ul.replaceChildren(
    ...r.checks.map((c) => {
      const li = document.createElement("li");
      li.className = c.level;
      const t = document.createElement("div");
      t.className = "t";
      t.textContent = c.title;
      const d = document.createElement("div");
      d.className = "d";
      d.textContent = c.detail;
      li.append(t, d);
      return li;
    }),
  );
}

// ---------- controls panel ----------
const FRAME_SLIDERS: [keyof Params, string, string, string][] = [
  ["lensWidth", "Lens width (A)", "mm", "Width of one lens"],
  ["lensHeight", "Lens height (B)", "mm", "Taller lenses = bigger display area"],
  ["bridge", "Bridge (DBL)", "mm", "Gap between the lenses, sits on the nose"],
  ["temple", "Temple length", "mm", "Hinge to tip, sold in 5 mm steps"],
  ["wrapDeg", "Face-form wrap", "°", "How much the front curves around the face"],
  ["tiltDeg", "Pantoscopic tilt", "°", "Bottom of the front leans toward the cheeks"],
];
const FACE_SLIDERS: [keyof Params, string, string, string][] = [
  ["userPD", "Your PD", "mm", "Pupil to pupil (an optician or app can measure it)"],
  ["headWidth", "Head width at the ears", "mm", "Average adult ~140-155 mm"],
  ["earDistance", "Hinge to top of ear", "mm", "Where the temple should bend"],
];

const inputs: Partial<Record<keyof Params, HTMLInputElement>> = {};
function makeSliders(containerId: string, list: [keyof Params, string, string, string][]) {
  const box = $(containerId);
  for (const [k, name, unit, hint] of list) {
    const [min, max, step] = RANGES[k];
    const wrap = document.createElement("div");
    wrap.className = "slider";
    wrap.innerHTML = `<div class="top"><span></span><span class="val"></span></div><input type="range"><div class="hint"></div>`;
    wrap.querySelector(".top span")!.textContent = name;
    wrap.querySelector(".hint")!.textContent = hint;
    const val = wrap.querySelector(".val") as HTMLElement;
    const input = wrap.querySelector("input")!;
    Object.assign(input, { min, max, step, value: String(params[k]) });
    const show = () => (val.textContent = `${params[k]} ${unit}`);
    show();
    input.addEventListener("input", () => {
      params[k] = Number(input.value);
      show();
      markPreset();
      rebuild();
    });
    inputs[k] = input;
    box.appendChild(wrap);
  }
}
makeSliders("frameSliders", FRAME_SLIDERS);
makeSliders("faceSliders", FACE_SLIDERS);

function syncSliders() {
  for (const [k, input] of Object.entries(inputs) as [keyof Params, HTMLInputElement][]) {
    input.value = String(params[k]);
    input.dispatchEvent(new Event("sync"));
    const val = input.parentElement!.querySelector(".val")!;
    val.textContent = val.textContent!.replace(/^[\d.]+/, String(params[k]));
  }
}

function markPreset() {
  document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) => {
    const pr = PRESETS[b.dataset.preset as PresetId];
    const same = (Object.keys(pr) as (keyof typeof pr)[]).every((k) => pr[k] === params[k]);
    b.classList.toggle("active", same);
  });
}
document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((b) =>
  b.addEventListener("click", () => {
    Object.assign(params, PRESETS[b.dataset.preset as PresetId]);
    syncSliders();
    markPreset();
    rebuild();
  }),
);
markPreset();

const themeSelect = $<HTMLSelectElement>("theme");
for (const t of THEMES) themeSelect.add(new Option(`${t.name} · ${t.game}`, t.id));
function applyTheme() {
  $("themeBlurb").textContent = theme.blurb;
  $("themeNote").textContent = theme.note ?? "";
  stage.style.background = theme.background;
}
themeSelect.addEventListener("change", () => {
  theme = THEMES.find((t) => t.id === themeSelect.value)!;
  applyTheme();
  rebuild();
});
applyTheme();

$<HTMLInputElement>("showHead").addEventListener("change", (e) => {
  view.head = (e.target as HTMLInputElement).checked;
  rebuild();
});
$<HTMLInputElement>("xray").addEventListener("change", (e) => {
  view.xray = (e.target as HTMLInputElement).checked;
  rebuild();
});
$<HTMLInputElement>("spin").addEventListener("change", (e) => (controls.autoRotate = (e.target as HTMLInputElement).checked));
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view!)));

// ---------- exports ----------
function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Printable parts only: frame geometry (no lenses, pads, electronics, decals or guides). */
function exportSTL(parts: string[], name: string) {
  if (!built) return;
  built.root.updateMatrixWorld(true);
  const group = new THREE.Group();
  built.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const kind = o.userData.kind;
    if (mesh.isMesh && (kind === "frame" || kind === "cavity") && parts.includes(o.userData.part)) {
      const copy = new THREE.Mesh(mesh.geometry);
      copy.applyMatrix4(mesh.matrixWorld); // bake its world position into the copy
      group.add(copy);
    }
  });
  group.updateMatrixWorld(true);
  const data = new STLExporter().parse(group, { binary: true }) as DataView;
  download(new Blob([data.buffer as ArrayBuffer], { type: "model/stl" }), `${theme.id}-${sizeLabel(params).replace("□", "x")}-${name}.stl`);
}
$("stlFront").addEventListener("click", () => exportSTL(["front"], "front"));
$("stlTemples").addEventListener("click", () => exportSTL(["temple-left", "temple-right"], "temples"));
$("png").addEventListener("click", () => {
  renderer.render(scene, camera);
  renderer.domElement.toBlob((b) => b && download(b, `${theme.id}-glasses.png`));
});

// ---------- go ----------
rebuild();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});

// Handy for debugging in the browser console.
Object.assign(window, { glasses: { params, get built() { return built; }, rebuild, computeReport: () => built && computeReport(params, built, theme) } });
