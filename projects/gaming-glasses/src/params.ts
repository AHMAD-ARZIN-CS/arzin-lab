// Every number that shapes the glasses. Units: millimetres and degrees.
//
// Frame sizes use the "boxing system" from ISO 8624, the numbers printed inside real frames,
// for example 52□18-140:
//   52  = A,   the width of one lens (the box drawn around it)
//   18  = DBL, the distance between the two lenses (the bridge)
//   140 = the temple (arm) length, from the hinge to the tip

export interface Params {
  lensWidth: number; // A
  lensHeight: number; // B: height of the box around one lens
  bridge: number; // DBL
  temple: number; // temple length, hinge to tip
  wrapDeg: number; // face-form wrap: each lens turns back toward the temple
  tiltDeg: number; // pantoscopic tilt: the bottom of the front leans toward the cheeks
  userPD: number; // wearer's pupillary distance (centre of one pupil to the other)
  headWidth: number; // wearer's head width just above the ears
  earDistance: number; // from the hinge to the top of the ear ("length to bend")
}

export type PresetId = "S" | "M" | "L";

// The three most common adult sizes. Temple lengths come in 5 mm steps in real catalogues.
export const PRESETS: Record<PresetId, Pick<Params, "lensWidth" | "lensHeight" | "bridge" | "temple">> = {
  S: { lensWidth: 49, lensHeight: 38, bridge: 17, temple: 135 },
  M: { lensWidth: 52, lensHeight: 40, bridge: 18, temple: 140 },
  L: { lensWidth: 55, lensHeight: 42, bridge: 19, temple: 145 },
};

export const DEFAULTS: Params = {
  ...PRESETS.M,
  wrapDeg: 5,
  tiltDeg: 8,
  userPD: 63, // average adult PD is about 61-64 mm
  headWidth: 146,
  earDistance: 103,
};

// [min, max, step] for each slider.
export const RANGES: Record<keyof Params, [number, number, number]> = {
  lensWidth: [40, 62, 1],
  lensHeight: [28, 50, 1],
  bridge: [14, 24, 1],
  temple: [125, 155, 5],
  wrapDeg: [0, 15, 1],
  tiltDeg: [0, 16, 1],
  userPD: [52, 76, 0.5],
  headWidth: [125, 170, 1],
  earDistance: [85, 120, 1],
};

export const sizeLabel = (p: Params) => `${p.lensWidth}□${p.bridge}-${p.temple}`;
