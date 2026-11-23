import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getContracting, getContractingPrivateLocation, listCategories, saveContracting } from "../api/catalog";
import type { Coords } from "../api/models";
import { useSignedInUser } from "../auth/AuthContext";
import { useUserLocation } from "../hooks/useLocation";
import { useToast } from "../components/Layout";
import PhotoPicker from "../components/PhotoPicker";
import Icon from "../components/Icon";
import { BackHeader } from "../components/ui";
import { validatePrice } from "../utils/validations";
import "./publish.css";

export default function ContractingEditor() {
  const { id } = useParams();
  const user = useSignedInUser();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const userLocation = useUserLocation();
  const categories = useQuery({ queryKey: ["categories"], queryFn: listCategories, staleTime: 30 * 60_000 });
  const existing = useQuery({ queryKey: ["contracting", id], queryFn: () => getContracting(id!), enabled: !!id });
  const privateLocation = useQuery({ queryKey: ["contracting-location", id], queryFn: () => getContractingPrivateLocation(id!), enabled: !!id });
  const [form, setForm] = useState({ name: "", description: "", category: "", price: "" });
  const [photos, setPhotos] = useState<(string | File)[]>([]);
  // undefined = sin cambios (al editar); null = sin ubicación; Coords = punto exacto.
  const [location, setLocation] = useState<Coords | null | undefined>(id ? undefined : userLocation.coords);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    const c = existing.data;
    setForm({ name: c.name, description: c.description, category: c.category, price: String(c.base_price) });
    setPhotos(c.photos ?? []);
  }, [existing.data]);

  const shownLocation = location === undefined ? privateLocation.data : location;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem =
      (form.name.trim().length < 4 && "Describe lo que necesitas en al menos 4 letras") ||
      (!form.category && "Elige una categoría") ||
      validatePrice(form.price) ||
      (!form.description.trim() && "Agrega una descripción") ||
      (photos.length === 0 && "Agrega al menos una foto de referencia");
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const saved = await saveContracting(
        {
          ownerId: user.id,
          name: form.name.trim(),
          description: form.description.trim(),
          category: form.category,
          basePrice: parseFloat(form.price),
          photos,
          location,
        },
        id,
      );
      await queryClient.invalidateQueries({ queryKey: ["contractings"] });
      await queryClient.invalidateQueries({ queryKey: ["contracting", saved.id] });
      toast(id ? "Contratación actualizada." : "¡Contratación publicada!", "success");
      navigate(`/contratacion/${saved.id}`, { replace: true });
    } catch (reason) {
      setError(navigator.onLine ? (reason as Error).message : "Necesitas conexión para subir las fotos y publicar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page detail">
      <BackHeader title={id ? "Editar contratación" : "Buscar un profesional"} onBack={() => navigate(-1)} />
      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span>¿Qué necesitas?</span>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Mi aire acondicionado no enfría" maxLength={90} />
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
            <span>Presupuesto</span>
            <input className="input" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="$0" />
          </label>
        </div>
        <label className="field">
          <span>Descripción</span>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Cuenta qué pasa, desde cuándo y cualquier detalle útil." />
        </label>
        <div className="field">
          <span>Fotos de referencia</span>
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </div>
        <div className="field">
          <span>Ubicación</span>
          <div className="panel location-panel">
            <Icon name="pin" />
            <p className="muted">
              {shownLocation
                ? "Usaremos tu ubicación actual. Los profesionales solo ven una zona aproximada (~500 m); el punto exacto solo lo ves tú."
                : "Sin ubicación: la contratación no aparecerá ordenada por cercanía."}
            </p>
          </div>
          <div className="form-row">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={async () => {
                const coords = await userLocation.locate();
                if (coords) setLocation(coords);
              }}
              disabled={userLocation.locating}
            >
              <Icon name="navigation" size={16} /> {userLocation.locating ? "Ubicando…" : "Usar mi ubicación"}
            </button>
            {shownLocation ? (
              <button className="btn btn-ghost" type="button" onClick={() => setLocation(null)}>
                Quitar ubicación
              </button>
            ) : null}
          </div>
          {userLocation.error ? <small className="error-text">{userLocation.error}</small> : null}
        </div>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? "Guardando…" : id ? "Guardar cambios" : "Publicar contratación"}
        </button>
      </form>
    </div>
  );
}
