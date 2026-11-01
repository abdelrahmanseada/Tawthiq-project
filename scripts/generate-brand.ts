import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BRAND_DIR = path.join(process.cwd(), "public", "brand");

async function main() {
  const svg = await readFile(path.join(BRAND_DIR, "favicon.svg"));
  const png32 = await sharp(svg).resize(32, 32).png().toBuffer();
  const png48 = await sharp(svg).resize(48, 48).png().toBuffer();
  const apple = await sharp(svg).resize(180, 180).png().toBuffer();

  await writeFile(path.join(BRAND_DIR, "apple-touch-icon.png"), apple);
  await writeFile(path.join(BRAND_DIR, "favicon-32.png"), png32);
  await writeFile(path.join(BRAND_DIR, "favicon-48.png"), png48);

  // ICO container with two PNG images (32 and 48 px).
  const images = [
    { size: 32, data: png32 },
    { size: 48, data: png48 },
  ];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(16 * images.length);
  let offset = 6 + directory.length;
  images.forEach((image, index) => {
    const entry = index * 16;
    directory.writeUInt8(image.size === 256 ? 0 : image.size, entry);
    directory.writeUInt8(image.size === 256 ? 0 : image.size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });
  await writeFile(path.join(BRAND_DIR, "favicon.ico"), Buffer.concat([header, directory, ...images.map((image) => image.data)]));
  console.log("brand icons generated");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
