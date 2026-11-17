import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { randomUUID } from "crypto";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// Allowlist of recognized image magic-byte signatures mapped to their
// extensions. Anything that doesn't match one of these (including SVG,
// which has no safe binary signature) is rejected.
const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
  gif: ".gif",
};

/**
 * Determine the real image type of a buffer by inspecting its magic bytes,
 * rather than trusting the client-supplied Content-Type header. Returns the
 * file extension to use (e.g. ".jpg") or null if the content doesn't match
 * any recognized image signature.
 */
async function detectImageExtension(buffer: Buffer): Promise<string | null> {
  const header = buffer.subarray(0, 12);

  // JPEG: FF D8 FF
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return IMAGE_EXTENSION_BY_TYPE.jpeg;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (header.length >= pngSignature.length && pngSignature.every((b, i) => header[i] === b)) {
    return IMAGE_EXTENSION_BY_TYPE.png;
  }

  // WebP: "RIFF" at bytes 0-3 and "WEBP" at bytes 8-11
  if (
    header.length >= 12 &&
    header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
    header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
  ) {
    return IMAGE_EXTENSION_BY_TYPE.webp;
  }

  // GIF: 47 49 46 38
  if (header.length >= 4 && header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
    return IMAGE_EXTENSION_BY_TYPE.gif;
  }

  return null;
}

/**
 * Build a safe, fully server-generated destination path for an uploaded
 * image inside uploadDir. The filename is never derived from user input
 * (file.name / file.type), only from a random UUID plus a validated
 * extension. As a defense-in-depth backstop, verifies the resolved path is
 * still contained within uploadDir before returning it.
 */
function safeImagePath(uploadDir: string, ext: string): { filename: string; fullPath: string } {
  const filename = `${randomUUID()}${ext}`;
  const fullPath = path.join(uploadDir, filename);

  const resolvedDir = path.resolve(uploadDir) + path.sep;
  const resolvedPath = path.resolve(fullPath);
  if (!resolvedPath.startsWith(resolvedDir)) {
    throw new Error("Resolved upload path escapes upload directory");
  }

  return { filename, fullPath };
}

/**
 * Validate a client-supplied image file's size and declared content type
 * before any disk I/O happens. Returns an error message to surface to the
 * client, or null if the file passes this shallow check. Note this is NOT
 * the security-relevant check (file.type is client-controlled) - that's
 * done by saveSuggestionImage's magic-byte detection below.
 */
export function validateSuggestionImage(file: File): string | null {
  if (file.size > MAX_IMAGE_SIZE) {
    return "Image size must not exceed 5MB";
  }
  if (!file.type.startsWith("image/")) {
    return "Only image files are allowed";
  }
  return null;
}

/**
 * Persist an uploaded suggestion image to public/uploads using a
 * server-generated random filename, after verifying via magic bytes that
 * the content is actually one of the allowlisted image formats (JPEG, PNG,
 * WebP, GIF). Throws if the content doesn't match any recognized image
 * signature (this rejects SVG/HTML and other non-image uploads, which is a
 * deliberate security control against path traversal and stored XSS, not a
 * convenience check). Returns the public-facing path to the saved file.
 */
export async function saveSuggestionImage(file: File): Promise<string> {
  const uploadDir = path.join(process.cwd(), "public/uploads");
  if (!existsSync(uploadDir)) {
    await mkdir(uploadDir, { recursive: true });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = await detectImageExtension(buffer);
  if (!ext) {
    throw new Error("File bukan gambar yang valid");
  }

  const { filename, fullPath } = safeImagePath(uploadDir, ext);
  await writeFile(fullPath, buffer);

  return `/uploads/${filename}`;
}
