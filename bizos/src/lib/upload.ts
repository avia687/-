// Client-side image handling: validate type + size, downscale, return a data
// URI. Storing data URIs keeps the MVP zero-infra; a real object store is a
// drop-in later. Server routes still guard the string length/prefix.

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_DIMENSION = 1280;

export type UploadError = "type" | "size" | "read";

export async function fileToDataUri(file: File): Promise<{ dataUri: string } | { error: UploadError }> {
  if (!file.type.startsWith("image/")) return { error: "type" };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "size" };

  try {
    const dataUri = await downscale(file);
    return { dataUri };
  } catch {
    return { error: "read" };
  }
}

function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const UPLOAD_ERRORS: Record<UploadError, string> = {
  type: "יש להעלות קובץ תמונה",
  size: "התמונה גדולה מדי (עד 2MB)",
  read: "שגיאה בקריאת הקובץ",
};
