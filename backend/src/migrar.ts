/**
 * Aplica las migraciones pendientes de backend/migrations/. En Railway corre como comando
 * previo al despliegue (con --produccion): si falla, la versión nueva no sale.
 */
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { crearDb } from "./db/cliente";
import { verificarHostDestino } from "./lib/guarda-host";

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("Falta DATABASE_URL\n");
  process.exit(1);
}
verificarHostDestino(url);

// Funciona tanto desde src/ (tsx) como desde dist/ (bundle): ambos están en backend/.
const carpeta = fileURLToPath(new URL("../migrations", import.meta.url));
const { db, cerrar } = crearDb(url, { max: 1 });
try {
  await migrate(db, { migrationsFolder: carpeta });
  process.stdout.write("Migraciones al día\n");
} finally {
  await cerrar();
}
