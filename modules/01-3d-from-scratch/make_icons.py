"""Render the Hub's app icon (the one on your iPhone home screen) with OUR renderer.

Run:  python make_icons.py
Out:  ../../hub/public/icons/icon-{180,192,512}.png
"""
import math
import os

from lab3d.image import Canvas
from lab3d.mathlib import (cross, dot, look_at, mat_mul, mat_vec, normalize,
                           perspective, rotate_x, rotate_y, sub)
from lab3d.meshes import cube, cube_edges
from lab3d.pipeline import make_mvp, to_screen
from lab3d.raster import line, triangle

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "hub", "public", "icons")
os.makedirs(OUT, exist_ok=True)
EYE = [0, 0, 5.2]
LIGHT = normalize([0.5, 0.9, 0.7])
FACE_COLORS = [(255, 140, 90), (255, 140, 90), (110, 200, 255), (110, 200, 255),
               (180, 140, 255), (180, 140, 255)]

for size in (180, 192, 512):
    c = Canvas(size, size, background=(10, 12, 20))
    model = mat_mul(rotate_x(math.radians(28)), rotate_y(math.radians(40)))
    mvp = make_mvp(model, look_at(EYE, [0, 0, 0]), perspective(45, 1, 0.1, 50))
    verts, tris = cube()
    world = [mat_vec(model, v + [1.0])[:3] for v in verts]
    scr = [to_screen(v, mvp, size, size) for v in verts]
    for i, (a, b, d) in enumerate(tris):
        n = normalize(cross(sub(world[b], world[a]), sub(world[d], world[a])))
        if dot(n, sub(EYE, world[a])) <= 0:
            continue
        k = 0.25 + 0.75 * max(0.0, dot(n, LIGHT))
        col = tuple(int(ch * k) for ch in FACE_COLORS[i // 2])
        triangle(c, scr[a], scr[b], scr[d], col)
    for a, b in cube_edges():   # thin bright edges on top
        line(c, scr[a][0], scr[a][1], scr[b][0], scr[b][1], (235, 240, 255))
    path = os.path.join(OUT, f"icon-{size}.png")
    c.save_png(path)
    print("Saved", os.path.normpath(path))
