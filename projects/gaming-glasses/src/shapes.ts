// 2D lens shape and the "wrap" bend applied to the whole front.

import * as THREE from "three";

const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

/**
 * Outline of one lens, centred on (0,0), counter-clockwise.
 * A soft square (superellipse, n about 3) whose bottom is a little narrower than its top:
 * the classic "wayfarer" shape that suits most face shapes.
 * A and B are the width and height of the box around it (boxing system).
 */
export function lensOutline(A: number, B: number, points = 96, n = 3.2, taper = 0.12): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let k = 0; k < points; k++) {
    const th = (k / points) * Math.PI * 2;
    let x = spow(Math.cos(th), 2 / n) * (A / 2);
    const y = spow(Math.sin(th), 2 / n) * (B / 2);
    if (y < 0) x *= 1 - taper * (-y / (B / 2)); // narrow the bottom
    out.push(new THREE.Vector2(x, y));
  }
  return out;
}

/**
 * Face-form wrap. Real frames are not flat: each lens is turned back a few degrees so the
 * frame follows the curve of the face. We build the front flat, then rotate everything
 * outside the bridge about a vertical line at the lens's nasal edge (x = ±halfBridge).
 * Rotation about the y axis by angle w:  x' = x cos w + z sin w,  z' = -x sin w + z cos w
 */
export function wrapPoint(v: THREE.Vector3, halfBridge: number, wrap: number): THREE.Vector3 {
  const side = Math.sign(v.x) || 1;
  const dx = Math.abs(v.x) - halfBridge;
  if (dx <= 0 || wrap === 0) return v;
  const c = Math.cos(wrap);
  const s = Math.sin(wrap);
  const x2 = dx * c + v.z * s;
  const z2 = -dx * s + v.z * c;
  v.x = side * (halfBridge + x2);
  v.z = z2;
  return v;
}

/** Same bend applied to every vertex (and normal) of a geometry. */
export function applyWrap(geo: THREE.BufferGeometry, halfBridge: number, wrap: number): THREE.BufferGeometry {
  if (wrap === 0) return geo;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nor = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const c = Math.cos(wrap);
  const s = Math.sin(wrap);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const side = Math.sign(x) || 1;
    const dx = Math.abs(x) - halfBridge;
    if (dx <= 0) continue;
    pos.setX(i, side * (halfBridge + dx * c + z * s));
    pos.setZ(i, -dx * s + z * c);
    if (nor) {
      const nx = side * nor.getX(i); // mirror the left side so one formula serves both
      const nz = nor.getZ(i);
      nor.setX(i, side * (nx * c + nz * s));
      nor.setZ(i, -nx * s + nz * c);
    }
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}
