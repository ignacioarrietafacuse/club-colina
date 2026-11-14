import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dbTest } from "../../test/db";
import { edad, esAdulto, faltantesJugador, primerNombre, SIN_NOMBRE } from "./consulta";
import { vaciarRegistro } from "./datos-prueba";

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

  it("sin fecha de nacimiento no se sabe si es adulto: ante la duda, no", () => {
    expect(esAdulto({ fecha_nacimiento: null })).toBe(false);
    expect(esAdulto({ fecha_nacimiento: "2000-01-01" })).toBe(true);
    expect(esAdulto({ fecha_nacimiento: "2015-01-01" })).toBe(false);
  });

  it("primer nombre, con un texto fijo si falta", () => {
    expect(primerNombre("  María  José ")).toBe("María");
    expect(primerNombre(null)).toBe(SIN_NOMBRE);
    expect(primerNombre("")).toBe(SIN_NOMBRE);
  });

  it("la categoría nunca se pregunta: sin fecha, o con una inválida, se pide la fecha", () => {
    const base = { nombre: "A", apellido: "B", numero_camiseta: "7", telefono: null, foto_id: "f" };
    const con = (fecha_nacimiento: string | null) => faltantesJugador({ ...base, fecha_nacimiento }, { adulto: false });
    // Nacido en 2016 (en vóley, sin categoría: no hay U10): no falta nada.
    expect(con("2016-06-01")).toEqual([]);
    expect(con(null)).toEqual(["fecha_nacimiento"]);
    expect(con("2999-01-01")).toEqual(["fecha_nacimiento"]);
  });
});
