"""STEP 1 — Project the 8 corners of a cube onto a 2D image.

Run:  python step1_points.py
Out:  out/step1_points.png  + a printout of one vertex's full journey.

New idea: perspective projection. Nothing is drawn but dots — yet it already looks 3D.
"""
import math
import os

from lab3d.image import Canvas
from lab3d.mathlib import look_at, mat_mul, mat_vec, perspective, rotate_x, rotate_y
from lab3d.meshes import cube
from lab3d.pipeline import make_mvp, to_screen

W, H = 480, 360
os.makedirs("out", exist_ok=True)

vertices, _ = cube()
model = mat_mul(rotate_y(math.radians(30)), rotate_x(math.radians(20)))
view = look_at(eye=[0, 0, 5], target=[0, 0, 0])
proj = perspective(fov_y_deg=60, aspect=W / H, near=0.1, far=100)
mvp = make_mvp(model, view, proj)

canvas = Canvas(W, H)
for v in vertices:
    p = to_screen(v, mvp, W, H)
    if p:
        x, y, _ = p
        for dx in range(-2, 3):          # a 5x5 dot so you can see it
            for dy in range(-2, 3):
                canvas.set(int(x) + dx, int(y) + dy, (120, 220, 255))
canvas.save_png("out/step1_points.png")


# ---- Follow ONE corner through every stage, with real numbers ----
def fmt(v):
    return "[" + ", ".join(f"{c:7.3f}" for c in v) + "]"


v = vertices[6] + [1.0]                  # corner (1, 1, 1), w = 1 means "a point"
world = mat_vec(model, v)
camera = mat_vec(view, world)
clip = mat_vec(proj, camera)
ndc = [c / clip[3] for c in clip[:3]]
screen = to_screen(vertices[6], mvp, W, H)

print("Journey of corner (1, 1, 1):")
print("  model  space", fmt(v))
print("  world  space", fmt(world), " <- rotated")
print("  camera space", fmt(camera), " <- z is negative = in front of the camera")
print("  clip   space", fmt(clip), " <- notice w = -camera.z (distance)")
print("  NDC         ", fmt(ndc), " <- divided by w, now inside [-1, 1]")
print(f"  screen pixel  ({screen[0]:.1f}, {screen[1]:.1f}) on a {W}x{H} image")
print("Saved out/step1_points.png")
