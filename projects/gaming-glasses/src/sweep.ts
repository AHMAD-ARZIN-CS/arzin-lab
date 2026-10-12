// A "sweep" (also called a loft): slide a 2D cross-section along a 3D path and stitch
// the copies together into a tube-like surface. Every rounded part of the frame is a sweep:
// the lens rims (a closed loop), the brow bar, the bridge, the temples and the jelly-bean tips.
//
// The cross-section is a superellipse:  |x/ha|^n + |y/hb|^n = 1
//   n = 2  -> an ellipse,   n = 4 -> a rounded rectangle,   bigger n -> sharper corners.
// Changing ha/hb from slice to slice makes the part thicker or thinner along its length.

import * as THREE from "three";

export interface Slice {
  p: THREE.Vector3; // centre of the cross-section
  aRef: THREE.Vector3; // rough direction of the section's first axis (made exactly perpendicular to the path)
  ha: number; // half-size along that axis (mm)
  hb: number; // half-size along the second axis (mm)
}

export interface SweepOptions {
  closed?: boolean; // true for a loop (lens rim): no end caps
  segments?: number; // points around each cross-section
  exponent?: number; // superellipse n
}

// sign-preserving power: spow(-0.5, 2) = -0.25
const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

export function sweep(slices: Slice[], opts: SweepOptions = {}): THREE.BufferGeometry {
  const closed = opts.closed ?? false;
  const seg = opts.segments ?? 24;
  const n = opts.exponent ?? 4;
  const count = slices.length;
  // A closed loop repeats its first ring at the end so the texture can wrap from u=0 to u=1.
  const rings = closed ? count + 1 : count;

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  // Distance along the path, used as the texture coordinate u (stripes follow the length).
  const cum = [0];
  for (let i = 1; i < count; i++) cum.push(cum[i - 1] + slices[i].p.distanceTo(slices[i - 1].p));
  const total = cum[count - 1] + (closed ? slices[count - 1].p.distanceTo(slices[0].p) : 0);

  const T = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const tangents: THREE.Vector3[] = [];

  for (let k = 0; k < rings; k++) {
    const i = k % count;
    const prev = closed ? slices[(i - 1 + count) % count] : slices[Math.max(i - 1, 0)];
    const next = closed ? slices[(i + 1) % count] : slices[Math.min(i + 1, count - 1)];
    // Tangent T = direction the path is heading here.
    T.subVectors(next.p, prev.p).normalize();
    tangents.push(T.clone());

    // Build a little coordinate frame (a, b, T) at this slice: a is aRef with its
    // T-component removed, and b = T x a, so a x b = T (right-handed).
    const s = slices[i];
    a.copy(s.aRef).addScaledVector(T, -s.aRef.dot(T)).normalize();
    b.crossVectors(T, a);

    const ha = Math.max(s.ha, 1e-4);
    const hb = Math.max(s.hb, 1e-4);
    const u = k < count ? cum[k] / total : 1;

    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const x = spow(c, 2 / n) * ha;
      const y = spow(sn, 2 / n) * hb;
      pos.push(s.p.x + a.x * x + b.x * y, s.p.y + a.y * x + b.y * y, s.p.z + a.z * x + b.z * y);
      // Surface normal = gradient of the superellipse equation (points straight out of the surface).
      nrm.copy(a).multiplyScalar(spow(c, 2 - 2 / n) / ha).addScaledVector(b, spow(sn, 2 - 2 / n) / hb).normalize();
      nor.push(nrm.x, nrm.y, nrm.z);
      uv.push(u, j / seg);
    }
  }

  // Stitch neighbouring rings into triangles. The vertex order is chosen so every
  // triangle faces outward (needed for lighting and for measuring volume later).
  const row = seg + 1;
  for (let k = 0; k < rings - 1; k++) {
    for (let j = 0; j < seg; j++) {
      const v00 = k * row + j;
      const v01 = k * row + j + 1;
      const v10 = (k + 1) * row + j;
      const v11 = (k + 1) * row + j + 1;
      idx.push(v00, v01, v10, v10, v01, v11);
    }
  }

  // Open sweeps get flat caps at both ends, so the mesh is watertight (3D-printable).
  if (!closed) {
    const cap = (k: number, dir: 1 | -1) => {
      const t = tangents[k];
      const base = pos.length / 3;
      const c = slices[k].p;
      pos.push(c.x, c.y, c.z);
      nor.push(t.x * dir, t.y * dir, t.z * dir);
      uv.push(k === 0 ? 0 : 1, 0.5);
      for (let j = 0; j <= seg; j++) {
        const src = (k * row + j) * 3;
        pos.push(pos[src], pos[src + 1], pos[src + 2]);
        nor.push(t.x * dir, t.y * dir, t.z * dir);
        uv.push(k === 0 ? 0 : 1, j / seg);
      }
      for (let j = 0; j < seg; j++) {
        if (dir > 0) idx.push(base, base + 1 + j, base + 2 + j);
        else idx.push(base, base + 2 + j, base + 1 + j);
      }
    };
    cap(0, -1);
    cap(count - 1, 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}
