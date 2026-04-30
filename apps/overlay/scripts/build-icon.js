// Generate apps/overlay/build/icon.ico from an inline SVG.
// Run via `npm run build:icon`. Commit the resulting build/icon.ico so a
// regular `npm run dist` doesn't need sharp / png-to-ico installed.

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico");

// "구름" cloud icon: dark rounded background, white cloud silhouette,
// three palette-color dots representing live chat.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1c1c2e"/>
      <stop offset="100%" stop-color="#0a0a14"/>
    </linearGradient>
    <radialGradient id="cloud" cx="0.5" cy="0.4" r="0.8">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#dde6f3"/>
    </radialGradient>
  </defs>

  <!-- rounded square background -->
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>

  <!-- cloud silhouette: union of overlapping circles + base bar -->
  <g fill="url(#cloud)">
    <rect x="96" y="248" width="320" height="100" rx="50"/>
    <circle cx="160" cy="244" r="76"/>
    <circle cx="256" cy="200" r="100"/>
    <circle cx="352" cy="232" r="84"/>
  </g>

  <!-- three chat dots inside the cloud -->
  <circle cx="200" cy="298" r="22" fill="#4D96FF"/>
  <circle cx="256" cy="298" r="22" fill="#FF6B6B"/>
  <circle cx="312" cy="298" r="22" fill="#FCE38A"/>
</svg>`;

const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  const overlayDir = path.resolve(__dirname, "..");
  const buildDir = path.join(overlayDir, "build");
  await fs.mkdir(buildDir, { recursive: true });

  // 1) write the SVG source so it travels with the repo
  const svgPath = path.join(buildDir, "icon.svg");
  await fs.writeFile(svgPath, SVG, "utf8");

  // 2) render a 512×512 PNG (electron-builder also accepts this directly)
  const png512 = await sharp(Buffer.from(SVG)).resize(512, 512).png().toBuffer();
  await fs.writeFile(path.join(buildDir, "icon.png"), png512);

  // 3) render a multi-size PNG set and combine into icon.ico
  const pngBuffers = await Promise.all(
    SIZES.map((s) => sharp(Buffer.from(SVG)).resize(s, s).png().toBuffer()),
  );
  const ico = await pngToIco(pngBuffers);
  await fs.writeFile(path.join(buildDir, "icon.ico"), ico);

  console.log(`built:`);
  console.log(`  ${path.relative(overlayDir, svgPath)}`);
  console.log(`  ${path.relative(overlayDir, path.join(buildDir, "icon.png"))} (512x512)`);
  console.log(`  ${path.relative(overlayDir, path.join(buildDir, "icon.ico"))} (${SIZES.join(", ")} px)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
