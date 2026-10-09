"""STEP 3 — Solid, lit 3D: filled triangles + depth buffer + lighting.

Run:  python step3_shaded.py
Out:  out/step3_shaded.png

New ideas:
  * backface culling — skip triangles facing away (half the work, free)
  * z-buffer        — per-pixel "who is closest" so things overlap correctly
  * flat lighting   — brightness = how directly a face points at the light (dot product)
"""
import math
import os
import time

from lab3d.image import Canvas
from lab3d.mathlib import (cross, dot, look_at, mat_mul, mat_vec, normalize,
                           perspective, rotate_x, rotate_y, sub, translate)
from lab3d.meshes import cube, torus
from lab3d.pipeline import make_mvp, to_screen
from lab3d.raster import triangle

W, H = 480, 360
os.makedirs("out", exist_ok=True)

EYE = [0, 1.2, 6]
LIGHT = normalize([0.6, 0.8, 0.5])      # direction TOWARD the light
view = look_at(EYE, [0, 0, 0])
proj = perspective(55, W / H, 0.1, 100)
canvas = Canvas(W, H)
stats = {"drawn": 0, "culled": 0}


def draw_mesh(vertices, tris, model, base_color):
    mvp = make_mvp(model, view, proj)
    world = [mat_vec(model, v + [1.0])[:3] for v in vertices]
    screen = [to_screen(v, mvp, W, H) for v in vertices]
    for a, b, c in tris:
        # Face normal: perpendicular to the triangle, pointing out of the front side.
        n = normalize(cross(sub(world[b], world[a]), sub(world[c], world[a])))
        # Backface culling: if the normal points away from the eye, we can't see it.
        if dot(n, sub(EYE, world[a])) <= 0:
            stats["culled"] += 1
            continue
        if not (screen[a] and screen[b] and screen[c]):
            continue
        brightness = 0.18 + 0.82 * max(0.0, dot(n, LIGHT))   # ambient + diffuse
        color = tuple(min(255, int(ch * brightness)) for ch in base_color)
        triangle(canvas, screen[a], screen[b], screen[c], color)
        stats["drawn"] += 1


start = time.time()
cv, ct = cube()
draw_mesh(cv, ct, mat_mul(translate(-1.6, 0, 0),
                          mat_mul(rotate_y(math.radians(35)), rotate_x(math.radians(25)))),
          (255, 140, 90))
tv, tt = torus(1.0, 0.38, 36, 18)
draw_mesh(tv, tt, mat_mul(translate(1.4, 0, -0.5), rotate_x(math.radians(55))),
          (110, 200, 255))
canvas.save_png("out/step3_shaded.png")

print(f"Triangles drawn: {stats['drawn']}, culled (facing away): {stats['culled']}")
print(f"Rendered a {W}x{H} frame in {time.time() - start:.2f}s in pure Python.")
print("A game needs 60 frames per second at 1920x1080 — that's why GPUs exist:")
print("they run the inner loop of raster.triangle() for thousands of pixels at once.")
print("Saved out/step3_shaded.png")
