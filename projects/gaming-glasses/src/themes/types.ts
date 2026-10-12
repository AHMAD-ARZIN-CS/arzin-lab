// A theme is a "skin" for one game or culture. The frame geometry (sizes, fit, electronics
// housings) is shared by every theme; a theme only chooses materials and adds decorations.
// That keeps every design wearable: a theme can't break the fit.

import type * as THREE from "three";
import type { Params } from "../params";

export interface ThemeMaterials {
  rim: THREE.Material;
  brow: THREE.Material; // brow bar = the housing for the display engines
  bridge: THREE.Material;
  temple: THREE.Material;
  tipLeft: THREE.Material; // left tip pod: USB-C + power board
  tipRight: THREE.Material; // right tip pod: battery
  hinge: THREE.Material;
  lens: THREE.Material;
  pad: THREE.Material;
}

export type Kind = "frame" | "cavity" | "pad" | "lens" | "electronics" | "visible-electronics" | "guide" | "decal";
export type Part = "front" | "temple-left" | "temple-right" | "none";

/** Everything a theme needs to place decorations on the frame. */
export interface DecorContext {
  p: Params;
  root: THREE.Group; // world space (not tilted)
  front: THREE.Group; // the front, in its own "flat then wrapped" coordinates
  temples: { left: THREE.Group; right: THREE.Group }; // hinge at origin, arm runs toward -z, +x = outward for the right side
  /** Position + rotation on the front face of the brow bar at a flat x coordinate. */
  browFront(x: number): { pos: THREE.Vector3; rotY: number };
  hinge: { left: THREE.Vector3; right: THREE.Vector3 }; // world positions
  templeHalfThickness: number;
  browHeight: number;
  /** Tag + attach an object so weight, export and x-ray treat it correctly. */
  add<T extends THREE.Object3D>(obj: T, parent: THREE.Object3D, kind: Kind, part: Part): T;
}

export interface Theme {
  id: string;
  name: string;
  game: string;
  blurb: string;
  note?: string; // licensing or other honesty notes, shown in the UI
  background: string; // CSS background behind the 3D view
  lens: { description: string; transmission: number }; // how much light the tint lets through (0-1)
  materials(): ThemeMaterials;
  /** Optional decorative bezel around the camera (centred on the brow's front face, facing +z, max radius 3.6 mm, max depth 2.4 mm). */
  cameraBezel?(): THREE.Object3D;
  decorate?(ctx: DecorContext): void;
}
