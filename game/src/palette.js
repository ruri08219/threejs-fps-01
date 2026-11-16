// SANDLINE's look, centralised in one place: dusk desert — warm sand and amber
// set against a dark violet sky, with one accent colour per team so a glance
// tells friend from foe. The stylesheet in index.html mirrors these same names
// as CSS custom properties, and the world builder reads them for materials.
const SWATCHES = [
  ['canvas', '#171310'], // dusk sky, fog wash
  ['surface', '#2a2118'], // walls, ground shadow
  ['hairline', '#4a3a26'], // crates, barriers
  ['ink', '#f2e8d5'], // sand-lit faces, HUD text
  ['muted', '#a89a80'], // dim text, distant stone
  ['accent', '#f0a830'], // AURUM team, HUD accent, sun disc
  ['sand', '#c9a86a'], // ground, containers
  ['rust', '#a4552f'], // containers, watchtower
  ['teal', '#2fa8a0'], // VANTA team
  ['ember', '#e85d2f'], // bomb site glow, danger states
];

export const PALETTE = Object.fromEntries(SWATCHES);

// Look a swatch up by name; the world builder and the effects module go
// through this so no colour literal is ever duplicated in a second file.
export function shade(name) {
  return PALETTE[name];
}
