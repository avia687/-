import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { ApiError } from "@/lib/session-guards";

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export type StoredImage = {
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  bytes: number;
};

async function ensureDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

/**
 * Validate, compress (max 1600px, webp), generate a 400px thumbnail, and
 * store both under /public/uploads. Returns public URLs.
 */
export async function processAndStore(file: File): Promise<StoredImage> {
  if (!ACCEPTED.has(file.type)) {
    throw new ApiError(422, "פורמט לא נתמך. השתמשו ב-JPG, PNG או WEBP.", "bad_format");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError(422, "הקובץ גדול מדי (מקסימום 8MB)", "too_large");
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Re-encode through sharp — this also validates the file is a real image.
  let pipeline: sharp.Sharp;
  try {
    pipeline = sharp(bytes, { failOn: "error" }).rotate();
  } catch {
    throw new ApiError(422, "קובץ התמונה פגום", "corrupt");
  }

  const meta = await pipeline.metadata().catch(() => null);
  if (!meta?.width || !meta?.height) {
    throw new ApiError(422, "לא ניתן לקרוא את התמונה", "corrupt");
  }

  await ensureDir();
  const id = crypto.randomBytes(9).toString("hex");
  const fullName = `${id}.webp`;
  const thumbName = `${id}_thumb.webp`;

  const full = await pipeline
    .clone()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  await fs.writeFile(path.join(UPLOAD_DIR, fullName), full);

  await pipeline
    .clone()
    .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 74 })
    .toFile(path.join(UPLOAD_DIR, thumbName));

  const info = await sharp(full).metadata();

  return {
    url: `/uploads/${fullName}`,
    thumbUrl: `/uploads/${thumbName}`,
    width: info.width ?? meta.width,
    height: info.height ?? meta.height,
    bytes: full.length,
  };
}
