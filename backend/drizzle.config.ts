import { defineConfig } from "drizzle-kit";

// Solo genera SQL a partir del esquema; no se conecta a ninguna base.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
