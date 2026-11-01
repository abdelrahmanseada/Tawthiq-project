import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { readPhotoZip } from "@/lib/zip";

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function fakeJpeg(size = 128): Buffer {
  return Buffer.concat([JPEG_MAGIC, Buffer.alloc(size, 0x11)]);
}

function makeZip(entries: Array<[string, Buffer]>): Buffer {
  const zip = new AdmZip();
  for (const [name, data] of entries) zip.addFile(name, data);
  return zip.toBuffer();
}

/**
 * adm-zip normalises entry names when adding files, so a malicious archive is
 * simulated by patching the stored file name in the raw ZIP bytes.
 */
function makeRawNameZip(entryName: string, data: Buffer): Buffer {
  const placeholder = "a".repeat(entryName.length);
  const buffer = makeZip([[placeholder, data]]);
  const from = Buffer.from(placeholder, "utf8");
  const to = Buffer.from(entryName, "utf8");
  let index = 0;
  while ((index = buffer.indexOf(from, index)) !== -1) {
    to.copy(buffer, index);
    index += to.length;
  }
  return buffer;
}

describe("safe photo ZIP reading", () => {
  it("reads valid JPEG/PNG/WebP entries by magic bytes", () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 0x22),
    ]);
    const zip = makeZip([
      ["photos/ahmed.jpg", fakeJpeg()],
      ["sara.png", png],
    ]);
    const files = readPhotoZip(zip);
    expect(files.size).toBe(2);
    expect(files.get("ahmed.jpg")?.filename).toBe("ahmed.jpg");
    expect(files.get("sara.png")).toBeDefined();
  });

  it("rejects zip-slip traversal paths", () => {
    const zip = makeRawNameZip("../evil.jpg", fakeJpeg());
    expect(() => readPhotoZip(zip)).toThrowError(/unsafe path/);
  });

  it("rejects absolute and drive-letter paths", () => {
    expect(() => readPhotoZip(makeRawNameZip("/etc/passwd.jpg", fakeJpeg()))).toThrowError(/unsafe path/);
    expect(() => readPhotoZip(makeRawNameZip("C:/windows/evil.jpg", fakeJpeg()))).toThrowError(/unsafe path/);
  });

  it("rejects non-image entries", () => {
    const zip = makeZip([["notes.txt", Buffer.from("hello")]]);
    expect(() => readPhotoZip(zip)).toThrowError(/Unsupported file/);
  });

  it("rejects files whose content is not a real image", () => {
    const zip = makeZip([["fake.jpg", Buffer.from("<script>alert(1)</script>")]]);
    expect(() => readPhotoZip(zip)).toThrowError(/not a valid JPEG/);
  });

  it("rejects entries larger than 5 MB", () => {
    const tooLarge = Buffer.concat([JPEG_MAGIC, Buffer.alloc(5 * 1024 * 1024, 0x33)]);
    const zip = makeZip([["big.jpg", tooLarge]]);
    expect(() => readPhotoZip(zip)).toThrowError(/5 MB/);
  });
});
