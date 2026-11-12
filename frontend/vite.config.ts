import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SPA estática. En producción Vercel reescribe /api/* al backend (vercel.json);
// en local, el servidor de Vite hace lo mismo hacia el backend en el puerto 3000.
export default defineConfig({
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
});
