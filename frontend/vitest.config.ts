import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Dirección ficticia para urlQrCredencial en los tests (en un build la fija vite.config.ts).
  test: { environment: "node", env: { VITE_PUBLIC_BASE_URL: "https://club-colina.test" } },
});
