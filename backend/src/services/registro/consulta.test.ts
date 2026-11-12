import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dbTest } from "../../test/db";
import { calcularCategoria, edad, esAdulto, primerNombre, SIN_NOMBRE } from "./consulta";
import { vaciarRegistro } from "./datos-prueba";
import { categorias } from "../../db/schema";

const { db, cerrar } = dbTest();
afterAll(cerrar);
beforeEach(() => vaciarRegistro(db));

describe("consulta: piezas", () => {
  it("edad cumplida según la fecha de hoy en Chile", () => {
    const ahora = new Date("2026-11-12T12:00:00Z");
    expect(edad("2008-11-12", ahora)).toBe(18);
    expect(edad("2008-11-13", ahora)).toBe(17);
    expect(edad("2008-01-01", ahora)).toBe(18);
    // 02:00 UTC del 12 es todavía el 11 en Chile.
    expect(edad("2008-11-12", new Date("2026-11-12T02:00:00Z"))).toBe(17);
  });

  it("sin fecha de nacimiento se le deja seguir como adulto", () => {
    expect(esAdulto({ fecha_nacimiento: null })).toBe(true);
    expect(esAdulto({ fecha_nacimiento: "2015-01-01" })).toBe(false);
  });

  it("primer nombre, con un texto fijo si falta", () => {
    expect(primerNombre("  María  José ")).toBe("María");
    expect(primerNombre(null)).toBe(SIN_NOMBRE);
    expect(primerNombre("")).toBe(SIN_NOMBRE);
  });

  it("categoría por año: U11 F no se calcula, vóley 2017 no tiene", async () => {
    const todas = await db.select().from(categorias);
    const id = (nombre: string, disciplina: string) =>
      todas.find((c) => c.nombre === nombre && c.disciplina === disciplina)?.id;
    expect(await calcularCategoria(db, "basketball", "2015-06-01")).toBe(id("U11", "basketball"));
    expect(await calcularCategoria(db, "voleibol", "2015-06-01")).toBe(id("U12", "voleibol"));
    expect(await calcularCategoria(db, "voleibol", "2017-06-01")).toBeNull();
    expect(await calcularCategoria(db, "basketball", null)).toBeNull();
  });
});
