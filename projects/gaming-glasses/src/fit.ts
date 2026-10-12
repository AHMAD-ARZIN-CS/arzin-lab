// Fit and comfort checks, computed from the real 3D model.
//
// Weight: the volume of every closed mesh, using the "signed tetrahedron" trick. Each triangle
// plus the origin forms a tetrahedron with volume  a · (b × c) / 6. Triangles facing away from
// the origin add, triangles facing toward it subtract, and the sum is exactly the enclosed volume.
// Each tetrahedron's centroid is (a + b + c + origin) / 4, which also gives the centre of mass.
//
// Balance: glasses rest on two supports, the nose pads and the tops of the ears. Treating the
// glasses as a beam on two supports (a lever), the share of weight on the ears is
//   (z_nose - z_centreOfMass) / (z_nose - z_ear)

import * as THREE from "three";
import type { Built } from "./frame";
import type { Params } from "./params";
import type { Theme } from "./themes/types";

export type Level = "ok" | "warn" | "bad" | "info";
export interface Check {
  level: Level;
  title: string;
  detail: string;
}
export interface Report {
  frameG: number;
  lensG: number;
  electronicsG: number;
  totalG: number;
  earShare: number;
  checks: Check[];
}

// g/cm³. PA12 nylon is the usual material for 3D-printed (SLS) eyewear: light, tough, skin-safe once dyed and sealed.
const DENSITY: Record<string, number> = { frame: 1.01, cavity: 1.01, pad: 1.1, lens: 1.2 };

function volumeAndCentroid(mesh: THREE.Mesh) {
  const g = mesh.geometry;
  const pos = g.getAttribute("position");
  const index = g.getIndex();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const moment = new THREE.Vector3();
  let vol = 0;
  const tris = index ? index.count / 3 : pos.count / 3;
  for (let t = 0; t < tris; t++) {
    const ia = index ? index.getX(3 * t) : 3 * t;
    const ib = index ? index.getX(3 * t + 1) : 3 * t + 1;
    const ic = index ? index.getX(3 * t + 2) : 3 * t + 2;
    a.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
    const v = a.dot(cross.crossVectors(b, c)) / 6;
    vol += v;
    moment.x += (v * (a.x + b.x + c.x)) / 4;
    moment.y += (v * (a.y + b.y + c.y)) / 4;
    moment.z += (v * (a.z + b.z + c.z)) / 4;
  }
  // Signed: a cavity (triangles facing inward) comes out negative, which is exactly what
  // we want to subtract it. The centroid is the same either way (both sums flip sign).
  return { signedMm3: vol, centroid: vol !== 0 ? moment.divideScalar(vol) : new THREE.Vector3() };
}

export function computeReport(p: Params, built: Built, theme: Theme): Report {
  built.root.updateMatrixWorld(true);
  let frameG = 0;
  let lensG = 0;
  const com = new THREE.Vector3();
  let massSum = 0;

  built.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const kind = o.userData.kind as string;
    if (!(kind in DENSITY)) return;
    const { signedMm3, centroid } = volumeAndCentroid(mesh);
    const mm3 = kind === "cavity" ? signedMm3 : Math.abs(signedMm3); // cavities stay negative
    const grams = (mm3 / 1000) * (o.userData.density ?? DENSITY[kind]); // mm³ -> cm³ -> g
    if (kind === "lens") lensG += grams;
    else frameG += grams;
    com.addScaledVector(centroid, grams);
    massSum += grams;
  });

  let electronicsG = 0;
  const wp = new THREE.Vector3();
  for (const c of built.components) {
    electronicsG += c.massG;
    c.mesh.getWorldPosition(wp);
    com.addScaledVector(wp, c.massG);
    massSum += c.massG;
  }
  com.divideScalar(massSum);
  const totalG = frameG + lensG + electronicsG;
  const earShare = THREE.MathUtils.clamp((built.noseZ - com.z) / (built.noseZ - built.earZ), 0, 1);

  const checks: Check[] = [];
  const f1 = (n: number) => n.toFixed(1);

  // 1. Display / lens centring vs the wearer's PD.
  const framePD = p.lensWidth + p.bridge;
  const decentre = Math.abs(framePD - p.userPD) / 2;
  checks.push({
    level: decentre <= 4 ? "ok" : decentre <= 6 ? "warn" : "bad",
    title: `Display centring: ${f1(decentre)} mm per eye`,
    detail: `Frame PD (A + DBL) = ${framePD} mm, your PD = ${p.userPD} mm. Each display and lens centre sits ${f1(decentre)} mm from your pupil. Design target: 4 mm or less (shifted in software); otherwise pick a ${framePD > p.userPD ? "smaller" : "bigger"} lens width.`,
  });

  // 2. Temple splay vs head width.
  const sp = built.splayDeg;
  checks.push({
    level: sp >= -2 && sp <= 8 ? "ok" : sp >= -5 && sp <= 12 ? "warn" : "bad",
    title: `Temple spread: ${f1(sp)}° outward`,
    detail:
      sp > 8
        ? "The front is narrow for your head: the temples must spread a lot and will squeeze. Try size L or a wider bridge."
        : sp < -2
          ? "The front is wide for your head: the temples angle inward and the glasses will slide. Try size S."
          : "The temples reach your head with a gentle angle, so the grip is light and even.",
  });

  // 3. Length to bend vs the ear.
  const diff = built.bendLength - p.earDistance;
  checks.push({
    level: Math.abs(diff) <= 5 ? "ok" : Math.abs(diff) <= 10 ? "warn" : "bad",
    title: `Temple bend: ${diff >= 0 ? "+" : ""}${f1(diff)} mm from your ear`,
    detail: `Length to bend = temple ${p.temple} − ${p.temple - built.bendLength} mm drop = ${built.bendLength} mm. It should land on top of the ear (±5 mm), or the glasses slide forward or press behind the ear.`,
  });

  // 4. Pantoscopic tilt.
  checks.push({
    level: p.tiltDeg >= 6 && p.tiltDeg <= 12 ? "ok" : p.tiltDeg >= 3 && p.tiltDeg <= 15 ? "warn" : "bad",
    title: `Pantoscopic tilt: ${p.tiltDeg}°`,
    detail: "Typical range 8-12°: the lens stays square to your gaze when you look slightly down at a screen, and the bottom rim doesn't touch your cheeks.",
  });

  // 5. Face-form wrap.
  checks.push({
    level: p.wrapDeg <= 7 ? "ok" : p.wrapDeg <= 12 ? "warn" : "bad",
    title: `Face-form wrap: ${p.wrapDeg}°`,
    detail: "Up to ~7° works with normal prescription lenses and flat displays. More wrap looks sporty but needs wrap-compensated lenses and distorts the display image.",
  });

  // 6. Weight.
  checks.push({
    level: totalG <= 75 ? "ok" : totalG <= 90 ? "warn" : "bad",
    title: `Weight: about ${Math.round(totalG)} g`,
    detail: `Frame ${f1(frameG)} g (printed PA12 nylon, housings hollow with ${1.5} mm walls) + lenses ${f1(lensG)} g + electronics ${f1(electronicsG)} g. Comfortable for long sessions at 75 g or less; tethered AR display glasses are commonly ~70-80 g.`,
  });

  // 7. Balance.
  const nose = 1 - earShare;
  checks.push({
    level: nose <= 0.7 ? "ok" : nose <= 0.85 ? "warn" : "bad",
    title: `Balance: ${Math.round(nose * 100)}% on the nose, ${Math.round(earShare * 100)}% on the ears`,
    detail: "Front-heavy glasses press on the nose and slide down. Putting the battery and port in the tip pods behind the ears pulls the centre of mass back. (Lever estimate; target 70% or less on the nose.)",
  });

  // 8-9. Information.
  checks.push({ level: "info", title: "Lens tint", detail: theme.lens.description + ". Gaming is indoors, so no dark tint (dark lenses indoors strain your eyes)." });
  checks.push({
    level: "info",
    title: "Camera privacy LED",
    detail: "A white LED next to the camera lights whenever the camera records. People around you must be able to tell, and many smart-glasses rules and app stores require it.",
  });

  return { frameG, lensG, electronicsG, totalG, earShare, checks };
}
