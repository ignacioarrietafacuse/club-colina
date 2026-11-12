import { crearDb } from "../db/cliente";
import { verificarHostDestino } from "../lib/guarda-host";
import type { Config } from "../config";

/**
 * Base de tests: TEST_DATABASE_URL (nunca DATABASE_URL). Los tests la vacían entera, así
 * que tiene que estar en localhost y llamarse *_test.
 */
export function urlTest(): string {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgres://club:club@localhost:5432/club_colina_test";
  verificarHostDestino(url, []);
  if (!new URL(url).pathname.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL tiene que apuntar a una base cuyo nombre termine en _test");
  }
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
    MIGRAR_AL_ARRANCAR: "no",
    DIAGNOSTICO_TOKEN: undefined,
    ...extra,
  };
}

/** Imágenes sintéticas de 8x8 de un solo color, para tests. No son fotos de nadie. */
export const JPEG_PRUEBA = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDgKKKK+eP2E//Z",
  "base64",
);
export const PNG_PRUEBA = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8ISfHgA0wYRUdtBIA0MoBFD5jqJkAAAAASUVORK5CYII=",
  "base64",
);
export const WEBP_PRUEBA = Buffer.from(
  "UklGRjoAAABXRUJQVlA4IC4AAACwAQCdASoIAAgAAUAmJaACdLoABDAAAP7x3I/4DdfFtMv/vYL/3YL/3YL/WwAA",
  "base64",
);
