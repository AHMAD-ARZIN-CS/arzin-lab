// Textures drawn with the 2D canvas API at runtime (no image files to manage).

import * as THREE from "three";

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Diagonal candy stripes that tile seamlessly. On a sweep, u runs along the length and v
 * around the tube, so diagonal stripes in the texture become a spiral, like a candy cane.
 */
export function stripes(base: string, stripe: string, bands = 4, repeatU = 1): THREE.CanvasTexture {
  const S = 256;
  const tex = canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);
    const period = S / bands; // the tile width is a whole number of periods, so the edges line up
    ctx.strokeStyle = stripe;
    ctx.lineWidth = period * 0.32;
    for (let i = -bands; i <= bands * 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * period, 0);
      ctx.lineTo(i * period - S, S);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatU, 1);
  return tex;
}

/** Bubbly game-style lettering on a transparent background. */
export function lettering(text: string, top: string, bottom: string, outline: string): THREE.CanvasTexture {
  return canvasTexture(1024, 224, (ctx) => {
    ctx.font = 'bold 150px "Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const grad = ctx.createLinearGradient(0, 40, 0, 184);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.lineWidth = 30;
    ctx.strokeStyle = outline;
    ctx.strokeText(text, 512, 116);
    ctx.fillStyle = grad;
    ctx.fillText(text, 512, 112);
  });
}

/** Soft round shadow for the floor under the model. */
export function softShadow(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(40,20,60,0.45)");
    g.addColorStop(1, "rgba(40,20,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}
