import { useEffect, useMemo } from "react";
import { publicUrl } from "../lib/supabase";
import { SERVICE_PHOTOS_BUCKET } from "../config";
import Icon from "./Icon";

/** De 1 a 5 fotos: rutas ya subidas (string) o archivos nuevos (File). */
export default function PhotoPicker({ photos, onChange }: { photos: (string | File)[]; onChange: (photos: (string | File)[]) => void }) {
  const previews = useMemo(
    () => photos.map((photo) => (typeof photo === "string" ? publicUrl(SERVICE_PHOTOS_BUCKET, photo) : URL.createObjectURL(photo))),
    [photos],
  );
  useEffect(() => () => previews.forEach((url) => url.startsWith("blob:") && URL.revokeObjectURL(url)), [previews]);

  return (
    <div className="photo-picker">
      {previews.map((src, index) => (
        <div key={src} className="photo-slot">
          <img src={src} alt={`Foto ${index + 1}`} />
          <button type="button" aria-label={`Quitar foto ${index + 1}`} onClick={() => onChange(photos.filter((_, i) => i !== index))}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      {photos.length < 5 ? (
        <label className="photo-add">
          <Icon name="camera" size={22} />
          Agregar
          <input
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              onChange([...photos, ...files].slice(0, 5));
              event.target.value = "";
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
