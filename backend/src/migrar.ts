/**
 * Aplica a mano las migraciones pendientes (desarrollo local). En producción no hace falta:
 * el backend las aplica al arrancar (src/server.ts). Contra un host que no sea localhost
 * exige --produccion.
 */
import { fileURLToPath } from "node:url";
import { aplicarMigraciones } from "./db/migraciones";
import { verificarHostDestino } from "./lib/guarda-host";

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("Falta DATABASE_URL\n");
  process.exit(1);
}
verificarHostDestino(url);

// Funciona tanto desde src/ (tsx) como desde dist/ (bundle): ambos están en backend/.
await aplicarMigraciones(url, fileURLToPath(new URL("../migrations", import.meta.url)));
process.stdout.write("Migraciones al día\n");
