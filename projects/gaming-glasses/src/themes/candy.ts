// Candy Crush theme. Built from simple 3D primitives in the spirit of the game's six candies,
// with glossy "hard candy" materials (clearcoat = a thin shiny layer on top, like sugar glaze).
// No artwork from the game is copied; the name is used as text only.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { DecorContext, Theme } from "./types";
import { lettering, stripes } from "./textures";

const CANDY = {
  red: "#ff2a4a",
  orange: "#ff8a1f",
  yellow: "#ffd31a",
  green: "#2fd05a",
  blue: "#2b8cff",
  purple: "#9b3df5",
  pink: "#ff4f9a",
  chocolate: "#5a2e1a",
};

const glossy = (color: string, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    emissive: color,
    emissiveIntensity: 0.06, // a touch of glow so the colours stay bright in shadow
    ...extra,
  });

// Small deterministic random generator, so the sprinkles land in the same places every build.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

// ---- The six candies, each about 7 mm, built at the origin facing +z.
function jellyBean(): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(1.9, 3.2, 6, 16), glossy(CANDY.red));
  m.rotation.z = Math.PI / 2;
  m.scale.set(1, 1, 0.75);
  return m;
}
function lozenge(): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), glossy(CANDY.orange));
  m.scale.set(3.4, 2.4, 1.6);
  return m;
}
function lemonDrop(): THREE.Object3D {
  // A lathe spins a 2D profile around the y axis, like a pottery wheel.
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 20; k++) {
    const a = (k / 20) * Math.PI;
    const narrowTop = 1 - 0.45 * ((1 - Math.cos(a)) / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * 2.7 * narrowTop + 1e-3, -Math.cos(a) * 3.4));
  }
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), glossy(CANDY.yellow));
  m.scale.set(1, 1, 0.7);
  return m;
}
function greenSquare(): THREE.Object3D {
  return new THREE.Mesh(new RoundedBoxGeometry(5.2, 5.2, 2.8, 3, 1.1), glossy(CANDY.green));
}
function blueOrb(): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.SphereGeometry(2.7, 28, 18), glossy(CANDY.blue));
  m.scale.set(1, 1, 0.75);
  return m;
}
function purpleFlower(): THREE.Object3D {
  const g = new THREE.Group();
  const mat = glossy(CANDY.purple);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 12), mat);
    petal.position.set(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0);
    petal.scale.z = 0.7;
    g.add(petal);
  }
  const centre = new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 12), glossy("#d6b3ff"));
  centre.position.z = 0.4;
  g.add(centre);
  return g;
}

export const candyCrush: Theme = {
  id: "candy-crush",
  name: "Candy Crush",
  game: "Candy Crush Saga (King)",
  blurb:
    "Glossy hard-candy frame: pink rims, a grape brow bar with the six candies, candy-cane temples, wrapped-candy hinges, jelly-bean tip pods and a colour-bomb camera.",
  note: '"Candy Crush" is a trademark of King. This is a private learning prototype; selling it would need a licence from King.',
  background: "radial-gradient(circle at 25% 15%, #fff0f7 0%, #ffd3ea 30%, #cdb8ff 65%, #9fd8ff 100%)",
  lens: { description: "Rose tint, ~90% light through: ISO 12312-1 category 0 (indoor use)", transmission: 0.9 },

  materials() {
    return {
      rim: glossy(CANDY.pink),
      brow: glossy("#7c3aed"),
      bridge: glossy(CANDY.pink),
      temple: new THREE.MeshPhysicalMaterial({ map: stripes("#ff5fa8", "#ffffff", 4, 10), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 }),
      tipLeft: glossy(CANDY.blue, { roughness: 0.15 }),
      tipRight: glossy(CANDY.red, { roughness: 0.15 }),
      hinge: new THREE.MeshPhysicalMaterial({ color: "#f5c542", metalness: 0.9, roughness: 0.25 }),
      lens: new THREE.MeshPhysicalMaterial({ color: "#ffd9ec", transmission: 0.9, roughness: 0.03, thickness: 2, ior: 1.586, transparent: true, opacity: 1 }),
      pad: new THREE.MeshPhysicalMaterial({ color: "#ffffff", transmission: 0.6, roughness: 0.35, thickness: 2 }),
    };
  },

  // Colour bomb: a chocolate ball covered in sprinkles, with the camera lens in its centre.
  cameraBezel() {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(3.6, 32, 20), glossy(CANDY.chocolate, { roughness: 0.45, emissiveIntensity: 0 }));
    ball.scale.z = 0.66;
    g.add(ball);
    const rand = rng(7);
    const colours = [CANDY.red, CANDY.orange, CANDY.yellow, CANDY.green, CANDY.blue, "#ffffff"];
    for (let k = 0; k < 42; k++) {
      const theta = THREE.MathUtils.degToRad(32 + rand() * 55); // keep clear of the lens in the middle
      const phi = rand() * Math.PI * 2;
      const n = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta));
      const sprinkle = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.8, 3, 6), glossy(colours[k % colours.length]));
      sprinkle.position.set(n.x * 3.6, n.y * 3.6, n.z * 3.6 * 0.66);
      sprinkle.lookAt(sprinkle.position.clone().add(n));
      sprinkle.rotateZ(rand() * Math.PI);
      sprinkle.rotateX(Math.PI / 2);
      sprinkle.userData.decal = true;
      g.add(sprinkle);
    }
    return g;
  },

  decorate(ctx: DecorContext) {
    // Sprinkles are painted on in real life: not counted as printed frame material.
    ctx.front.traverse((o) => {
      if (o.userData.decal) {
        o.userData.kind = "decal";
      }
    });

    // Six candies along the brow bar, three each side of the camera.
    const A = ctx.p.lensWidth;
    const hb = ctx.p.bridge / 2;
    const spots: [number, () => THREE.Object3D][] = [
      [-(hb + A * 0.78), jellyBean],
      [-(hb + A * 0.5), lozenge],
      [-(hb + A * 0.22), lemonDrop],
      [hb + A * 0.22, greenSquare],
      [hb + A * 0.5, blueOrb],
      [hb + A * 0.78, purpleFlower],
    ];
    for (const [x, make] of spots) {
      const { pos, rotY } = ctx.browFront(x);
      const candy = make();
      const holder = new THREE.Group();
      holder.add(candy);
      holder.position.copy(pos).add(new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)).multiplyScalar(0.6));
      holder.rotation.y = rotY;
      ctx.add(holder, ctx.front, "frame", "front");
    }

    // Wrapped candies over the hinges: a striped body with a cellophane twist above and below.
    const wrapper = new THREE.MeshPhysicalMaterial({ map: stripes(CANDY.yellow, CANDY.red, 3, 2), roughness: 0.2, clearcoat: 1 });
    const twist = new THREE.MeshPhysicalMaterial({ color: "#ffe680", roughness: 0.15, clearcoat: 1, transmission: 0.4, thickness: 1 });
    for (const [s, h] of [[-1, ctx.hinge.left], [1, ctx.hinge.right]] as const) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(4, 28, 18), wrapper);
      body.scale.set(0.85, 1.1, 0.85);
      g.add(body);
      for (const dir of [1, -1]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 16), twist);
        cone.position.y = dir * (4.4 + 1.7);
        if (dir > 0) cone.rotation.x = Math.PI; // point toward the body
        g.add(cone);
      }
      g.position.copy(h).add(new THREE.Vector3(s * 2.2, 0, 0));
      ctx.add(g, ctx.root, "frame", "front");
    }

    // Name on the outside of each temple (would be pad-printed, so it's a decal, not geometry).
    const tex = lettering("Candy Crush", "#fff27a", "#ff7a1a", "#5b1a8f");
    for (const [s, tg] of [[-1, ctx.temples.left], [1, ctx.temples.right]] as const) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(36, 7.9),
        new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.4 }),
      );
      plane.position.set(s * (ctx.templeHalfThickness + 0.08), 0.6, -33);
      plane.rotation.y = (s * Math.PI) / 2; // face outward, read from front to back
      ctx.add(plane, tg, "decal", s < 0 ? "temple-left" : "temple-right");
    }
  },
};
