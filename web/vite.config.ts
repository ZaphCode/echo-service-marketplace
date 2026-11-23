/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// La PWA se publica en GitHub Pages junto a la página del proyecto:
// https://zaphcode.github.io/echo-service-marketplace/app/
const base = process.env.ECHO_BASE ?? "/echo-service-marketplace/app/";

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "1.0.0") },
  plugins: [
    react(),
    VitePWA({
      // Service Worker propio (src/sw.ts); el plugin solo inyecta la lista de precaché.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,ttf,webp,ico}"],
        globIgnores: ["screenshots/**"],
      },
      devOptions: { enabled: false },
      manifest: {
        id: base,
        name: "Echo · Servicios del hogar en B.C.S.",
        short_name: "Echo",
        description:
          "Encuentra plomeros, electricistas y más profesionales cerca de ti en Baja California Sur. Negocia precio y fecha en un chat.",
        lang: "es-MX",
        dir: "ltr",
        start_url: base,
        scope: base,
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait",
        background_color: "#0E0F11",
        theme_color: "#0E0F11",
        categories: ["business", "lifestyle", "utilities"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Solicitudes", short_name: "Solicitudes", url: `${base}#/solicitudes`, icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
          { name: "Publicar", short_name: "Publicar", url: `${base}#/publicar`, icons: [{ src: "icons/icon-192.png", sizes: "192x192" }] },
        ],
        screenshots: [
          { src: "screenshots/inicio-movil.png", sizes: "540x1170", type: "image/png", form_factor: "narrow", label: "Servicios cerca de ti" },
          { src: "screenshots/inicio-escritorio.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Catálogo en escritorio" },
        ],
      },
    }),
  ],
  build: {
    target: "es2022",
  },
  server: { port: 5175 },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
