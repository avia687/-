import sharp from "sharp";
import { ApiError } from "@/lib/session-guards";

const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export type StoredImage = {
  url: string; // data URI (webp) — serverless-safe, no filesystem needed
  thumbUrl: string; // smaller data URI
  width: number;
  height: number;
  bytes: number;
};

/**
 * Validate, compress (max 1280px, webp) and generate a 400px thumbnail, then
 * return both as base64 data URIs. Storing images as data URIs keeps the app
 * fully serverless-compatible (Vercel etc.) with no blob store or writable
 * disk. For very high volume, swap this to an object store (S3/R2/Vercel Blob)
 * — the return shape stays the same.
 */
export async function processAndStore(file: File): Promise<StoredImage> {
  if (!ACCEPTED.has(file.type)) {
    throw new ApiError(422, "פורמט לא נתמך. השתמשו ב-JPG, PNG או WEBP.", "bad_format");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError(422, "הקובץ גדול מדי (מקסימום 8MB)", "too_large");
  }

  const bytes = Buffer.from(await file.arrayBuffer());

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

  const full = await pipeline
    .clone()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const thumb = await pipeline
    .clone()
    .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  const info = await sharp(full).metadata();

  return {
    url: `data:image/webp;base64,${full.toString("base64")}`,
    thumbUrl: `data:image/webp;base64,${thumb.toString("base64")}`,
    width: info.width ?? meta.width,
    height: info.height ?? meta.height,
    bytes: full.length,
  };
}
