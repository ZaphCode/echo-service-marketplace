// Formatos iguales a los de la app móvil (src/utils/format.ts).

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

export function formatPrice(value: number | string): string {
  return currency.format(Number(value) || 0);
}

export function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function formatRelativeDate(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const units: [number, number, string][] = [
    [hour, minute, "min"],
    [day, hour, "h"],
    [7 * day, day, "día"],
    [30 * day, 7 * day, "semana"],
    [365 * day, 30 * day, "mes"],
    [Infinity, 365 * day, "año"],
  ];

  if (abs < minute) return "Hace un momento";
  const [, unit, label] = units.find(([limit]) => abs < limit)!;
  const amount = Math.max(1, Math.trunc(abs / unit));
  const plural = label === "min" || label === "h" || amount === 1 ? label : label === "mes" ? "meses" : `${label}s`;
  return diff < 0 ? `Hace ${amount} ${plural}` : `En ${amount} ${plural}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Convierte *negritas* del texto de las notificaciones en segmentos. */
export function boldSegments(text: string): { text: string; bold: boolean }[] {
  return text.split("*").map((part, index) => ({ text: part, bold: index % 2 === 1 })).filter((part) => part.text);
}
