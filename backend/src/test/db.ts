import { crearDb } from "../db/cliente";
import { verificarHostDestino } from "../lib/guarda-host";
import type { Config } from "../config";

/** Base de tests. Siempre local: la guarda de host impide apuntar a otra cosa. */
export function urlTest(): string {
  const url =
    process.env.DATABASE_URL ?? "postgres://club:club@localhost:5432/club_colina_test";
  verificarHostDestino(url, []);
  return url;
}

export function dbTest() {
  return crearDb(urlTest(), { max: 2 });
}

export function configTest(extra: Partial<Config> = {}): Config {
  return {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 0,
    LOG_LEVEL: "silent",
    DATABASE_URL: urlTest(),
    PUBLIC_BASE_URL: "https://panel.ejemplo.test",
    ORIGENES_PERMITIDOS: [],
    DIAGNOSTICO_TOKEN: undefined,
    ...extra,
  };
}

/** JPEG mínimo válido (1x1), para tests. Es una imagen sintética, no una foto. */
export const JPEG_PRUEBA = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);
