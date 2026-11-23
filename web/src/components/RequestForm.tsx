import { useState, type FormEvent } from "react";
import { dateInputToIso, isoToDateInput, todayInput, validateDate, validatePrice } from "../utils/validations";

export type RequestFormValues = { price: number; date: string; notes: string };

/**
 * Propuesta de precio y fecha. En modo «solicitud» también lleva notas (primera propuesta);
 * en modo «oferta» es una contrapropuesta dentro del chat. Mismas reglas que la app móvil.
 */
export default function RequestForm({
  mode,
  defaultPrice,
  defaultDate,
  submitLabel,
  busy,
  onSubmit,
}: {
  mode: "request" | "offer";
  defaultPrice?: number;
  defaultDate?: string;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: RequestFormValues) => void;
}) {
  const [price, setPrice] = useState(defaultPrice ? String(defaultPrice) : "");
  const [date, setDate] = useState(defaultDate ? isoToDateInput(defaultDate) : "");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<{ price?: string | null; date?: string | null }>({});

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = { price: validatePrice(price), date: validateDate(date) };
    setErrors(next);
    if (next.price || next.date) return;
    onSubmit({ price: parseFloat(price), date: dateInputToIso(date), notes: notes.trim() });
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="form-row">
        <label className="field">
          <span>{mode === "request" ? "Tu oferta inicial" : "Precio"}</span>
          <input className="input" inputMode="decimal" placeholder="$0" value={price} onChange={(e) => setPrice(e.target.value)} />
          {errors.price ? <small className="error-text">{errors.price}</small> : null}
        </label>
        <label className="field">
          <span>Fecha</span>
          <input className="input" type="date" min={todayInput()} value={date} onChange={(e) => setDate(e.target.value)} />
          {errors.date ? <small className="error-text">{errors.date}</small> : null}
        </label>
      </div>
      {mode === "request" ? (
        <label className="field">
          <span>Notas (opcional)</span>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe el trabajo, medidas o detalles importantes." maxLength={500} />
        </label>
      ) : null}
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
        {busy ? "Enviando…" : submitLabel}
      </button>
    </form>
  );
}
