// Vite builds the page into static assets and, through Cloudflare's plugin, the Worker that serves them.
// `vite dev` runs the Worker in workerd with the same bindings as production (local D1, real Workers AI).
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare()],
  server: { port: 8788 },
  preview: { port: 8788 },
  build: { target: "es2022" },
  environments: {
    // Two pages: the app at / and the landing page at /about (Cloudflare serves about.html there).
    client: { build: { rolldownOptions: { input: { app: "index.html", about: "about.html" } } } },
  },
});
