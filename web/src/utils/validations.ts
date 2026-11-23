// Mismas reglas que src/utils/validations.ts de la app móvil. Devuelven el mensaje de error o null.

export function validateEmail(value: string) {
  if (!value.trim()) return "El correo es requerido";
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value.trim()) ? null : "El correo no es válido";
}

export function validateName(value: string) {
  const name = value.trim();
  if (!name) return "El nombre es requerido";
  if (name.length < 3) return "El nombre debe tener al menos 3 caracteres";
  if (name.length > 60) return "El nombre no puede tener más de 60 caracteres";
  return /^[a-zA-ZÀ-ÖØ-öø-ÿ\s'.-]+$/.test(name) ? null : "El nombre solo puede tener letras";
}

export function validatePassword(value: string) {
  if (!value) return "La contraseña es requerida";
  if (value.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (value.length > 20) return "La contraseña no puede tener más de 20 caracteres";
  return null;
}

export function validatePhone(value: string) {
  if (!value.trim()) return "El número telefónico es requerido";
  if (!/^(\+?\d{1,3})?\s?(\d[\d\s]{8,})$/.test(value.trim())) return "El número telefónico no es válido";
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 10) return "Debe tener al menos 10 dígitos";
  if (digits.length > 15) return "Debe tener máximo 15 dígitos";
  return null;
}

export function validateZip(value: string) {
  if (!value.trim()) return "El código postal es requerido";
  return /^\d{5}$/.test(value.trim()) ? null : "El código postal debe tener 5 dígitos";
}

export function validatePrice(value: string) {
  if (!value.trim()) return "El precio es requerido";
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(value.trim())) return "El precio no es válido";
  return parseFloat(value) > 0 ? null : "El precio debe ser mayor a cero";
}

/** Fecha de una propuesta: válida y no anterior a hoy (se compara por día). */
export function validateDate(value: string) {
  if (!value) return "La fecha es requerida";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "La fecha no es válida";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today ? "La fecha no puede ser anterior a hoy" : null;
}

/** <input type="date"> da AAAA-MM-DD; se guarda a mediodía local para no cambiar de día por zona horaria. */
export function dateInputToIso(value: string) {
  return new Date(`${value}T12:00:00`).toISOString();
}

export function isoToDateInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayInput() {
  return isoToDateInput(new Date().toISOString());
}
