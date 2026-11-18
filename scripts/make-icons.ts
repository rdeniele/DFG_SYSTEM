/**
 * Makes every app icon from public/icons/icon.svg.
 *   npm run icons
 * Swap icon.svg for your logo and re-run. Keep the logo inside the middle ~60%
 * so Android's round "maskable" crop doesn't cut it.
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";

const src = readFileSync("public/icons/icon.svg");
const out = "public/icons";

const rounded = (size: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#fff"/></svg>`,
  );

async function plain(size: number, file: string) {
  await sharp(src, { density: 300 }).resize(size, size).png().toFile(`${out}/${file}`);
}

async function round(size: number, file: string) {
  await sharp(src, { density: 300 })
    .resize(size, size)
    .composite([{ input: rounded(size), blend: "dest-in" }])
    .png()
    .toFile(`${out}/${file}`);
}

async function main() {
  await round(192, "icon-192.png");
  await round(512, "icon-512.png");
  await plain(192, "maskable-192.png");
  await plain(512, "maskable-512.png");
  await plain(180, "apple-touch-icon.png"); // iOS rounds it itself
  await round(48, "favicon-48.png");
  console.log("Icons written to public/icons/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
