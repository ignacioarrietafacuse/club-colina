import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { construirApp } from "./app";
import { arrancar } from "./arranque";
import { type Config, leerConfig } from "./config";
import { crearDb } from "./db/cliente";
import { aplicarMigraciones } from "./db/migraciones";
import { resumirError } from "./lib/errores";
import { verificarHostDestino } from "./lib/guarda-host";

function registrarFalla(etapa: string, error: unknown) {
  // Sin el mensaje del error: puede traer parámetros de la consulta (ver resumirError).
  process.stderr.write(
    `${JSON.stringify({ level: 60, msg: `no se pudo arrancar: ${etapa}`, err: resumirError(error) })}\n`,
  );
}

let config: Config;
try {
  config = leerConfig();
  // El servidor migra una base remota solo con NODE_ENV=production y MIGRAR_AL_ARRANCAR=si
  // (las dos puestas en el servicio de Railway). Si no, la guarda de host lo frena.
  if (config.NODE_ENV !== "production" || config.MIGRAR_AL_ARRANCAR !== "si") {
    verificarHostDestino(config.DATABASE_URL);
  }
} catch (error) {
  registrarFalla("configuración", error);
  process.exit(1);
}

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
  fallar: registrarFalla,
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
