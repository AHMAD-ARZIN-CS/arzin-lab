# Gaming Glasses: 3D prototype

**Goal:** design AR gaming glasses that are actually wearable (real eyewear sizes, weight and balance),
that look good enough that people want to buy them, and that come in **themes for different games and cultures**.
The first theme is **Candy Crush**.

The glasses follow the "smart display" idea: they plug into a PC over USB-C and show an overlay
(for Candy Crush, for example, hints of possible matches). The heavy AI runs on the PC, which keeps the glasses light
and the lag low.

> "Candy Crush" is a trademark of King. This theme is a **private learning prototype**. Selling it would need a licence from King.
> The candy shapes are modelled from scratch; no game artwork is copied.

## Run it

```bash
cd projects/gaming-glasses
npm install
npm run dev
```

Open **http://localhost:5180** (5180, so it never clashes with the workspace on 5173).

- Drag to orbit, scroll to zoom. The **3/4 · Front · Side · Top** buttons jump to standard views.
- **S / M / L** load common sizes; the sliders change any measurement and the model rebuilds instantly.
- **Your face**: enter your PD, head width and ear distance; the **Fit & comfort check** on the right updates live.
- **Head fit guide** shows a simple see-through head; **X-ray** shows the electronics inside the housings.
- **Front STL / Temples STL** export printable files (millimetres). **PNG** saves a picture.
- `npm run typecheck` checks the TypeScript.

## The parts

| File | What it does |
|---|---|
| `src/params.ts` | Every measurement, the S/M/L presets and the slider ranges |
| `src/sweep.ts` | The core modelling tool: slides a rounded cross-section along a path to make a tube-like solid |
| `src/shapes.ts` | Lens outline (a "superellipse") and the face-form wrap bend |
| `src/frame.ts` | Builds the whole frame: rims, lenses, bridge, brow bar, nose pads, hinges, temples, tip pods, electronics |
| `src/fit.ts` | Weight, centre of mass and the fit/comfort rules |
| `src/head.ts` | The see-through head used to check fit |
| `src/themes/` | `candy.ts` (Candy Crush), `classic.ts` (plain), and `types.ts`, which says what a theme may change |
| `src/main.ts` | Scene, lights, camera, panel, exports |

**Themes can only change materials and add decorations; they can't change the frame's shape.**
That's deliberate: every future theme (another game, an Afghan pattern, a sports team) automatically
keeps the same tested fit.

### Candy Crush design

- Glossy candy-pink rims, with a grape-purple **brow bar** carrying the six candies (jelly bean, lozenge, lemon drop, square, orb, flower)
- **Colour-bomb camera**: a chocolate ball with sprinkles and the camera lens in its centre, plus a white **privacy LED**
- **Candy-cane temples**: diagonal stripes in the texture become a spiral on the round temple
- **Wrapped-candy hinges**, a rose indoor lens tint, and the name printed on the temples
- **Jelly-bean tip pods** behind the ears: the battery (red, right) and the USB-C port (blue, left, on the underside so the cable drops behind the ear)

## Rules followed, and where they come from

| Rule | Value used | Source / reasoning |
|---|---|---|
| Frame size | Boxing system `A□DBL-temple`, default `52□18-140` | ISO 8624 (how frame sizes are measured and printed) |
| Sizes offered | S 49□17-135, M 52□18-140, L 55□19-145 | Common adult sizes; temples are sold in 5 mm steps |
| Display/lens centring | Lens centres at frame PD = A + DBL, within 4 mm of the wearer's pupil | Standard optician fitting; 4 mm is my design target for the display (shifted in software) |
| Pantoscopic tilt | 8° (check: 6-12°) | Typical fitting range |
| Face-form wrap | 5° (check: ≤ 7°) | Normal prescription lenses and flat displays tolerate small wrap |
| Vertex distance | 12 mm (lens to eye) | Typical 12-14 mm |
| Temple bend | Lands within ±5 mm of the top of the ear | Otherwise the glasses slide or press behind the ear |
| Temple spread | Computed so the temples just touch the head | Light, even grip |
| Weight | Target ≤ 75 g | Tethered AR display glasses commonly weigh about 70-80 g |
| Lens tint | Category 0 (≥ 80% light through) | ISO 12312-1; gaming is indoors, so no sunglass tint |
| Camera | Visible recording LED | Privacy: people nearby must know when it records |
| Material | PA12 nylon (SLS 3D print), 1.5 mm housing walls, titanium pad arms, silicone pads | Common for printed eyewear: light, strong, skin-safe when dyed and sealed |

Honest limits: these are prototype checks, not a certified design. Electronics masses are typical values for
parts of that size, not measured parts. The head is a simple guide, not a face scan. Real frames also get a final
adjustment from an optician.

## Current result (M size, Candy Crush)

Measured from the model (`npm run dev`, then read the panel):
- **About 71 g**: frame 31.8 g + lenses 9.1 g + electronics 30 g ✓
- Display centring 3.5 mm per eye ✓, temple spread 4.5° ✓, temple bend +2 mm ✓
- **Balance: 78% on the nose ⚠.** The two display engines (16 g) sit at the front. This is the main open design problem
  (options: lighter display engines, moving the main board back toward the ear, or a counterweight in the tips).
- STL check: the front is 146 mm wide, 25,180 triangles; the temples are 14,352 triangles. The temples export in their
  worn position; lay them flat in the slicer before printing.

## What I learned

- **Boxing system (ISO 8624):** the three numbers in a frame (`52□18-140`) are lens width, bridge, and temple length.
  The frame PD is `A + DBL`; it must be close to your PD or the lens/display centres miss your pupils.
- **Sweeps:** most of the frame is "a cross-section slid along a path". A rim is a sweep around a closed loop,
  a temple is a sweep along a line that curves down at the ear.
- **Superellipse:** `|x/a|^n + |y/b|^n = 1`. n = 2 gives an ellipse; bigger n gives a rounder rectangle. It's used for the lens
  shape and for every cross-section.
- **Rotations:** wrap rotates each half of the front about a vertical axis (`x' = x cos θ + z sin θ`, `z' = −x sin θ + z cos θ`);
  tilt rotates the front about the hinge line.
- **Volume from a mesh:** each triangle plus the origin is a tetrahedron with signed volume `a · (b × c) / 6`; summing
  them gives the exact volume of a closed mesh. Tested on a sphere: 4177.6 mm³ against the exact 4188.8 mm³ (the
  0.3% gap is because the sphere is built from flat triangles). Hollow parts use an inward-facing inner surface,
  whose volume comes out negative and is subtracted automatically.
- **Centre of mass and levers:** glasses rest on two supports (nose and ears). The share of weight on the ears is
  `(z_nose − z_com) / (z_nose − z_ear)`, which is why heavy parts behind the ear help.
- **Design for wearability first, decoration second:** themes can't touch the geometry that makes it fit.

## Next steps

- Fix the front-heavy balance (see above).
- Real cut-outs (USB-C opening, camera hole, speaker grilles) and a hinge mechanism, probably in a CAD tool (OpenSCAD/FreeCAD).
- Software side: a PC app that captures the game, detects candies, and draws hints on the glasses' display.
  For multiplayer shooters, enemy-highlighting overlays count as cheating under most games' rules and anti-cheat systems,
  so the AI features should target single-player and puzzle games, or games that allow overlays.
- More themes for other games and cultures.
