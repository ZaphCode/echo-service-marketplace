// Mantenimiento: recomprime las fotos de servicios y contrataciones que pesan más de 200 KB
// (máximo 960 px, JPEG al 70 %) y actualiza sus rutas. Usa la llave de servicio del .env de la raíz.
// Uso (macOS, necesita `sips`): node --env-file=../.env scripts/optimize-photos.mjs
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIMIT = 200 * 1024;
const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const work = mkdtempSync(join(tmpdir(), "echo-photos-"));
const bucket = db.storage.from("service-photos");

async function optimize(path) {
  const { data, error } = await bucket.download(path);
  if (error) throw error;
  if (data.size <= LIMIT) return path;
  const input = join(work, "in");
  const output = join(work, "out.jpg");
  writeFileSync(input, Buffer.from(await data.arrayBuffer()));
  execFileSync("sips", ["-Z", "960", "-s", "format", "jpeg", "-s", "formatOptions", "70", input, "--out", output], { stdio: "ignore" });
  const next = path.replace(/\.[^.]+$/, "").replace(/_opt$/, "") + "_opt.jpg";
  const body = readFileSync(output);
  const { error: uploadError } = await bucket.upload(next, body, { contentType: "image/jpeg", upsert: true });
  if (uploadError) throw uploadError;
  console.log(`${path}: ${Math.round(data.size / 1024)} KB → ${Math.round(body.length / 1024)} KB`);
  return next;
}

for (const table of ["service", "contracting"]) {
  const { data: rows, error } = await db.from(table).select("id, photos");
  if (error) throw error;
  for (const row of rows) {
    const photos = [];
    for (const path of row.photos ?? []) photos.push(await optimize(path));
    if (photos.join() !== (row.photos ?? []).join()) {
      const { error: updateError } = await db.from(table).update({ photos }).eq("id", row.id);
      if (updateError) throw updateError;
    }
  }
}
console.log("Listo.");
