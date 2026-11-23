// Preferencia de tema (automático, oscuro o claro), como en el perfil de la app móvil.
export type ThemePreference = "auto" | "dark" | "light";
const KEY = "echo.theme";

export function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY);
    return value === "dark" || value === "light" ? value : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(preference: ThemePreference = readTheme()) {
  const root = document.documentElement;
  if (preference === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
  try {
    localStorage.setItem(KEY, preference);
  } catch {
    // Sin almacenamiento (modo privado): el tema dura solo esta sesión.
  }
  const dark = preference === "dark" || (preference === "auto" && !window.matchMedia("(prefers-color-scheme: light)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0E0F11" : "#F2F3F6");
}
