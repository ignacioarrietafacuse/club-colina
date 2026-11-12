import { API } from "@club-colina/shared";
import { afterAll, describe, expect, it } from "vitest";
import { construirApp } from "../../app";
import { configTest, dbTest } from "../../test/db";

const { db, cerrar } = dbTest();
afterAll(cerrar);

describe("GET /api/public/categorias", () => {
  it("lista las categorías con id, nombre y disciplina, nada más", async () => {
    const app = await construirApp({ config: configTest(), db });
    const r = await app.inject({ method: "GET", url: API.public.categorias });
    expect(r.statusCode).toBe(200);
    const cuerpo: { id: number; nombre: string; disciplina: string }[] = r.json();
    expect(cuerpo).toHaveLength(11);
    for (const c of cuerpo) expect(Object.keys(c).sort()).toEqual(["disciplina", "id", "nombre"]);
    expect(cuerpo.filter((c) => c.disciplina === "voleibol").map((c) => c.nombre)).toEqual([
      "U18",
      "U16",
      "U14",
      "U12",
    ]);
    await app.close();
  });
});
