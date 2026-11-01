import AdmZip from "adm-zip";
import { env } from "@/lib/env";
import { detectImageType } from "@/lib/images";
import {
  MAX_IMAGE_BYTES,
  MAX_ZIP_COMPRESSION_RATIO,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_UNCOMPRESSED_BYTES,
  ImportFileError,
} from "@/lib/excel/constants";

export interface ZipPhotoEntry {
  filename: string;
  data: Buffer;
}

/**
 * Read a photo ZIP defensively:
 *  - entries are NEVER written to disk, so zip-slip paths cannot escape
 *  - absolute/drive/`..` paths, NUL bytes and nested directory abuse are rejected
 *  - entry count, per-entry size, total uncompressed size and compression ratio
 *    are bounded to stop zip bombs
 *  - only JPEG/PNG/WebP entries verified by magic bytes are accepted
 */
export function readPhotoZip(buffer: Buffer): Map<string, ZipPhotoEntry> {
  if (buffer.length > env.MAX_ZIP_BYTES) {
    throw new ImportFileError("file_too_large", "Photo ZIP is larger than the configured limit");
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new ImportFileError("zip_invalid", "The photo ZIP is invalid");
  }

  let entries: AdmZip.IZipEntry[];
  try {
    entries = zip.getEntries();
  } catch {
    throw new ImportFileError("zip_invalid", "The photo ZIP is invalid");
  }

  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new ImportFileError("zip_invalid", "The ZIP contains too many entries");
  }

  const photos = new Map<string, ZipPhotoEntry>();
  let totalUncompressed = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.normalize("NFC").replace(/\\/g, "/");

    if (
      name.length === 0 ||
      name.startsWith("/") ||
      /^[A-Za-z]:/.test(name) ||
      name.includes("\0") ||
      name.split("/").some((segment) => segment === ".." || segment === ".")
    ) {
      throw new ImportFileError("zip_invalid", "The ZIP contains an unsafe path");
    }

    const declaredSize = Number(entry.header.size);
    if (!Number.isFinite(declaredSize) || declaredSize < 0) {
      throw new ImportFileError("zip_invalid", "The ZIP contains an invalid entry size");
    }
    if (declaredSize > MAX_IMAGE_BYTES) {
      throw new ImportFileError("file_too_large", `Image ${name} exceeds the 5 MB limit`);
    }

    totalUncompressed += declaredSize;
    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new ImportFileError("zip_invalid", "The ZIP expands beyond the allowed size");
    }
    if (totalUncompressed / Math.max(1, buffer.length) > MAX_ZIP_COMPRESSION_RATIO) {
      throw new ImportFileError("zip_invalid", "The ZIP has a suspicious compression ratio");
    }

    if (!/\.(jpe?g|png|webp)$/i.test(name)) {
      throw new ImportFileError("invalid_file_type", `Unsupported file in ZIP: ${name}`);
    }

    let data: Buffer;
    try {
      data = entry.getData();
    } catch {
      throw new ImportFileError("zip_invalid", `Could not read ${name} from the ZIP`);
    }
    if (data.length > MAX_IMAGE_BYTES) {
      throw new ImportFileError("file_too_large", `Image ${name} exceeds the 5 MB limit`);
    }
    if (!detectImageType(data)) {
      throw new ImportFileError("image_invalid", `Image ${name} is not a valid JPEG, PNG or WebP file`);
    }

    const baseName = name.split("/").pop()!;
    const key = baseName.toLowerCase();
    if (photos.has(key)) {
      throw new ImportFileError("zip_invalid", `Duplicate file name in ZIP: ${baseName}`);
    }
    photos.set(key, { filename: baseName, data });
  }

  return photos;
}
