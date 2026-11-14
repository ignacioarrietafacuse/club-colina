import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categorias } from "../db/schema";
import { dbTest } from "../test/db";
import {
  cargarCategorias,
  categoriaDelJugador,
  type CategoriaRegla,
  fechaNacimientoValida,
  temporada,
} from "./categorias";

const { db, cerrar } = dbTest();
afterAll(cerrar);

/** Instantes en Chile: el 31 de diciembre a última hora y el 1 de enero recién empezado. */
const FIN_2026 = new Date("2026-12-31T23:59:00-03:00");
const INICIO_2027 = new Date("2027-01-01T00:01:00-03:00");

const BASQUET = ["U9", "U11", "U13", "U15", "U17", "U19", "U21"] as const;
const VOLEY = ["U12", "U14", "U16", "U18"] as const;

describe("categoría por edad de temporada (con las categorías de la migración)", () => {
  let cats: CategoriaRegla[] = [];
  const nombres = new Map<number, string>();
  const nombre = (id: number | null) => (id === null ? null : (nombres.get(id) ?? "?"));
  const calcular = (anio: number | null, disciplina: string, u11f: number | null, ahora: Date) =>
    nombre(
      categoriaDelJugador(
        { fecha_nacimiento: anio === null ? null : `${anio}-06-15`, disciplina, u11f_temporada: u11f },
        cats,
        ahora,
      ),
    );

  beforeAll(async () => {
    cats = await cargarCategorias(db);
    for (const c of await db.select({ id: categorias.id, nombre: categorias.nombre }).from(categorias)) {
      nombres.set(c.id, c.nombre);
    }
  });

  it("trae las 12 categorías", () => {
    expect(cats).toHaveLength(12);
  });

  it("temporada = año calendario en Chile, y cambia el 1 de enero a medianoche de acá", () => {
    expect(temporada(FIN_2026)).toBe(2026);
    expect(temporada(INICIO_2027)).toBe(2027);
    // 2027-01-01 02:30 UTC todavía es 31 de diciembre en Chile.
    expect(temporada(new Date("2027-01-01T02:30:00Z"))).toBe(2026);
  });

  it("básquet: UN = nacidos en temporada − N y temporada − N + 1, en cada categoría", () => {
    for (const c of BASQUET) {
      const n = Number(c.slice(1));
      expect(calcular(2026 - n, "basketball", null, FIN_2026), `${c} mayor`).toBe(c);
      expect(calcular(2026 - n + 1, "basketball", null, FIN_2026), `${c} menor`).toBe(c);
    }
    // Fuera de la tabla: sin categoría.
    expect(calcular(2026 - 7, "basketball", null, FIN_2026)).toBeNull();
    expect(calcular(2026 - 22, "basketball", null, FIN_2026)).toBeNull();
  });

  it("vóley: UN = nacidos en temporada − N y temporada − N + 1, en cada categoría", () => {
    for (const c of VOLEY) {
      const n = Number(c.slice(1));
      expect(calcular(2026 - n, "voleibol", null, FIN_2026), `${c} mayor`).toBe(c);
      expect(calcular(2026 - n + 1, "voleibol", null, FIN_2026), `${c} menor`).toBe(c);
    }
    expect(calcular(2026 - 19, "voleibol", null, FIN_2026)).toBeNull();
  });

  it("un nacido en 2016 en vóley queda sin categoría (no hay U10); en básquet es U11", () => {
    expect(calcular(2016, "voleibol", null, FIN_2026)).toBeNull();
    expect(calcular(2016, "basketball", null, FIN_2026)).toBe("U11");
  });

  it("del 31 de diciembre al 1 de enero todos suben de categoría y la U11 F de 2026 deja de valer", () => {
    // Básquet: el menor de cada categoría pasa a ser el mayor; el mayor sube a la siguiente.
    expect(calcular(2016, "basketball", null, FIN_2026)).toBe("U11");
    expect(calcular(2016, "basketball", null, INICIO_2027)).toBe("U11");
    expect(calcular(2015, "basketball", null, FIN_2026)).toBe("U11");
    expect(calcular(2015, "basketball", null, INICIO_2027)).toBe("U13");
    expect(calcular(2005, "basketball", null, FIN_2026)).toBe("U21");
    expect(calcular(2005, "basketball", null, INICIO_2027)).toBeNull();
    expect(calcular(2019, "basketball", null, FIN_2026)).toBeNull();
    expect(calcular(2019, "basketball", null, INICIO_2027)).toBe("U9");
    // Vóley: el nacido en 2016 entra a U12 recién en 2027.
    expect(calcular(2016, "voleibol", null, INICIO_2027)).toBe("U12");
    expect(calcular(2014, "voleibol", null, FIN_2026)).toBe("U12");
    expect(calcular(2014, "voleibol", null, INICIO_2027)).toBe("U14");
    // La marca U11 F de 2026 vale hasta el 31 de diciembre; el 1 de enero vuelve a la calculada.
    expect(calcular(2015, "basketball", 2026, FIN_2026)).toBe("U11 F");
    expect(calcular(2015, "basketball", 2026, INICIO_2027)).toBe("U13");
    expect(calcular(2015, "basketball", 2027, INICIO_2027)).toBe("U11 F");
  });

  it("la U11 F nunca se calcula sola: solo con la marca de la temporada vigente", () => {
    for (let anio = 1990; anio <= 2026; anio++) {
      expect(calcular(anio, "basketball", null, FIN_2026)).not.toBe("U11 F");
      expect(calcular(anio, "basketball", 2025, FIN_2026)).not.toBe("U11 F");
    }
    // La marca no aplica fuera de básquet.
    expect(calcular(2015, "voleibol", 2026, FIN_2026)).toBe("U12");
    // Con la marca vigente vale aunque falte la fecha.
    expect(calcular(null, "basketball", 2026, FIN_2026)).toBe("U11 F");
  });

  it("sin fecha, o con una fecha inválida, no hay categoría", () => {
    const con = (fecha: string | null) =>
      categoriaDelJugador({ fecha_nacimiento: fecha, disciplina: "basketball", u11f_temporada: null }, cats, FIN_2026);
    expect(con(null)).toBeNull();
    expect(con("2027-03-01")).toBeNull();
    expect(con("1899-12-31")).toBeNull();
    expect(con("2015-02-30")).toBeNull();
  });
});

describe("fecha de nacimiento válida", () => {
  it("un día real, desde 1900 y no posterior a hoy en Chile", () => {
    const hoy = "2026-12-31";
    expect(fechaNacimientoValida("2015-06-15", hoy)).toBe(true);
    expect(fechaNacimientoValida("2026-12-31", hoy)).toBe(true);
    expect(fechaNacimientoValida("2027-01-01", hoy)).toBe(false);
    expect(fechaNacimientoValida("1900-01-01", hoy)).toBe(true);
    expect(fechaNacimientoValida("1899-12-31", hoy)).toBe(false);
    expect(fechaNacimientoValida("2015-02-29", hoy)).toBe(false);
    expect(fechaNacimientoValida("15-06-2015", hoy)).toBe(false);
    expect(fechaNacimientoValida(null, hoy)).toBe(false);
  });
});
