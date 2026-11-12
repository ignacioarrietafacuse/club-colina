import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Las migraciones se aplican solas en producción al desplegar. Una que borra, renombra o
 * cambia tipos necesita respaldo manual y el OK de Ignacio (docs/flujo-de-trabajo.md), y
 * tiene que decirlo con una línea `-- destructiva-aprobada: AAAA-MM-DD` que el revisor
 * comprueba contra el chat. Sin esa línea, este test frena el PR.
 */
const carpeta = fileURLToPath(new URL("../../migrations", import.meta.url));
const DESTRUCTIVO =
  /\b(DROP\s|RENAME\s|TRUNCATE\s|DELETE\s+FROM\s|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\s)/i;
const MARCA = /^--\s*destructiva-aprobada:\s*\d{4}-\d{2}-\d{2}\s*$/m;

describe("migraciones", () => {
  const archivos = readdirSync(carpeta).filter((f) => f.endsWith(".sql"));

  it("existen", () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  for (const archivo of archivos) {
    it(`${archivo}: si es destructiva, está marcada como aprobada`, () => {
      const sql = readFileSync(`${carpeta}/${archivo}`, "utf8");
      const sinComentarios = sql
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("--"))
        .join("\n");
      if (DESTRUCTIVO.test(sinComentarios)) {
        expect(MARCA.test(sql), `${archivo} borra o transforma datos y no está marcada`).toBe(true);
      }
    });
  }
});
