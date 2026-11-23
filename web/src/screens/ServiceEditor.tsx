import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getService, listCategories, saveService } from "../api/catalog";
import { useSignedInUser } from "../auth/AuthContext";
import { useToast } from "../components/Layout";
import PhotoPicker from "../components/PhotoPicker";
import { BackHeader, EmptyState } from "../components/ui";
import { validatePrice } from "../utils/validations";
import "./publish.css";

export default function ServiceEditor() {
  const { id } = useParams();
  const user = useSignedInUser();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ["categories"], queryFn: listCategories, staleTime: 30 * 60_000 });
  const existing = useQuery({ queryKey: ["service", id], queryFn: () => getService(id!), enabled: !!id });
  const [form, setForm] = useState({ name: "", description: "", category: "", price: "" });
  const [photos, setPhotos] = useState<(string | File)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    const s = existing.data;
    setForm({ name: s.name, description: s.description, category: s.category, price: String(s.base_price) });
    setPhotos(s.photos ?? []);
  }, [existing.data]);

  if (user.role !== "provider") {
    return (
      <div className="page detail">
        <BackHeader onBack={() => navigate(-1)} />
        <EmptyState icon="briefcase" title="Solo los profesionales publican servicios">
          Si buscas a alguien, publica una contratación con lo que necesitas.
        </EmptyState>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem =
      (form.name.trim().length < 4 && "Escribe un nombre de al menos 4 letras") ||
      (!form.category && "Elige una categoría") ||
      validatePrice(form.price) ||
      (photos.length === 0 && "Agrega al menos una foto");
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const saved = await saveService(
        {
          providerId: user.id,
          name: form.name.trim(),
          description: form.description.trim(),
          category: form.category,
          basePrice: parseFloat(form.price),
          photos,
        },
        id,
      );
      await queryClient.invalidateQueries({ queryKey: ["services"] });
      await queryClient.invalidateQueries({ queryKey: ["service", saved.id] });
      toast(id ? "Servicio actualizado." : "¡Servicio publicado!", "success");
      navigate(`/servicio/${saved.id}`, { replace: true });
    } catch (reason) {
      setError(navigator.onLine ? (reason as Error).message : "Necesitas conexión para subir las fotos y publicar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page detail">
      <BackHeader title={id ? "Editar servicio" : "Ofrecer un servicio"} onBack={() => navigate(-1)} />
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <span>Fotos de tu trabajo</span>
          <PhotoPicker photos={photos} onChange={setPhotos} />
          <small className="hint">De 1 a 5 fotos. La primera es la portada.</small>
        </div>
        <label className="field">
          <span>Nombre del servicio</span>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Reparación de fugas" maxLength={90} />
        </label>
        <div className="form-row">
          <label className="field">
            <span>Categoría</span>
            <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Elige una</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Precio base</span>
            <input className="input" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="$0" />
          </label>
        </div>
        <label className="field">
          <span>Descripción</span>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Qué incluye, materiales, tiempos…" />
        </label>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? "Guardando…" : id ? "Guardar cambios" : "Publicar servicio"}
        </button>
      </form>
    </div>
  );
}
