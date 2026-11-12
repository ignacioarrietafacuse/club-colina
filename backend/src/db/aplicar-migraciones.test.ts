import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { dbTest, urlTest } from "../test/db";
import { aplicarMigraciones } from "./migraciones";

const carpeta = fileURLToPath(new URL("../../migrations", import.meta.url));
const { db, cerrar } = dbTest();
const temporales: string[] = [];
afterAll(async () => {
  for (const t of temporales) rmSync(t, { recursive: true, force: true });
  await cerrar();
});

async function aplicadas() {
  const filas = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
  );
  return filas[0]?.n;
}

/** Copia las migraciones reales y les agrega una que falla a la mitad. */
function carpetaConMigracionRota() {
  const destino = mkdtempSync(join(tmpdir(), "migraciones-"));
  temporales.push(destino);
  cpSync(carpeta, destino, { recursive: true });
  const journal: { entries: { idx: number; when: number; tag: string }[] } = JSON.parse(
    readFileSync(join(destino, "meta/_journal.json"), "utf8"),
  );
  const ultima = journal.entries.at(-1);
  const tag = "9999_rota";
  journal.entries.push({
    ...(ultima ?? { idx: 0, when: 0, tag }),
    idx: (ultima?.idx ?? 0) + 1,
    when: (ultima?.when ?? 0) + 1000,
    tag,
  });
  writeFileSync(join(destino, "meta/_journal.json"), JSON.stringify(journal));
  writeFileSync(
    join(destino, `${tag}.sql`),
    "CREATE TABLE prueba_rota (id int);\n--> statement-breakpoint\nSELECT * FROM tabla_que_no_existe;\n",
  );
  return destino;
}

describe("migraciones al arrancar", () => {
  it("con la base al día no hace nada y se puede repetir", async () => {
    const antes = await aplicadas();
    await aplicarMigraciones(urlTest(), carpeta);
    await aplicarMigraciones(urlTest(), carpeta);
    expect(await aplicadas()).toBe(antes);
  });

  it("dos arranques a la vez no chocan", async () => {
    await Promise.all([aplicarMigraciones(urlTest(), carpeta), aplicarMigraciones(urlTest(), carpeta)]);
  });

  it("si una migración falla, rechaza y no deja nada a medias", async () => {
    const antes = await aplicadas();
    await expect(aplicarMigraciones(urlTest(), carpetaConMigracionRota())).rejects.toThrow();
    expect(await aplicadas()).toBe(antes);
    const tabla = await db.execute<{ existe: string | null }>(
      sql`select to_regclass('public.prueba_rota')::text as existe`,
    );
    expect(tabla[0]?.existe).toBeNull();
    // Y el candado quedó libre: la siguiente corrida normal pasa.
    await aplicarMigraciones(urlTest(), carpeta);
  });
});
