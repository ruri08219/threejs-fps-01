// The look plan, in one place. Dusk desert: warm sand and amber against a dark
// violet sky, with one accent per team so a glance tells friend from foe.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#171310', // dusk sky / fog
  surface: '#2a2118', // walls, ground shadow
  hairline: '#4a3a26', // crates, barriers
  ink: '#f2e8d5', // sand-lit faces, HUD text
  muted: '#a89a80', // dim text, distant stone
  accent: '#f0a830', // AURUM team, HUD accent, sun
  sand: '#c9a86a', // ground, containers
  rust: '#a4552f', // containers, tower
  teal: '#2fa8a0', // VANTA team
  ember: '#e85d2f', // bomb site glow, danger
};

export function shade(name) {
  return PALETTE[name];
}
