# Scene files: `arzin-scene/0`

A scene file is a JSON description of something to show in 3D. **Any person or AI agent can
write one.** Drop it in this folder and it appears on the Hub dashboard (it live-reloads while
`npm run dev` is running). You can also open one straight from a device with **Open scene file…**
on the dashboard, with no rebuild.

The format exists so we can visualize textbook problems in physics, calculus or linear algebra
by writing a small file.

## Skeleton

```json
{
  "spec": "arzin-scene/0",
  "id": "calc-unique-id",
  "title": "Short title",
  "track": "math",
  "description": "What to notice, in 1–3 sentences. Teach, don't just label.",
  "up": "z",
  "camera": { "position": [5, -5, 4], "target": [0, 0, 0] },
  "objects": [ ... ]
}
```

- `track`: one of `3d`, `math`, `physics`, `software`, `data`, `security`, `games`, `agents`, `tools`.
- `up`: `"z"` for math/textbook scenes (z is height, as in calculus). Leave it out for y-up (graphics/physics).
  All coordinates in the file, the camera included, use the chosen convention.
- `id` should match the file name.

## Objects

| type | fields | notes |
|---|---|---|
| `axes` | `size` | Labeled x/y/z axes |
| `grid` | `size`, `divisions` | Lies on the floor plane |
| `box` | `size [w,h,d]`, `position`, `color`, `spin` | |
| `sphere` | `radius`, `position`, `color`, `spin` | |
| `mesh` | `vertices [[x,y,z]…]`, `triangles [[a,b,c]…]`, `color`, `flat`, `position`, `spin` | Counter-clockwise winding = front face |
| `model` | `src` (e.g. `models/x.glb`), `scale`, `position`, `spin` | Files go in `hub/public/models/` |
| `surface` | `fn` (of `x`, `y`, `t`), `x [min,max]`, `y [min,max]`, `resolution`, `color`, `opacity` | Colored by height unless `color` is set |
| `curve` | `x`, `y`, `z` (each a formula of `u`, and optionally `t`), `u [min,max]`, `samples`, `color` | Parametric curve |
| `plot2d` | `fn` (of `x`, `t`), `x [min,max]`, `color` | y = f(x), drawn in the z = 0 plane |
| `vector` | `from`, `to`, `color`, `label` | An arrow |
| `points` | `points [[x,y,z]…]`, `color`, `size` | |
| `label` | `text`, `position`, `color` | Always faces the viewer |

`spin` is `[rx, ry, rz]` in radians per second.

## Formulas

Formulas are parsed by [mathjs](https://mathjs.org) (never by JavaScript `eval`, so a scene
file can't run code). You can use `+ - * / ^`, `sqrt`, `sin`, `cos`, `tan`, `exp`, `log`, `abs`,
`pi`, `e`, and units like `50 deg`.

**Anything that uses `t` animates.** `t` is seconds since the scene opened.

## Good scene checklist (for agents)

1. The description says *what to notice*, not just what it is.
2. Units and numbers are correct. Compute key points (apex, intercepts, extrema) and label them.
3. The camera frames the interesting part. Keep coordinates in roughly the −10…10 range.
4. Use `up: "z"` for anything from a calculus or multivariable textbook.
5. Validate the JSON before saving it.
