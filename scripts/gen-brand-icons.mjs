/**
 * Generates public/favicon.ico, public/icon.png (512), public/apple-icon.png (180)
 * from a simple "VW" mark on #1a4a4a. Run: npm run generate:icons
 */
import { writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

const BG = "#1a4a4a";

function svgMarkup(size) {
  const fs = Math.round(size * 0.34);
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <rect width="100%" height="100%" fill="${BG}"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-weight="700" font-size="${fs}">VW</text>
</svg>`;
}

async function main() {
  const svg512 = Buffer.from(svgMarkup(512));
  const png512 = await sharp(svg512).png().toBuffer();
  await writeFile(join(publicDir, "icon.png"), png512);

  const svg180 = Buffer.from(svgMarkup(180));
  const png180 = await sharp(svg180).png().toBuffer();
  await writeFile(join(publicDir, "apple-icon.png"), png180);

  const png32 = await sharp(svg512).resize(32, 32).png().toBuffer();
  const ico = await pngToIco([png32]);
  await writeFile(join(publicDir, "favicon.ico"), ico);

  console.log("Wrote public/icon.png, public/apple-icon.png, public/favicon.ico");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
