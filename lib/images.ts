import sharp from "sharp";

/** Uploaded images are validated by magic bytes, never by filename/extension. */
export type DetectedImageType = "jpeg" | "png" | "webp";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export function hasZipMagic(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

export interface NormalizedImage {
  buffer: Buffer;
  contentType: string;
  extension: "jpg" | "png";
  width: number;
  height: number;
}

/**
 * Decode with libvips, auto-rotate, strip metadata (EXIF/GPS), downscale and
 * re-encode. Re-encoding also neutralises polyglot/embedded payloads.
 */
export async function normalizeImage(
  input: Buffer,
  options: { maxWidth: number; maxHeight: number; format: "jpeg" | "png"; quality?: number } = {
    maxWidth: 800,
    maxHeight: 800,
    format: "jpeg",
  },
): Promise<NormalizedImage> {
  if (detectImageType(input) === null) {
    throw new ImageValidationError("Unsupported image format");
  }
  try {
    const pipeline = sharp(input, {
      limitInputPixels: 40_000_000, // 40 MP guard against decompression bombs
      failOn: "error",
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: options.maxWidth,
        height: options.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      });

    if (options.format === "png") {
      const { data, info } = await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
      return {
        buffer: data,
        contentType: "image/png",
        extension: "png",
        width: info.width,
        height: info.height,
      };
    }

    const { data, info } = await pipeline
      .jpeg({ quality: options.quality ?? 85, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: data,
      contentType: "image/jpeg",
      extension: "jpg",
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError("The image could not be processed");
  }
}

/** Normalise an employee portrait: JPEG (PDF-embeddable), max 800px, EXIF stripped. */
export async function normalizeEmployeePhoto(input: Buffer): Promise<NormalizedImage> {
  return normalizeImage(input, { maxWidth: 800, maxHeight: 800, format: "jpeg", quality: 85 });
}

/** Normalise a company logo: PNG to preserve transparency, max 800x400. */
export async function normalizeCompanyLogo(input: Buffer): Promise<NormalizedImage> {
  return normalizeImage(input, { maxWidth: 800, maxHeight: 400, format: "png" });
}

/**
 * Parse a cropped image data URL produced by the browser cropper.
 * The decoded bytes are re-validated by magic bytes and re-encoded server-side.
 */
export function parseImageDataUrl(value: string, maxBytes = 5 * 1024 * 1024): Buffer {
  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim());
  if (!match) throw new ImageValidationError("Invalid image data URL");
  const base64 = match[1]!.replace(/\s+/g, "");
  const estimatedBytes = Math.floor((base64.length * 3) / 4);
  if (estimatedBytes > maxBytes) throw new ImageValidationError("Image is too large");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0 || buffer.length > maxBytes) throw new ImageValidationError("Image is too large");
  if (!detectImageType(buffer)) throw new ImageValidationError("Unsupported image format");
  return buffer;
}

/** Sample the four corners of a logo; opaque, very dark corners need no white plate. */
export async function logoBackgroundIsDark(buffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const points = [
    [1, 1],
    [info.width - 2, 1],
    [1, info.height - 2],
    [info.width - 2, info.height - 2],
  ];
  let total = 0;
  for (const [x, y] of points) {
    const offset = (Math.max(0, y) * info.width + Math.max(0, x)) * 4;
    const alpha = data[offset + 3]! / 255;
    const r = data[offset]! * alpha + 255 * (1 - alpha);
    const g = data[offset + 1]! * alpha + 255 * (1 - alpha);
    const b = data[offset + 2]! * alpha + 255 * (1 - alpha);
    total += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return total / points.length < 0.2;
}

