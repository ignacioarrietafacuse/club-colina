import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { FOTO_MAX_BYTES, FOTOS_MAX_POR_SOLICITUD } from "@club-colina/shared";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Config } from "./config";
import type { Db } from "./db/cliente";
import { ErrorApi, manejarError, resumirError } from "./lib/errores";
import { registrarLimiteIntentos } from "./lib/limite-intentos";
import { limpiarArgumentosDeLog, serializarRequest } from "./lib/logs";
import { rutasAuth } from "./routes/auth";
import { rutasHealth } from "./routes/health";
import { rutasPanel } from "./routes/panel";
import { rutasPublic } from "./routes/public";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    config: Config;
  }
}

type OpcionesLogger = Exclude<FastifyServerOptions["logger"], boolean | undefined>;

export interface OpcionesApp {
  config: Config;
  db: Db;
  /** Para tests: dónde escribir los logs. */
  logStream?: NodeJS.WritableStream;
}

const METODOS_QUE_MODIFICAN = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function construirApp({ config, db, logStream }: OpcionesApp): Promise<FastifyInstance> {
  const logger: OpcionesLogger = {
    level: config.LOG_LEVEL,
    serializers: { req: serializarRequest, err: resumirError },
    hooks: {
      logMethod(args, metodo) {
        limpiarArgumentosDeLog(args);
        metodo.apply(this, args);
      },
    },
    ...(logStream ? { stream: logStream } : {}),
  };

  const app = Fastify({
    logger,
    // Sin proxy de confianza: request.ip es la IP de la conexión. Ver el PR de la Ola 0.
    trustProxy: false,
    bodyLimit: 256 * 1024,
  });

  app.decorate("db", db);
  app.decorate("config", config);

  app.setErrorHandler(manejarError);
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { codigo: "no_encontrado", mensaje: "No encontrado" } }),
  );

  // Las cookies de sesión son SameSite=Lax; además, si el navegador manda Origin en algo
  // que modifica datos, tiene que ser el panel. Las vistas previas de Vercel quedan en
  // solo lectura, como pide flujo-de-trabajo.md.
  const origenes = new Set([config.PUBLIC_BASE_URL, ...config.ORIGENES_PERMITIDOS]);
  app.addHook("onRequest", async (request) => {
    if (!METODOS_QUE_MODIFICAN.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== undefined && !origenes.has(origin)) {
      throw new ErrorApi(403, "origen_no_permitido", "Origen no permitido");
    }
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    return payload;
  });

  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      fileSize: FOTO_MAX_BYTES,
      files: FOTOS_MAX_POR_SOLICITUD,
      fields: 20,
      fieldSize: 64 * 1024,
      parts: FOTOS_MAX_POR_SOLICITUD + 20,
    },
  });
  await registrarLimiteIntentos(app);

  await app.register(rutasHealth);
  await app.register(rutasAuth, { prefix: "/api/auth" });
  await app.register(rutasPanel, { prefix: "/api/panel" });
  await app.register(rutasPublic, { prefix: "/api/public" });

  return app;
}
