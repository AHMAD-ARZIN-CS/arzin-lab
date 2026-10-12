// A simple see-through head for checking fit. Not an anatomical model: an ellipsoid head,
// two eyes at your PD, a nose, and ears at your "hinge to ear" distance.

import * as THREE from "three";
import type { Built } from "./frame";
import type { Params } from "./params";

export function buildHeadGuide(p: Params, built: Built): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: "#c98a63", transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.8 });

  const eyeY = built.lensCentre.y;
  const lensBackZ = built.lensCentre.z - 1;
  const earZ = built.hinge.right.z - p.earDistance;

  // Vertex distance (back of the lens to the cornea) is usually 12-14 mm; an eyeball is ~24 mm across.
  const corneaZ = lensBackZ - 12;
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 });
  const irisMat = new THREE.MeshStandardMaterial({ color: "#3b6ea8", roughness: 0.3 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(12, 32, 20), eyeMat);
    eye.position.set((s * p.userPD) / 2, eyeY, corneaZ - 12);
    g.add(eye);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32), irisMat);
    iris.position.set((s * p.userPD) / 2, eyeY, corneaZ + 0.05);
    g.add(iris);
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(5, 40, 6, 12), skin);
    ear.position.set((s * p.headWidth) / 2, built.hinge.right.y - 22, earZ - 4);
    ear.rotation.x = -0.25;
    g.add(ear);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), skin);
  head.scale.set(p.headWidth / 2, 115, 100);
  head.position.set(0, eyeY + 22, earZ);
  g.add(head);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin);
  nose.scale.set(7.5, 22, 14);
  nose.position.set(0, eyeY - 14, earZ + 100 - 9);
  g.add(nose);

  g.traverse((o) => (o.userData.kind = "guide"));
  return g;
}
