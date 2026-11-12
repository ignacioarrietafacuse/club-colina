import { describe, expect, it } from "vitest";
import {
  calcularEdad,
  categoriaCalculada,
  faltantesApoderado,
  faltantesJugador,
  hoyEnChile,
  nombreCompleto,
  requisitosJugador,
} from "./reglas";

const CATS = [
  { id: 10, disciplina: "voleibol", anio_desde: 2013, anio_hasta: 2014, se_calcula: true },
  { id: 20, disciplina: "basketball", anio_desde: 2015, anio_hasta: 2016, se_calcula: true },
  { id: 21, disciplina: "basketball", anio_desde: 2015, anio_hasta: 2016, se_calcula: false },
];

const completo = {
  nombre: "A",
  apellido: "B",
  fecha_nacimiento: "2013-05-10",
  disciplina: "voleibol",
  categoria_id: 1,
  numero_camiseta: "0",
  telefono: null,
  foto_id: "f",
};

describe("reglas del panel", () => {
  it("la fecha de hoy es la de Chile, no la de UTC", () => {
    // 02:00 UTC del 12 de noviembre todavía es 11 de noviembre en Santiago.
    expect(hoyEnChile(new Date("2026-11-12T02:00:00Z"))).toBe("2026-11-11");
    expect(hoyEnChile(new Date("2026-11-12T15:00:00Z"))).toBe("2026-11-12");
  });

  it("la edad se cumple el día del cumpleaños", () => {
    expect(calcularEdad("2008-11-12", "2026-11-11")).toBe(17);
    expect(calcularEdad("2008-11-12", "2026-11-12")).toBe(18);
    expect(calcularEdad(null)).toBeNull();
    expect(calcularEdad("2030-01-01", "2026-11-12")).toBeNull();
  });

  it("el teléfono falta en un adulto (o de edad desconocida) sin apoderado vigente", () => {
    expect(faltantesJugador(completo, false, CATS, "2026-11-12")).toEqual([]);
    const adulto = { ...completo, fecha_nacimiento: "2000-01-01" };
    expect(faltantesJugador(adulto, false, CATS, "2026-11-12")).toEqual(["telefono"]);
    expect(faltantesJugador(adulto, true, CATS, "2026-11-12")).toEqual([]);
    const sinFecha = { ...completo, fecha_nacimiento: null, categoria_id: 10 };
    expect(faltantesJugador(sinFecha, false, CATS, "2026-11-12")).toEqual(["fecha_nacimiento", "telefono"]);
    expect(faltantesJugador(sinFecha, true, CATS, "2026-11-12")).toEqual(["fecha_nacimiento"]);
  });

  it("la categoría falta solo si está vacía y no se puede calcular; no impide activar", () => {
    // Vóley 2013: se calcula U14, no falta.
    expect(faltantesJugador({ ...completo, categoria_id: null }, true, CATS, "2026-11-12")).toEqual([]);
    // Vóley 2017: fuera de la tabla.
    const fuera = faltantesJugador({ ...completo, categoria_id: null, fecha_nacimiento: "2017-03-01", foto_id: null }, true, CATS, "2026-11-12");
    expect(fuera).toEqual(["categoria", "foto"]);
    expect(requisitosJugador(fuera)).toEqual(["foto"]);
    expect(categoriaCalculada(CATS, "voleibol", "2014-12-31")).toBe(10);
    // Básquet 2015: U11 no se calcula si U11 F tampoco; acá hay una sola que se calcula.
    expect(categoriaCalculada(CATS, "basketball", "2015-01-01")).toBe(20);
    expect(categoriaCalculada(CATS, "basketball", null)).toBeNull();
  });

  it("un campo vacío falta solo si es null, igual que el filtro en SQL", () => {
    expect(faltantesApoderado({ nombre: null, apellido: "X", telefono: null, foto_id: "f" })).toEqual(["nombre", "telefono"]);
    expect(faltantesApoderado({ nombre: "", apellido: "X", telefono: "912345678", foto_id: "f" })).toEqual([]);
  });

  it("nombre completo sin partes vacías", () => {
    expect(nombreCompleto("Ana", null)).toBe("Ana");
    expect(nombreCompleto(null, null)).toBe("(sin nombre)");
  });
});
