import { defineConfig } from "tsup";

// El contrato de shared/ se incluye en el bundle; el resto de las dependencias se
// resuelven desde node_modules en Railway.
export default defineConfig({
  entry: ["src/server.ts", "src/migrar.ts"],
  format: "esm",
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: ["@club-colina/shared"],
});
