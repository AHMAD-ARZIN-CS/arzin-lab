"""STEP 2 — Connect the dots: a wireframe cube, spinning.

Run:  python step2_wireframe.py
Out:  out/step2_wireframe_0.png ... _3.png

New idea: lines between projected points (Bresenham), and animation =
the same scene re-drawn with a slightly different model matrix each frame.
"""
import math
import os

from lab3d.image import Canvas
from lab3d.mathlib import look_at, mat_mul, perspective, rotate_x, rotate_y
from lab3d.meshes import cube, cube_edges
from lab3d.pipeline import make_mvp, to_screen
from lab3d.raster import line

W, H = 480, 360
os.makedirs("out", exist_ok=True)

vertices, _ = cube()
view = look_at(eye=[0, 0, 5], target=[0, 0, 0])
proj = perspective(60, W / H, 0.1, 100)

for frame in range(4):
    angle = math.radians(20 + frame * 20)     # each frame turns 20 degrees more
    model = mat_mul(rotate_y(angle), rotate_x(math.radians(20)))
    mvp = make_mvp(model, view, proj)
    pts = [to_screen(v, mvp, W, H) for v in vertices]

    canvas = Canvas(W, H)
    for a, b in cube_edges():
        if pts[a] and pts[b]:
            line(canvas, pts[a][0], pts[a][1], pts[b][0], pts[b][1], (120, 220, 255))
    canvas.save_png(f"out/step2_wireframe_{frame}.png")
    print(f"Saved out/step2_wireframe_{frame}.png")
