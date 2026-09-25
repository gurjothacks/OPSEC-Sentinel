"use strict";

// Generates icons/icon-{16,32,48,96}-{normal,warning,critical}.{svg,png}
// Minimal abstract mark: rounded diamond ring + short tick segment inside.
// Color is never the only signal: the tick orientation/length differs per state
// (upright tick / flat bar / crossed). PNGs rendered with rsvg-convert.

import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "icons");
mkdirSync(outDir, { recursive: true });

// Restrained palette (matches the design tokens, readable at 16px on both themes)
const VARIANTS = {
  normal:   { color: "#32D583", inner: "tick" },   // small upright tick
  warning:  { color: "#F2C94C", inner: "bar" },    // horizontal bar
  critical: { color: "#F97066", inner: "cross" }   // X notch
};

function svg(size, { color, inner }) {
  const innerMarkup =
    inner === "tick"
      ? `<path d="M36 50 L45 59 L61 38" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
      : inner === "bar"
        ? `<path d="M34 48 H62" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`
        : `<path d="M38 38 L58 58 M58 38 L38 58" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">
  <rect x="24" y="24" width="48" height="48" rx="10" transform="rotate(45 48 48)" fill="none" stroke="${color}" stroke-width="6" opacity="0.85"/>
  ${innerMarkup}
</svg>
`;
}

for (const size of [16, 32, 48, 96]) {
  for (const [name, v] of Object.entries(VARIANTS)) {
    const svgPath = join(outDir, `icon-${size}-${name}.svg`);
    writeFileSync(svgPath, svg(size, v));
    execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", join(outDir, `icon-${size}-${name}.png`), svgPath]);
    if (name === "normal") {
      writeFileSync(join(outDir, `icon-${size}.svg`), svg(size, v));
      execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", join(outDir, `icon-${size}.png`), svgPath]);
    }
  }
}
console.log("icons done");
