// A plain theme: the same frame with no decorations. Useful to judge the shape and fit,
// and the starting point for new game or culture themes.

import * as THREE from "three";
import type { Theme } from "./types";

const satin = (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 });

export const classic: Theme = {
  id: "classic",
  name: "Classic graphite",
  game: "Any game",
  blurb: "The base frame with no theme: matte graphite with clear lenses. Every theme shares this shape and fit.",
  background: "radial-gradient(circle at 25% 15%, #f4f6fa 0%, #dfe4ee 50%, #c3cad8 100%)",
  lens: { description: "Clear, ~92% light through: ISO 12312-1 category 0", transmission: 0.92 },
  materials() {
    const body = satin("#2b2f38");
    return {
      rim: body,
      brow: satin("#1f2229"),
      bridge: body,
      temple: body,
      tipLeft: satin("#1f2229"),
      tipRight: satin("#1f2229"),
      hinge: new THREE.MeshPhysicalMaterial({ color: "#b8bec9", metalness: 0.9, roughness: 0.3 }),
      lens: new THREE.MeshPhysicalMaterial({ color: "#f4f8ff", transmission: 0.92, roughness: 0.03, thickness: 2, ior: 1.586 }),
      pad: new THREE.MeshPhysicalMaterial({ color: "#ffffff", transmission: 0.6, roughness: 0.35, thickness: 2 }),
    };
  },
};
