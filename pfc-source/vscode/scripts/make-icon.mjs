// Rasterises media/icon.svg -> media/icon.png (256x256) for the Marketplace.
// Run with: npm run icon
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const media = join(dirname(fileURLToPath(import.meta.url)), "..", "media");
const svg = readFileSync(join(media, "icon.svg"));
const png = new Resvg(svg, { fitTo: { mode: "width", value: 256 } }).render().asPng();
writeFileSync(join(media, "icon.png"), png);
console.log("wrote media/icon.png (256x256)");
