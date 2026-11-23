# Echo PWA

Versión web progresiva de Echo, la app de servicios del hogar en Baja California Sur. Usa el mismo
esquema de Supabase y las mismas reglas que la app móvil (tablas, RLS, consultas, negociación y
notificaciones), sobre un proyecto de Supabase creado con las migraciones y el seed de este repositorio.

Publicada en <https://zaphcode.github.io/echo-service-marketplace/app/>.

## Stack

- React 19 + TypeScript + Vite, navegación con React Router (rutas con `#`) y datos con TanStack Query.
- `@supabase/supabase-js` directo desde el navegador (Auth, Postgres con RLS, Storage y Realtime).
- Service Worker propio (`src/sw.ts`) con módulos de Workbox, generado con `vite-plugin-pwa` en modo `injectManifest`.
- Pruebas con Vitest (`npm test`).

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5175/echo-service-marketplace/app/
npm test
npm run build && npm run preview
```

La configuración pública (URL de Supabase, llave publicable y llave pública VAPID) está en
`src/config.ts`; se puede sobrescribir con `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
