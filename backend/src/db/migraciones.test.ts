import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Las migraciones se aplican solas en producción: el backend las corre al arrancar. Una que borra, renombra o
 * cambia tipos necesita respaldo manual y el OK de Ignacio (docs/flujo-de-trabajo.md), y
 * tiene que decirlo con una línea `-- destructiva-aprobada: AAAA-MM-DD` que el revisor
 * comprueba contra el chat. Sin esa línea, este test frena el PR.
 */
const carpeta = fileURLToPath(new URL("../../migrations", import.meta.url));
const DESTRUCTIVO = [
  /\b(DROP|RENAME|TRUNCATE)\s/i,
  /\bDELETE\s+FROM\s/i,
  /\bSET\s+NOT\s+NULL\b/i,
  /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\s/i,
  // UPDATE como sentencia (no el "ON UPDATE" de una FK).
  /(^|;|-->\s*statement-breakpoint)\s*UPDATE\s/im,
];
const MARCA = /^--\s*destructiva-aprobada:\s*\d{4}-\d{2}-\d{2}\s*$/m;

describe("migraciones", () => {
  const archivos = readdirSync(carpeta).filter((f) => f.endsWith(".sql"));

  it("existen", () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it("el detector reconoce lo destructivo y no confunde ON UPDATE", () => {
    const es = (sql: string) => DESTRUCTIVO.some((r) => r.test(sql));
    expect(es(`ALTER TABLE "x" DROP COLUMN "y";`)).toBe(true);
    expect(es(`UPDATE "jugadores" SET "estado" = 'activo';`)).toBe(true);
    expect(es(`ALTER TABLE "x" ALTER COLUMN "y" SET NOT NULL;`)).toBe(true);
    expect(es(`ALTER TABLE "x" ALTER COLUMN "y" SET DATA TYPE text;`)).toBe(true);
    expect(es(`ALTER TABLE "x" ADD CONSTRAINT "f" FOREIGN KEY ("a") REFERENCES "b"("id") ON DELETE cascade ON UPDATE no action;`)).toBe(false);
    expect(es(`CREATE TABLE "x" ("id" uuid);`)).toBe(false);
  });

  for (const archivo of archivos) {
    it(`${archivo}: si es destructiva, está marcada como aprobada`, () => {
      const sql = readFileSync(`${carpeta}/${archivo}`, "utf8");
      const sinComentarios = sql
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("--"))
        .join("\n");
      if (DESTRUCTIVO.some((r) => r.test(sinComentarios))) {
        expect(MARCA.test(sql), `${archivo} borra o transforma datos y no está marcada`).toBe(true);
      }
    });
  }
});
