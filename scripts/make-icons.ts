/**
 * Makes every app icon (and the small in-app logo) from public/DFG_logo.png.
 *   npm run icons
 *
 * The logo is a white circle on a black square. We cut out the white circle:
 * - "any" icons + in-app logo: the circle on a transparent background
 * - "maskable" + iPhone icons: the circle shrunk onto a full white square, so Android's
 *   round/squircle crop and iOS's rounded corners never cut the letters
 * If you replace the logo with a different design, adjust CIRCLE below.
 */
import sharp from "sharp";

const SRC = "public/DFG_logo.png";
const OUT = "public/icons";
// The white circle inside DFG_logo.png (1254×1254): center and diameter in pixels.
const CIRCLE = { cx: 618, cy: 629, d: 1096 };

const circleMask = (size: number) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${(size / 2) * 0.965}" fill="#fff"/></svg>`,
  );

/** The white disk with the letters, transparent outside, at `size` px. */
async function disk(size: number): Promise<Buffer> {
  return sharp(SRC)
    .extract({
      left: Math.round(CIRCLE.cx - CIRCLE.d / 2),
      top: Math.round(CIRCLE.cy - CIRCLE.d / 2),
      width: CIRCLE.d,
      height: CIRCLE.d,
    })
    .resize(size, size)
    .composite([{ input: circleMask(size), blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** Transparent "any" icon: disk with a thin margin. */
async function anyIcon(size: number, file: string) {
  const inner = Math.round(size * 0.96);
  const pad = Math.floor((size - inner) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await disk(inner), left: pad, top: pad }])
    .png({ palette: true, compressionLevel: 9 })
    .toFile(`${OUT}/${file}`);
}

/** Full-bleed white square with the disk at `scale`, safe for maskable/iOS cropping. */
async function fullIcon(size: number, file: string, scale = 0.9) {
  const inner = Math.round(size * scale);
  const pad = Math.floor((size - inner) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: await disk(inner), left: pad, top: pad }])
    .flatten({ background: "#ffffff" })
    .png({ palette: true, compressionLevel: 9 })
    .toFile(`${OUT}/${file}`);
}

async function main() {
  await anyIcon(192, "icon-192.png");
  await anyIcon(512, "icon-512.png");
  await fullIcon(192, "maskable-192.png");
  await fullIcon(512, "maskable-512.png");
  await fullIcon(180, "apple-touch-icon.png", 0.94);
  await anyIcon(48, "favicon-48.png");
  // Small logo used inside the app (headers, landing page)
  await sharp(await disk(256)).png({ palette: true, compressionLevel: 9 }).toFile(`${OUT}/logo-256.png`);
  console.log("Icons written to public/icons/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
