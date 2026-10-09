# Module 01: 3D from scratch

**Goal:** understand exactly how a 3D world becomes a 2D image by writing a renderer
in plain Python, using no libraries.

Run these in order from this folder:

```bash
python step1_points.py      # project 8 points, and print one point's whole journey
python step2_wireframe.py   # connect the points with lines, and spin
python step3_shaded.py      # solid triangles + depth buffer + lighting
python export_scene.py      # send the torus to the Hub
python make_icons.py        # our renderer draws the Hub's iPhone icon
```

Images land in `out/`. Then open **The 3D Pipeline, Live** in the Hub. It's the same math as
these scripts, but you can drag the camera around.

---

## 1. The one big idea: 3D is an illusion made by division

Your eye (or a camera) sees far-away things as smaller. Size on screen ∝ 1 / distance.

So if a point sits at `(x, y)` sideways and `z` units in front of the camera, it lands on screen at:

```
screen_x = x / z
screen_y = y / z
```

That's the whole of perspective. **Everything else is bookkeeping** to get points into a frame
where that division works, and then out to pixels.

## 2. The pipeline (the bookkeeping)

| Stage | What it means | Code |
|---|---|---|
| **Model space** | The shape's own coordinates. The cube's corners are ±1. | `meshes.py` |
| **World space** | Where the shape sits in the world: rotated, moved, scaled. | `model` matrix |
| **Camera space** | The world re-described from the camera's point of view: the camera at the origin looking down −Z. | `look_at()` |
| **Clip space** | 4 numbers `[x, y, z, w]`. The projection matrix copies distance into `w`. | `perspective()` |
| **NDC** | Divide by `w`. Everything visible now fits in a cube from −1 to 1. | `to_screen()` |
| **Screen** | Stretch [−1, 1] to [0, width] and flip y, because row 0 is the top of the image. | `to_screen()` |

Run `step1_points.py` and you'll see real numbers at every stage. Watch `w`: it equals
the distance in front of the camera.

## 3. Why 4×4 matrices for 3D?

A 3×3 matrix can **rotate** and **scale**, but it can't **move** (translate) a point, because
multiplying `[0, 0, 0]` by any matrix gives `[0, 0, 0]` back. The fix is to add a 4th
coordinate `w = 1` to every point. Now the 4th column of the matrix adds a shift. This is called
**homogeneous coordinates**. The same trick is what lets the projection matrix put distance into `w`.

Combining transforms is just multiplying matrices: `proj × view × model` gives one matrix (the
"MVP") that does all three stages at once. A GPU gets one MVP per object, not three.

## 4. Rasterizing: which pixels does a triangle cover?

Everything in 3D graphics is triangles. Three points are always flat, and that makes the math easy.

- **Edge function** (`raster.edge`): the sign tells you which side of a line a pixel sits on.
  A pixel is inside the triangle if it's on the inner side of all 3 edges.
- **Barycentric weights**: the same three numbers, divided by the triangle's area, say how much
  each corner "owns" a pixel. They always add up to 1. Use them to blend anything between the
  corners: depth, color, texture coordinates.
- **Z-buffer**: for each pixel, remember the closest depth drawn so far, and only draw if the new
  pixel is closer. That gives correct overlaps without sorting anything.

## 5. Normals, culling, and light (the dot product does everything)

- `cross(edge1, edge2)` gives a vector perpendicular to the triangle: the **normal**.
  Triangle winding order (counter-clockwise when seen from outside) decides which way it points.
- **Backface culling**: `dot(normal, toward_camera) <= 0` means the face points away, so skip it.
  For closed shapes that's about half the triangles, for free (step 3 prints the counts).
- **Diffuse lighting** (Lambert, 1760): brightness = `dot(normal, toward_light)`. Light hitting
  head-on is bright, and light skimming the surface is dim.

## 6. What a GPU actually is

`raster.triangle()` has a double loop over pixels, and each pixel is independent of the others.
A CPU has a few powerful cores. A GPU has *thousands* of weak ones that each run the same small
program on a different pixel at the same time. Those small programs are **shaders**:

- **vertex shader**: runs `to_screen()` once per vertex
- **fragment (pixel) shader**: runs the lighting math once per pixel

When you write a shader later on, you'll recognize it: it's this module, in parallel.

## What we skipped on purpose (good next steps)

- **Clipping** against the near plane: we just drop triangles behind the camera. Real
  renderers cut them.
- **Perspective-correct interpolation**: needed for textures, because screen-space blending
  of things like UV coordinates is slightly wrong.
- **Smooth (Gouraud/Phong) shading**: per-vertex normals blended across the face.
- **Textures**: barycentric weights → UV coordinates → look up a color in an image.

## Check yourself

1. Why does doubling the distance halve the size on screen? Point to the exact line in `pipeline.py`.
2. In the Hub's pipeline module, set the near plane to 4. What happens to the corner, and why?
3. What goes wrong if one triangle's vertices are listed clockwise?
   (Try swapping two indices in `meshes.cube()` and rerun step 3.)
