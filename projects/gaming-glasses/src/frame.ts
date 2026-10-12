// Builds the whole pair of glasses from the parameters.
//
// Coordinates (millimetres): x = to the wearer's right, y = up, z = forward (away from the face).
// The wearer's head is toward -z. Lens centres sit at y = 0.
//
// Order of construction (like a real frame maker):
//   1. Front, built FLAT: two lens rims, lenses, bridge, brow bar (display housing), nose pads.
//   2. Bend the front with face-form wrap (shapes.ts).
//   3. Tilt the whole front by the pantoscopic angle around the hinge line.
//   4. Hang the temples from the hinges, splayed just enough to clear the wearer's head.
//   5. Put the electronics inside the housings (shown in x-ray mode).

import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { sweep, type Slice } from "./sweep";
import { lensOutline, wrapPoint, applyWrap } from "./shapes";
import type { Params } from "./params";
import type { DecorContext, Kind, Part, Theme } from "./themes/types";

// Construction constants (mm). Chosen from typical acetate/3D-printed frames and the parts inside.
export const RIM_W = 5.5; // rim width seen from the front
export const FRONT_DEPTH = 6; // thickness of the front, front to back
export const BROW_H = 11; // brow bar height: fits a 0.55" micro-OLED display engine (~8 mm tall)
export const BROW_DEPTH = 14; // brow bar depth: fits the engine (~10 mm) + 2 mm walls
export const TEMPLE_HALF_T = 2.6; // temples are 5.2 mm thick: fits the 3 mm main board + walls
export const TEMPLE_DROP = 35; // the curved earpiece after the bend
export const DROP_RADIUS = 45; // radius of that curve
const POD_LEN = 28; // jelly-bean tip pods

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/**
 * Housings are printed hollow: a shell with WALL-thick walls, with the electronics inside.
 * We sweep a second, smaller cross-section along the same path (the cavity) and flip its
 * triangles so they face inward. The outer surface + the inward-facing inner surface together
 * describe a hollow solid. Weight subtracts the cavity, and the STL contains both surfaces,
 * which slicers read as a hollow part.
 */
export const WALL = 1.5;
function cavityOf(slices: Slice[], opts: { segments: number; exponent: number }): THREE.BufferGeometry {
  const inner = sweep(
    slices.map((s) => ({ ...s, ha: Math.max(s.ha - WALL, 0.05), hb: Math.max(s.hb - WALL, 0.05) })),
    opts,
  );
  const index = inner.getIndex()!;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  return inner;
}

export function tag<T extends THREE.Object3D>(obj: T, kind: Kind, part: Part): T {
  obj.traverse((o) => {
    o.userData.kind = kind;
    o.userData.part = part;
  });
  return obj;
}

/** One electronic part, with an estimated mass. Sizes from typical off-the-shelf modules. */
export interface Component {
  name: string;
  massG: number;
  mesh: THREE.Mesh; // the x-ray box (its world position is used for the balance calculation)
}

export interface Built {
  root: THREE.Group;
  front: THREE.Group;
  temples: { left: THREE.Group; right: THREE.Group };
  components: Component[];
  hinge: { left: THREE.Vector3; right: THREE.Vector3 }; // world
  lensCentre: THREE.Vector3; // world, right lens
  noseZ: number; // world z where the nose pads rest
  earZ: number; // world z of the temple bend (rests on the ear)
  bendLength: number; // hinge to bend, along the temple
  splayDeg: number;
}

/** Point and direction on a temple, `s` mm from the hinge. Straight until the bend, then curves down. */
export function templeFrame(s: number, bendAt: number) {
  if (s <= bendAt) return { p: new THREE.Vector3(0, 0, -s), phi: 0 };
  const phi = (s - bendAt) / DROP_RADIUS; // arc length / radius = angle turned
  return {
    p: new THREE.Vector3(0, -DROP_RADIUS * (1 - Math.cos(phi)), -bendAt - DROP_RADIUS * Math.sin(phi)),
    phi,
  };
}

export function buildGlasses(p: Params, theme: Theme): Built {
  const m = theme.materials();
  const root = new THREE.Group();
  const A = p.lensWidth;
  const B = p.lensHeight;
  const halfBridge = p.bridge / 2;
  const wrap = THREE.MathUtils.degToRad(p.wrapDeg);
  const lensCX = halfBridge + A / 2; // lens centre: so the frame PD = A + DBL
  const hingeY = B / 2 - 2; // hinges sit in the upper part of the front
  const browY = B / 2 + RIM_W / 2 + BROW_H / 2 - 2.5; // brow bar rests on top of the rims
  const browFrontZ = FRONT_DEPTH / 2; // flush with the front face of the rims
  const browZ = browFrontZ - BROW_DEPTH / 2; // and extends back over the eyes
  const W = (v: THREE.Vector3) => wrapPoint(v, halfBridge, wrap);
  const bend = (g: THREE.BufferGeometry) => applyWrap(g, halfBridge, wrap);

  // Pantoscopic tilt: rotate the front about a horizontal line through the hinges.
  const tiltPivot = new THREE.Group();
  tiltPivot.position.set(0, hingeY, 0);
  tiltPivot.rotation.x = THREE.MathUtils.degToRad(p.tiltDeg);
  root.add(tiltPivot);
  const front = new THREE.Group();
  front.position.set(0, -hingeY, 0);
  tiltPivot.add(front);

  const add = <T extends THREE.Object3D>(obj: T, parent: THREE.Object3D, kind: Kind, part: Part): T => {
    tag(obj, kind, part);
    parent.add(obj);
    return obj;
  };
  const addFront = (geo: THREE.BufferGeometry, mat: THREE.Material, kind: Kind = "frame") =>
    add(new THREE.Mesh(geo, mat), front, kind, "front");
  // The cavity is never drawn; it only matters for weight and for the STL.
  const addCavity = (shell: THREE.Mesh, geo: THREE.BufferGeometry, part: Part) => {
    const cavity = add(new THREE.Mesh(geo), shell, "cavity", part);
    cavity.visible = false;
  };

  const hingeLocal: Record<number, THREE.Vector3> = {};
  const padCentres: THREE.Vector3[] = [];

  for (const s of [-1, 1]) {
    // ---- Lens rim: sweep a rounded section around the lens outline (a closed loop).
    // The centre line is the lens outline grown by one rim width, so the lens sits in a groove.
    const outline = lensOutline(A + RIM_W, B + RIM_W);
    const slices: Slice[] = outline.map((pt, i) => {
      const prev = outline[(i - 1 + outline.length) % outline.length];
      const next = outline[(i + 1) % outline.length];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.hypot(tx, ty);
      // Outward direction of a counter-clockwise loop = tangent turned 90° clockwise.
      return { p: new THREE.Vector3(s * lensCX + pt.x, pt.y, 0), aRef: new THREE.Vector3(ty / len, -tx / len, 0), ha: RIM_W / 2, hb: FRONT_DEPTH / 2 };
    });
    addFront(bend(sweep(slices, { closed: true, segments: 20, exponent: 3 })), m.rim);

    // ---- Lens: a 2 mm plate, 0.6 mm bigger than the opening all round (it sits in the groove).
    const lensShape = new THREE.Shape(lensOutline(A + 1.2, B + 1.2));
    const lensGeo = new THREE.ExtrudeGeometry(lensShape, { depth: 2, bevelEnabled: false, curveSegments: 1 });
    lensGeo.translate(s * lensCX, 0, -1);
    addFront(bend(lensGeo), m.lens, "lens");

    // ---- End piece: joins the rim's outer edge to the hinge, set back behind the front.
    const outer = halfBridge + A + RIM_W;
    const e0 = W(new THREE.Vector3(s * (outer - 2.5), hingeY, 0));
    const e1 = W(new THREE.Vector3(s * (outer + 0.5), hingeY, -1.5));
    const h = e1.clone().add(new THREE.Vector3(s * 0.8, 0, -5));
    hingeLocal[s] = h;
    const endPath = new THREE.CatmullRomCurve3([e0, e1, h]).getPoints(10);
    addFront(sweep(endPath.map((pt) => ({ p: pt, aRef: Y, ha: 5, hb: 2.8 })), { segments: 16, exponent: 3 }), m.rim);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 10.4, 20), m.hinge);
    barrel.position.copy(h);
    add(barrel, front, "frame", "front");

    // ---- Nose pad on a thin metal arm. Adjustable pads let one frame fit low and high nose bridges.
    const padC = new THREE.Vector3(s * (halfBridge - 0.5), -B * 0.12, -7.5);
    padCentres.push(padC);
    const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m.pad);
    pad.scale.set(1.4, 6.5, 4.5);
    pad.position.copy(padC);
    pad.rotation.set(0, -s * 0.46, s * 0.22); // faces the side of the nose, spreads at the bottom
    add(pad, front, "pad", "front");
    const armPath = [
      new THREE.Vector3(s * (halfBridge - 1.2), -B * 0.04, -1),
      new THREE.Vector3(s * (halfBridge - 1.4), -B * 0.09, -4),
      padC.clone().add(new THREE.Vector3(s * 1.2, 0, 0)),
    ];
    const arm = addFront(sweep(new THREE.CatmullRomCurve3(armPath).getPoints(8).map((pt) => ({ p: pt, aRef: X, ha: 0.7, hb: 0.7 })), { segments: 10, exponent: 2 }), m.hinge);
    arm.userData.density = 4.5; // titanium wire, much denser than the printed frame
  }

  // ---- Bridge: a low arch between the rims (the brow bar above is a second, "double" bridge).
  {
    const xb = halfBridge + RIM_W * 0.4;
    const slices: Slice[] = [];
    for (let k = 0; k <= 16; k++) {
      const x = -xb + (2 * xb * k) / 16;
      slices.push({ p: new THREE.Vector3(x, B * 0.14 + 3 * (1 - (x / xb) ** 2), 0.3), aRef: Z, ha: FRONT_DEPTH * 0.38, hb: 2.3 });
    }
    addFront(bend(sweep(slices, { segments: 16, exponent: 3 })), m.bridge);
  }

  // ---- Brow bar: the housing above the lenses for the two display engines and the camera.
  {
    const xe = halfBridge + A + RIM_W - 1;
    const slices: Slice[] = [];
    for (let k = 0; k <= 64; k++) {
      const x = -xe + (2 * xe * k) / 64;
      const d = xe - Math.abs(x);
      const f = d < 3 ? Math.sqrt(Math.max(d, 0.05) / 3) : 1; // round off the ends
      slices.push({ p: new THREE.Vector3(x, browY, browZ), aRef: Z, ha: (BROW_DEPTH / 2) * f, hb: (BROW_H / 2) * f });
    }
    const opts = { segments: 24, exponent: 3.5 };
    const brow = addFront(bend(sweep(slices, opts)), m.brow);
    addCavity(brow, bend(cavityOf(slices, opts)), "front");
  }

  // ---- Camera (centre of the brow) with a privacy LED: a camera on your face must show when it's on.
  const camC = new THREE.Vector3(0, browY, browFrontZ);
  const bezel =
    theme.cameraBezel?.() ??
    (() => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 2.4, 28), m.brow);
      c.rotation.x = Math.PI / 2;
      c.position.z = 1.2;
      const g = new THREE.Group();
      g.add(c);
      return g;
    })();
  bezel.position.copy(camC);
  add(bezel, front, "frame", "front");
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0a14, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
  const camLens = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.8, 24), glass);
  camLens.rotation.x = Math.PI / 2;
  camLens.position.copy(camC).add(new THREE.Vector3(0, 0, 2.6));
  add(camLens, front, "visible-electronics", "front");
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9dffb0, emissiveIntensity: 1.5 }));
  led.position.set(5.4, browY - 2.6, browFrontZ + 0.3);
  add(led, front, "visible-electronics", "front");

  // ---- Electronics inside the front (x-ray boxes).
  const components: Component[] = [];
  const xrayMat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const component = (name: string, massG: number, size: [number, number, number], color: number, parent: THREE.Object3D, part: Part, pos: THREE.Vector3, rot = new THREE.Euler()) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), xrayMat(color));
    mesh.position.copy(pos);
    mesh.rotation.copy(rot);
    const el = document.createElement("div");
    el.className = "xray-label";
    el.textContent = name;
    const label = new CSS2DObject(el);
    mesh.add(label);
    add(mesh, parent, "electronics", part);
    components.push({ name, massG, mesh });
  };
  for (const s of [-1, 1]) {
    component(`Display engine ${s < 0 ? "L" : "R"} (0.55" micro-OLED + optics)`, 8, [16, 8, 10], 0x22d3ee, front, "front", W(new THREE.Vector3(s * lensCX, browY - 0.5, browZ)), new THREE.Euler(0, s * wrap, 0));
  }
  component("Camera module", 1, [6, 6, 4], 0xf472b6, front, "front", new THREE.Vector3(0, browY, browFrontZ - 3.2));

  // Tilt is applied; now we can read world positions of the hinges.
  root.updateMatrixWorld(true);
  const hingeWorld = {
    left: hingeLocal[-1].clone().applyMatrix4(front.matrixWorld),
    right: hingeLocal[1].clone().applyMatrix4(front.matrixWorld),
  };
  const lensCentre = new THREE.Vector3(lensCX, 0, 0).applyMatrix4(front.matrixWorld);

  // ---- Temples. Splay = how far each temple angles outward so its inner face just touches
  // the head above the ear: sin(splay) = (head half-width + half thickness - hinge x) / length to bend.
  const bendAt = p.temple - TEMPLE_DROP;
  const splay = Math.asin(THREE.MathUtils.clamp((p.headWidth / 2 + TEMPLE_HALF_T - hingeWorld.right.x) / bendAt, -0.1, 0.25));
  const temples: Record<number, THREE.Group> = {};

  for (const s of [-1, 1]) {
    const part: Part = s < 0 ? "temple-left" : "temple-right";
    const tg = new THREE.Group();
    tg.position.copy(s < 0 ? hingeWorld.left : hingeWorld.right);
    tg.rotation.y = -s * splay;
    root.add(tg);
    temples[s] = tg;

    // Arm: tall near the hinge (room for the board), slimmer toward the ear.
    const armEnd = p.temple - POD_LEN + 8; // ends inside the pod
    const arm: Slice[] = [];
    for (let u = 0; u <= armEnd; u += 1.5) {
      let hb = u < 4 ? 4.2 + (u / 4) * 1 : u < bendAt ? 5.2 - ((u - 4) / (bendAt - 4)) * 1.8 : 3.4;
      if (armEnd - u < 4) hb *= 0.6 + 0.1 * (armEnd - u);
      arm.push({ p: templeFrame(u, bendAt).p, aRef: X, ha: TEMPLE_HALF_T, hb });
    }
    add(new THREE.Mesh(sweep(arm, { segments: 20, exponent: 3.5 }), m.temple), tg, "frame", part);

    // Jelly-bean tip pod: sits behind the ear, which moves weight off the nose. It bulges
    // outward only (offset +x), so nothing presses on the skin behind the ear.
    const pod: Slice[] = [];
    for (let u = p.temple - POD_LEN; u <= p.temple + 1e-6; u += 0.7) {
      const t = (u - (p.temple - POD_LEN)) / POD_LEN;
      const f = Math.max(0.03, Math.sqrt(Math.sin(Math.PI * Math.min(t, 1))));
      pod.push({ p: templeFrame(u, bendAt).p.add(new THREE.Vector3(s * 1.6, 0, 0)), aRef: X, ha: 4.3 * f, hb: 5.9 * f });
    }
    const podOpts = { segments: 24, exponent: 2.2 };
    const podMesh = add(new THREE.Mesh(sweep(pod, podOpts), s < 0 ? m.tipLeft : m.tipRight), tg, "frame", part);
    addCavity(podMesh, cavityOf(pod, podOpts), part);

    // Electronics in the temples.
    const at = (u: number, dx = 0) => {
      const f = templeFrame(u, bendAt);
      return { pos: f.p.add(new THREE.Vector3(dx, 0, 0)), rot: new THREE.Euler(-f.phi, 0, 0) };
    };
    const spk = at(bendAt - 18, -s * 0.8);
    component(`Open-ear speaker ${s < 0 ? "L" : "R"}`, 1.5, [2, 5, 12], 0xa78bfa, tg, part, spk.pos);
    if (s < 0) {
      component("Main board (USB 3 display bridge, mic, IMU)", 4, [3, 7, 35], 0x4ade80, tg, part, new THREE.Vector3(0, 0, -29.5));
      // USB-C on the UNDERSIDE of the pod: the cable to the PC drops down behind the ear.
      const usb = templeFrame(p.temple - 12, bendAt);
      const down = new THREE.Vector3(0, -Math.cos(usb.phi), Math.sin(usb.phi));
      component("USB-C port + power board", 2, [3.3, 7, 8.9], 0xfacc15, tg, part, usb.p.clone().add(new THREE.Vector3(s * 1.6, 0, 0)).addScaledVector(down, 2), new THREE.Euler(-usb.phi, 0, 0));
      const port = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 8.4), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 }));
      port.position.copy(usb.p).add(new THREE.Vector3(s * 1.6, 0, 0)).addScaledVector(down, 5.6);
      port.rotation.x = -usb.phi;
      add(port, tg, "visible-electronics", part);
    } else {
      const bat = at(p.temple - 14, s * 1.6);
      component("LiPo cell ~150 mAh (untethered mode)", 4, [5, 9, 20], 0xfb923c, tg, part, bat.pos, bat.rot);
    }
  }

  root.updateMatrixWorld(true);
  const earPoint = templeFrame(bendAt, bendAt).p.applyMatrix4(temples[1].matrixWorld);
  const noseZ = padCentres[0].clone().applyMatrix4(front.matrixWorld).z;

  const built: Built = {
    root,
    front,
    temples: { left: temples[-1], right: temples[1] },
    components,
    hinge: hingeWorld,
    lensCentre,
    noseZ,
    earZ: earPoint.z,
    bendLength: bendAt,
    splayDeg: THREE.MathUtils.radToDeg(splay),
  };

  // ---- Theme decorations last, so they can use every position computed above.
  if (theme.decorate) {
    const ctx: DecorContext = {
      p,
      root,
      front,
      temples: built.temples,
      hinge: hingeWorld,
      templeHalfThickness: TEMPLE_HALF_T,
      browHeight: BROW_H,
      browFront: (x: number) => ({
        pos: W(new THREE.Vector3(x, browY, browFrontZ)),
        rotY: Math.abs(x) > halfBridge ? Math.sign(x) * wrap : 0,
      }),
      add,
    };
    theme.decorate(ctx);
    root.updateMatrixWorld(true);
  }
  return built;
}
