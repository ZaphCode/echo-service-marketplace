// Comprime las fotos antes de subirlas: una foto de celular pesa varios MB y en datos móviles es lo
// que más tarda en cargar el catálogo. Máximo 1280 px por lado, en WebP (o JPEG si no hay soporte).
const MAX_SIDE = 1280;
const QUALITY = 0.82;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
    const output = blob?.type === "image/webp" ? blob : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!output || output.size >= file.size) return file;
    const ext = output.type === "image/webp" ? "webp" : "jpg";
    return new File([output], file.name.replace(/\.[^.]+$/, "") + `.${ext}`, { type: output.type });
  } catch {
    return file; // Formato que el navegador no decodifica (p. ej. HEIC en Chrome): se sube tal cual.
  }
}
