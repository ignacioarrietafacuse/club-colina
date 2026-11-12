import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { construirApp } from "./app";
import { arrancar } from "./arranque";
import { leerConfig } from "./config";
import { crearDb } from "./db/cliente";
import { aplicarMigraciones } from "./db/migraciones";
import { resumirError } from "./lib/errores";
import { verificarHostDestino } from "./lib/guarda-host";

const config = leerConfig();
// Fuera de producción, el servidor solo migra una base local (o con --produccion explícito).
if (config.NODE_ENV !== "production") verificarHostDestino(config.DATABASE_URL);

// Funciona desde src/ (tsx) y desde dist/ (bundle): ambos están en backend/.
const carpeta = fileURLToPath(new URL("../migrations", import.meta.url));
const { db, cerrar } = crearDb(config.DATABASE_URL);
let app: FastifyInstance | undefined;

const ok = await arrancar({
  migrar: async () => {
    await aplicarMigraciones(config.DATABASE_URL, carpeta);
    process.stdout.write(`${JSON.stringify({ level: 30, msg: "migraciones al día" })}\n`);
  },
  levantar: async () => {
    app = await construirApp({ config, db });
    await app.listen({ host: config.HOST, port: config.PORT });
  },
  fallar: (etapa, error) => {
    // Sin el mensaje del error: puede traer parámetros de la consulta (ver resumirError).
    process.stderr.write(
      `${JSON.stringify({ level: 60, msg: `no se pudo arrancar: ${etapa}`, err: resumirError(error) })}\n`,
    );
  },
});
if (!ok) {
  await app?.close();
  await cerrar();
  process.exit(1);
}

async function apagar(senal: string) {
  app?.log.info({ senal }, "apagando");
  await app?.close();
  await cerrar();
  process.exit(0);
}
process.once("SIGTERM", () => void apagar("SIGTERM"));
process.once("SIGINT", () => void apagar("SIGINT"));
