import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { basePublicaParaVite, VARIABLE_BASE_PUBLICA } from "./src/lib/base-publica";

// SPA estática. En producción Vercel reescribe /api/* al backend (vercel.json);
// en local, el servidor de Vite hace lo mismo hacia el backend en el puerto 3000.
export default defineConfig(({ command, mode }) => {
  // La dirección que va en los QR: obligatoria en un build (ver src/lib/base-publica.ts).
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const basePublica = basePublicaParaVite(env[VARIABLE_BASE_PUBLICA], command === "build");
  return {
    plugins: [
      // Tiene que ir antes que el plugin de React.
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
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
