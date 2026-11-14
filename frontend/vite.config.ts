import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { basePublicaParaVite, VARIABLE_BASE_PUBLICA } from "./src/lib/base-publica";

const RAIZ = path.resolve(import.meta.dirname, "..");

// SPA estática. En producción Vercel reescribe /api/* al backend (vercel.json);
// en local, el servidor de Vite hace lo mismo hacia el backend en el puerto 3000.
export default defineConfig(({ command, mode }) => {
  // La dirección que va en los QR: obligatoria en un build (ver src/lib/base-publica.ts). Se lee
  // del entorno o del .env de la raíz del monorepo (el mismo de `cp .env.example .env`); Vite
  // solo expone las VITE_*, así que DATABASE_URL y las demás no entran al bundle.
  const env = loadEnv(mode, RAIZ, "VITE_");
  const basePublica = basePublicaParaVite(env[VARIABLE_BASE_PUBLICA], {
    esBuild: command === "build",
    // En Vercel no se acepta localhost: el build que se publica tiene que llevar la dirección real.
    exigirPublica: process.env.VERCEL === "1",
  });
  return {
    plugins: [
      // Tiene que ir antes que el plugin de React.
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      {
        // Las metas Open Graph piden una URL absoluta para la imagen (index.html).
        name: "base-publica-en-html",
        transformIndexHtml: (html) => html.replaceAll("__BASE_PUBLICA__", basePublica),
      },
    ],
    resolve: { tsconfigPaths: true },
    server: {
      proxy: { "/api": "http://localhost:3000" },
    },
    define: {
      "import.meta.env.VITE_PUBLIC_BASE_URL": JSON.stringify(basePublica),
    },
  };
});
