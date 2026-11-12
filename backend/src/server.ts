import { construirApp } from "./app";
import { leerConfig } from "./config";
import { crearDb } from "./db/cliente";

const config = leerConfig();
const { db, cerrar } = crearDb(config.DATABASE_URL);
const app = await construirApp({ config, db });

async function apagar(senal: string) {
  app.log.info({ senal }, "apagando");
  await app.close();
  await cerrar();
  process.exit(0);
}
process.once("SIGTERM", () => void apagar("SIGTERM"));
process.once("SIGINT", () => void apagar("SIGINT"));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.fatal({ err: error }, "no se pudo iniciar el servidor");
  await cerrar();
  process.exit(1);
}
