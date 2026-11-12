/**
 * Tests de la importación de la base 2026. Solo datos sintéticos: nombres inventados y RUT de
 * `generarRutFicticio()`. La planilla real nunca entra a los tests ni al repo.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { generarRutFicticio } from "@club-colina/shared";
import { dbTest, urlTest } from "../src/test/db";
import { apoderados, jugadorApoderado, jugadores } from "../src/db/schema";
import {
  claveCategoria,
  edad,
  ErrorImportacion,
  formatearResumen,
  importar,
  leerArgumentos,
  leerCategorias,
  main,
  normalizarDisciplina,
  normalizarEmail,
  normalizarFecha,
  normalizarMetodoPago,
  normalizarSiNo,
  normalizarTelefono,
  planificar,
  separarNombre,
  ubicarColumnas,
  type Categoria,
} from "./importar-base-2026";

const HOY = new Date(Date.UTC(2026, 10, 12));
const { db, cerrar } = dbTest();
afterAll(cerrar);

// RUT ficticios con semillas propias de este archivo.
const rut = (n: number) => generarRutFicticio(7000 + n);
/** El mismo RUT escrito como en una planilla: con puntos y k minúscula. */
const conPuntos = (r: string) => {
  const [cuerpo = "", dv = ""] = r.split("-");
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv.toLowerCase()}`;
};
/** RUT con el dígito verificador cambiado: inválido. */
const rutMalo = (r: string) => `${r.slice(0, -1)}${r.endsWith("1") ? "2" : "1"}`;

const ENCABEZADOS = [
  "Nombre jugador",
  "Apellido jugador",
  "RUT jugador",
  "Fecha de nacimiento",
  "Rama",
  "Categoría",
  "Postula a beca",
  "Nombre apoderado",
  "RUT apoderado",
  "Teléfono apoderado",
  "Teléfono 2",
  "Correo apoderado",
  "Método de pago",
  "Condición de salud",
];

type Fila = {
  nombre?: string;
  apellido?: string;
  rut?: string;
  fecha?: unknown;
  rama?: string;
  categoria?: string;
  beca?: unknown;
  apoderado?: string;
  rutApoderado?: string;
  telefono?: unknown;
  correo?: string;
  pago?: string;
};

function fila(f: Fila): unknown[] {
  return [
    f.nombre ?? "Tomasa",
    f.apellido ?? "Prueba Ficticia",
    f.rut ?? null,
    f.fecha ?? "15-03-2014",
    f.rama ?? "Básquetbol",
    f.categoria ?? "U13",
    f.beca ?? "No",
    f.apoderado ?? "Ana María Inventada Soto",
    f.rutApoderado ?? null,
    f.telefono ?? "+56 9 1234 5678",
    "987654321",
    f.correo ?? "Ana.Inventada@Ejemplo.cl",
    f.pago ?? "Forpay mensual",
    "dato sensible que no se importa",
  ];
}

/** Planilla sintética: una fila de título, los encabezados y las filas de datos. */
function planilla(filas: Fila[]): unknown[][] {
  return [["Inscripciones 2026 (sintético)"], ENCABEZADOS, ...filas.map(fila)];
}

let categorias: Categoria[] = [];
async function plan(filas: Fila[]) {
  if (categorias.length === 0) categorias = await leerCategorias(db);
  const hoja = planilla(filas);
  const { filaEncabezado, columnas } = ubicarColumnas(hoja);
  return planificar(hoja, columnas, filaEncabezado, categorias, HOY);
}
const idCategoria = (nombre: string, disciplina: string) =>
  categorias.find((c) => c.nombre === nombre && c.disciplina === disciplina)?.id;

const RUTS = Array.from({ length: 40 }, (_, i) => rut(i));
async function limpiar() {
  await db.delete(jugadores).where(inArray(jugadores.rut, RUTS));
  await db.delete(apoderados).where(inArray(apoderados.rut, RUTS));
}
beforeEach(limpiar);
afterAll(limpiar);

describe("normalización de celdas", () => {
  it("teléfono: 9 dígitos sin +56; incompleto o con letras queda vacío", () => {
    expect(normalizarTelefono("+56 9 1234 5678")).toBe("912345678");
    expect(normalizarTelefono("9 1234 5678")).toBe("912345678");
    expect(normalizarTelefono(912345678)).toBe("912345678");
    expect(normalizarTelefono("56-2-2345-6789")).toBe("223456789");
    expect(normalizarTelefono("9123456")).toBeNull();
    expect(normalizarTelefono("091234567")).toBeNull();
    expect(normalizarTelefono("no tiene")).toBeNull();
    expect(normalizarTelefono("")).toBeNull();
  });

  it("correo: en minúsculas; mal escrito queda vacío", () => {
    expect(normalizarEmail(" Ana.Inventada@Ejemplo.CL ")).toBe("ana.inventada@ejemplo.cl");
    expect(normalizarEmail("ana@gmail.con")).toBeNull();
    expect(normalizarEmail("ana@gmial.com")).toBeNull();
    expect(normalizarEmail("ana.gmail.com")).toBeNull();
    expect(normalizarEmail("ana@ejemplo")).toBeNull();
  });

  it("fecha: celda de fecha, serie de Excel y textos; errónea queda vacía", () => {
    expect(normalizarFecha(new Date(Date.UTC(2014, 2, 15)), HOY)).toBe("2014-03-15");
    expect(normalizarFecha(41713, HOY)).toBe("2014-03-15");
    expect(normalizarFecha("15-03-2014", HOY)).toBe("2014-03-15");
    expect(normalizarFecha("5/3/2014", HOY)).toBe("2014-03-05");
    expect(normalizarFecha("2014-03-15", HOY)).toBe("2014-03-15");
    expect(normalizarFecha("31-02-2014", HOY)).toBeNull();
    expect(normalizarFecha("15-03-2026", HOY)).toBeNull();
    expect(normalizarFecha("15-03-1900", HOY)).toBeNull();
    expect(normalizarFecha("marzo 2014", HOY)).toBeNull();
  });

  it("edad cumplida a la fecha de referencia", () => {
    expect(edad("2008-11-12", HOY)).toBe(18);
    expect(edad("2008-11-13", HOY)).toBe(17);
  });

  it("rama, método de pago, beca, nombre y categoría", () => {
    expect(normalizarDisciplina("Básquetbol")).toBe("basketball");
    expect(normalizarDisciplina("VÓLEY")).toBe("voleibol");
    expect(normalizarDisciplina("básquet y vóley")).toBeNull();
    expect(normalizarDisciplina("fútbol")).toBeNull();
    expect(normalizarMetodoPago("Forpay mensual")).toBe("forpay_mensual");
    expect(normalizarMetodoPago("Transferencia anual")).toBe("transferencia_anual");
    expect(normalizarMetodoPago("Tarjeta de crédito anual")).toBe("tarjeta_credito_anual");
    expect(normalizarMetodoPago("Forpay o transferencia")).toBeNull();
    expect(normalizarMetodoPago("efectivo")).toBeNull();
    expect(normalizarSiNo("Sí")).toBe(true);
    expect(normalizarSiNo("no")).toBe(false);
    expect(normalizarSiNo(null)).toBe(false);
    expect(normalizarSiNo("tal vez")).toBeNull();
    expect(separarNombre("Ana María Inventada")).toEqual({ nombre: "Ana", apellido: "María Inventada" });
    expect(separarNombre("Ana")).toEqual({ nombre: "Ana", apellido: null });
    expect(claveCategoria("Sub-13")).toBe("U13");
    expect(claveCategoria("u11 f")).toBe("U11F");
  });
});

describe("columnas", () => {
  it("encuentra los encabezados bajo una fila de título y no confunde el teléfono 2", () => {
    const { filaEncabezado, columnas } = ubicarColumnas(planilla([]));
    expect(filaEncabezado).toBe(1);
    expect(columnas.apoderado_telefono).toBe(ENCABEZADOS.indexOf("Teléfono apoderado"));
    expect(columnas.categoria).toBe(ENCABEZADOS.indexOf("Categoría"));
  });

  it("si falta una columna, el error nombra encabezados y nunca celdas de datos", () => {
    const hoja = planilla([{ rut: rut(0), nombre: "Nombreunico" }]);
    hoja[1] = ENCABEZADOS.map((e) => (e === "Método de pago" ? "Pago" : e));
    expect(() => ubicarColumnas(hoja)).toThrow(ErrorImportacion);
    try {
      ubicarColumnas(hoja);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : "";
      expect(mensaje).toContain("metodo_pago");
      expect(mensaje).not.toContain("Nombreunico");
      expect(mensaje).not.toContain(rut(0).slice(0, 4));
    }
    // Con --columna se indica el encabezado real.
    expect(ubicarColumnas(hoja, { metodo_pago: "Pago" }).columnas.metodo_pago).toBe(
      ENCABEZADOS.indexOf("Método de pago"),
    );
  });

  it("dos columnas que calzan con el mismo campo es un error", () => {
    const hoja = planilla([]);
    hoja[1] = [...ENCABEZADOS, "Correo"];
    expect(() => ubicarColumnas(hoja)).toThrow(/apoderado_email/);
  });
});

describe("reglas de la carga inicial", () => {
  it("carga jugador, apoderado y vínculo con los datos estandarizados", async () => {
    const p = await plan([{ rut: conPuntos(rut(1)), rutApoderado: conPuntos(rut(2)), beca: "Sí" }]);
    expect(p.jugadores.get(rut(1))).toMatchObject({
      rut: rut(1),
      fecha_nacimiento: "2014-03-15",
      disciplina: "basketball",
      categoria_id: idCategoria("U13", "basketball"),
      postula_beca: true,
      telefono: null,
      email: null,
      metodo_pago: null,
    });
    expect(p.apoderados.get(rut(2))).toMatchObject({
      nombre: "Ana",
      apellido: "María Inventada Soto",
      telefono: "912345678",
      email: "ana.inventada@ejemplo.cl",
      metodo_pago: "forpay_mensual",
    });
    expect(p.vinculos).toEqual([{ jugadorRut: rut(1), apoderadoRut: rut(2), paga_mensualidad: true }]);
  });

  it("jugador con RUT no válido: no se carga, pero su apoderado sí", async () => {
    const p = await plan([{ rut: rutMalo(rut(1)), rutApoderado: rut(2) }]);
    expect(p.jugadores.size).toBe(0);
    expect(p.jugadoresOmitidos).toEqual({ rut_invalido: [3] });
    expect(p.apoderados.has(rut(2))).toBe(true);
    expect(p.vinculos).toEqual([]);
  });

  it("apoderado con RUT no válido o igual al del hijo menor: el jugador queda sin apoderado", async () => {
    const p = await plan([
      { rut: rut(1), rutApoderado: rutMalo(rut(2)) },
      { rut: rut(3), rutApoderado: rut(3) },
      { rut: rut(4), rutApoderado: "" },
    ]);
    expect([...p.jugadores.keys()]).toEqual([rut(1), rut(3), rut(4)]);
    expect(p.apoderados.size).toBe(0);
    expect(p.apoderadosOmitidos).toEqual({
      rut_invalido: [3],
      rut_igual_al_del_jugador_menor_o_sin_fecha: [4],
      rut_vacio: [5],
    });
    expect(p.notas.jugador_sin_apoderado).toEqual([3, 4, 5]);
    // El contacto de un menor sin apoderado no va a su ficha.
    expect(p.jugadores.get(rut(3))?.telefono).toBeNull();
  });

  it("jugador adulto sin apoderado: el contacto va en su ficha; sin contacto se carga igual", async () => {
    const p = await plan([
      { rut: rut(1), fecha: "01-01-2000", categoria: "U21", rutApoderado: rut(1) },
      { rut: rut(2), fecha: "01-01-2001", categoria: "U21", rutApoderado: "", telefono: "", correo: "", pago: "" },
    ]);
    expect(p.jugadores.get(rut(1))).toMatchObject({
      telefono: "912345678",
      email: "ana.inventada@ejemplo.cl",
      metodo_pago: "forpay_mensual",
    });
    expect(p.jugadores.get(rut(2))).toMatchObject({ telefono: null, email: null, metodo_pago: null });
    expect(p.apoderados.size).toBe(0);
    expect(p.notas.adulto_sin_telefono).toEqual([4]);
  });

  it("jugador adulto con apoderado distinto: se respeta el vínculo", async () => {
    const p = await plan([{ rut: rut(1), fecha: "01-01-2005", rutApoderado: rut(2) }]);
    expect(p.jugadores.get(rut(1))?.telefono).toBeNull();
    expect(p.vinculos).toHaveLength(1);
  });

  it("hermanos: un solo apoderado, un vínculo por hijo; completa lo que faltaba sin pisar", async () => {
    const p = await plan([
      { rut: rut(1), rutApoderado: rut(3), telefono: "123", correo: "a@ejemplo.cl" },
      { rut: rut(2), rutApoderado: rut(3), telefono: "987654321", correo: "b@ejemplo.cl" },
    ]);
    expect(p.apoderados.size).toBe(1);
    expect(p.apoderados.get(rut(3))).toMatchObject({ telefono: "987654321", email: "a@ejemplo.cl" });
    expect(p.vinculos.map((v) => v.jugadorRut)).toEqual([rut(1), rut(2)]);
    expect(p.camposVacios.telefono_invalido).toEqual([3]);
  });

  it("mismo jugador en dos filas: se carga una vez y paga solo el primer apoderado", async () => {
    const p = await plan([
      { rut: rut(1), rutApoderado: rut(2) },
      { rut: rut(1), rutApoderado: rut(3) },
    ]);
    expect(p.jugadores.size).toBe(1);
    expect(p.vinculos).toEqual([
      { jugadorRut: rut(1), apoderadoRut: rut(2), paga_mensualidad: true },
      { jugadorRut: rut(1), apoderadoRut: rut(3), paga_mensualidad: false },
    ]);
    expect(p.notas.jugador_repetido_en_otra_fila).toEqual([4]);
  });

  it("datos incoherentes: el campo queda vacío y se anota con su fila", async () => {
    const p = await plan([
      {
        rut: rut(1),
        rutApoderado: rut(2),
        fecha: "31-02-2014",
        telefono: "12345",
        correo: "ana@gmail.con",
        pago: "Forpay o transferencia",
        apoderado: " ",
        categoria: "U99",
        beca: "quizás",
      },
    ]);
    expect(p.jugadores.get(rut(1))).toMatchObject({ fecha_nacimiento: null, categoria_id: null, postula_beca: false });
    expect(p.apoderados.get(rut(2))).toMatchObject({
      nombre: null,
      apellido: null,
      telefono: null,
      email: null,
      metodo_pago: null,
    });
    expect(p.camposVacios).toEqual({
      fecha_nacimiento_erronea: [3],
      telefono_invalido: [3],
      correo_invalido: [3],
      metodo_pago_ambiguo: [3],
      nombre_apoderado_faltante: [3],
      categoria_basquet_no_reconocida: [3],
      postula_beca_ambiguo: [3],
    });
  });

  it("vóley: categoría calculada por año; 2017 o sin fecha queda vacía", async () => {
    const p = await plan([
      { rut: rut(1), rutApoderado: rut(9), rama: "Vóleibol", fecha: "10-10-2012", categoria: "" },
      { rut: rut(2), rutApoderado: rut(9), rama: "Vóleibol", fecha: "10-10-2017", categoria: "" },
      { rut: rut(3), rutApoderado: rut(9), rama: "Vóleibol", fecha: "", categoria: "" },
    ]);
    expect(p.jugadores.get(rut(1))?.categoria_id).toBe(idCategoria("U16", "voleibol"));
    expect(p.jugadores.get(rut(2))?.categoria_id).toBeNull();
    expect(p.jugadores.get(rut(3))?.categoria_id).toBeNull();
    expect(p.camposVacios.categoria_voley_no_calculable).toEqual([4]);
    expect(p.camposVacios.categoria_voley_sin_fecha).toEqual([5]);
  });

  it("básquet: acepta la categoría escrita de otras formas, incluida U11 F", async () => {
    const p = await plan([
      { rut: rut(1), rutApoderado: rut(9), categoria: "Sub-15" },
      { rut: rut(2), rutApoderado: rut(9), categoria: "u11 f", fecha: "01-01-2015" },
    ]);
    expect(p.jugadores.get(rut(1))?.categoria_id).toBe(idCategoria("U15", "basketball"));
    expect(p.jugadores.get(rut(2))?.categoria_id).toBe(idCategoria("U11 F", "basketball"));
  });

  it("rama no reconocida: el jugador no se carga", async () => {
    const p = await plan([{ rut: rut(1), rutApoderado: rut(2), rama: "Fútbol" }]);
    expect(p.jugadoresOmitidos).toEqual({ rama_no_reconocida: [3] });
  });

  it("ignora las filas vacías", async () => {
    const hoja = [...planilla([{ rut: rut(1), rutApoderado: rut(2) }]), [null, "", "  "], []];
    const { filaEncabezado, columnas } = ubicarColumnas(hoja);
    const p = planificar(hoja, columnas, filaEncabezado, categorias, HOY);
    expect(p.filas).toBe(1);
    expect(p.filasVacias).toBe(2);
  });
});

describe("escritura en la base", () => {
  const FILAS: Fila[] = [
    { rut: rut(1), rutApoderado: rut(10) },
    { rut: rut(2), rutApoderado: rut(10) },
    { rut: rut(3), fecha: "01-01-2000", categoria: "U21", rutApoderado: "" },
    { rut: rutMalo(rut(4)), rutApoderado: rut(11) },
  ];

  it("carga todo como precargado, origen base 2026 y sin número de camiseta", async () => {
    const r = await importar(db, await plan(FILAS), { dryRun: false });
    expect(r.jugadores.cargados).toBe(3);
    expect(r.apoderados.cargados).toBe(2);
    expect(r.vinculos.creados).toBe(2);
    const cargados = await db.select().from(jugadores).where(inArray(jugadores.rut, RUTS));
    expect(cargados).toHaveLength(3);
    for (const j of cargados) {
      expect(j).toMatchObject({ estado: "precargado", origen: "base_2026", numero_camiseta: null, credencial_token: null });
    }
    const [apoderado] = await db.select().from(apoderados).where(eq(apoderados.rut, rut(10)));
    expect(apoderado).toMatchObject({ estado: "precargado", origen: "base_2026", foto_id: null });
    const vinculos = await db
      .select()
      .from(jugadorApoderado)
      .where(eq(jugadorApoderado.apoderado_id, apoderado?.id ?? ""));
    expect(vinculos).toHaveLength(2);
    for (const v of vinculos) expect(v).toMatchObject({ estado: "activo", paga_mensualidad: true, solicitud_id: null });
  });

  it("se puede volver a correr sin duplicar ni modificar lo que ya existe", async () => {
    await importar(db, await plan(FILAS), { dryRun: false });
    await db.update(apoderados).set({ telefono: "911111111" }).where(eq(apoderados.rut, rut(10)));
    const r = await importar(db, await plan(FILAS), { dryRun: false });
    expect(r.jugadores.cargados).toBe(0);
    expect(r.jugadores.yaExistian).toEqual([3, 4, 5]);
    expect(r.apoderados.cargados).toBe(0);
    expect(r.vinculos).toEqual({ creados: 0, yaExistian: 2, omitidos: {} });
    expect(await db.select().from(jugadores).where(inArray(jugadores.rut, RUTS))).toHaveLength(3);
    const [apoderado] = await db.select().from(apoderados).where(eq(apoderados.rut, rut(10)));
    expect(apoderado?.telefono).toBe("911111111");
  });

  it("--dry-run da el mismo resumen y no escribe nada", async () => {
    const simulado = await importar(db, await plan(FILAS), { dryRun: true });
    expect(await db.select().from(jugadores).where(inArray(jugadores.rut, RUTS))).toHaveLength(0);
    expect(await db.select().from(apoderados).where(inArray(apoderados.rut, RUTS))).toHaveLength(0);
    const real = await importar(db, await plan(FILAS), { dryRun: false });
    expect({ ...simulado, dryRun: false }).toEqual(real);
  });

  it("no vincula un apoderado de la base con alguien que llegó por el formulario", async () => {
    await db.insert(jugadores).values({ rut: rut(1), disciplina: "basketball", origen: "formulario", estado: "pendiente" });
    const r = await importar(db, await plan([{ rut: rut(1), rutApoderado: rut(10) }]), { dryRun: false });
    expect(r.vinculos).toEqual({ creados: 0, yaExistian: 0, omitidos: { persona_del_formulario: 1 } });
    const [jugador] = await db.select().from(jugadores).where(eq(jugadores.rut, rut(1)));
    expect(jugador).toMatchObject({ origen: "formulario", estado: "pendiente" });
  });

  it("el resumen no trae nombres, RUT, teléfonos ni correos", async () => {
    const r = await importar(db, await plan(FILAS), { dryRun: true });
    const salida = formatearResumen(r);
    expect(salida).toContain("Jugadores cargados: 3");
    expect(salida).toContain("rut_invalido: 1 (filas 6)");
    for (const prohibido of ["Tomasa", "Inventada", "912345678", "ejemplo.cl", ...RUTS.map((x) => x.split("-")[0] ?? "")]) {
      expect(salida).not.toContain(prohibido);
    }
  });
});

// ---------------------------------------------------------------------------
// Archivo .xlsx sintético (zip sin compresión), para probar la lectura real y la línea de comandos
// ---------------------------------------------------------------------------

function zip(archivos: Record<string, string>): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = Buffer.from(contenido, "utf8");
    const nombreB = Buffer.from(nombre, "utf8");
    const crc = crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(datos.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreB.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(datos.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreB.length, 28);
    central.writeUInt32LE(offset, 42);
    locales.push(local, nombreB, datos);
    centrales.push(central, nombreB);
    offset += 30 + nombreB.length + datos.length;
  }
  const centralB = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  const n = Object.keys(archivos).length;
  fin.writeUInt16LE(n, 8);
  fin.writeUInt16LE(n, 10);
  fin.writeUInt32LE(centralB.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, centralB, fin]);
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function hojaXml(filas: unknown[][]): string {
  const col = (i: number) => String.fromCharCode(65 + i);
  const celdas = filas
    .map((f, r) => {
      const cs = f
        .map((v, c) => {
          const ref = `${col(c)}${r + 1}`;
          if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
          if (typeof v === "string" && v !== "") return `<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
          return "";
        })
        .join("");
      return `<row r="${r + 1}">${cs}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${celdas}</sheetData></worksheet>`;
}

function xlsx(hojas: Record<string, unknown[][]>): Buffer {
  const nombres = Object.keys(hojas);
  const archivos: Record<string, string> = {
    "[Content_Types].xml":
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      nombres
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      `</Types>`,
    "_rels/.rels":
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml":
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      nombres.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      `</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      nombres
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      `</Relationships>`,
  };
  nombres.forEach((n, i) => {
    archivos[`xl/worksheets/sheet${i + 1}.xml`] = hojaXml(hojas[n] ?? []);
  });
  return zip(archivos);
}

describe("línea de comandos", () => {
  const dir = mkdtempSync(join(tmpdir(), "importacion-sintetica-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const archivo = join(dir, "base-sintetica.xlsx");
  writeFileSync(
    archivo,
    xlsx({
      Base: planilla([
        { rut: rut(1), rutApoderado: rut(10) },
        { rut: rut(2), rutApoderado: rut(10), fecha: 41713 },
      ]),
      "Por revisar": [["no se lee"]],
    }),
  );
  const env = { DATABASE_URL: urlTest() };

  it("lee las opciones y rechaza las desconocidas", () => {
    expect(leerArgumentos(["a.xlsx", "--dry-run", "--hoja", "Base", "--columna", "metodo_pago=Pago"])).toEqual({
      archivo: "a.xlsx",
      hoja: "Base",
      columnas: { metodo_pago: "Pago" },
      dryRun: true,
    });
    expect(() => leerArgumentos([])).toThrow(/Uso/);
    expect(() => leerArgumentos(["a.xlsx", "--borrar"])).toThrow(/desconocida/);
    expect(() => leerArgumentos(["a.xlsx", "--columna", "otra=X"])).toThrow(/campo=Encabezado/);
  });

  it("se niega a escribir fuera de localhost sin --produccion, antes de leer el archivo", async () => {
    await expect(
      main([join(dir, "no-existe.xlsx")], { DATABASE_URL: "postgres://club@db.ejemplo.net:5432/club" }),
    ).rejects.toThrow(/--produccion/);
  });

  it("con varias hojas exige --hoja", async () => {
    await expect(main([archivo, "--dry-run"], env)).rejects.toThrow(/--hoja: Base, Por revisar/);
  });

  it("--dry-run lee el .xlsx y no escribe; la corrida real carga", async () => {
    const simulado = await main([archivo, "--hoja", "Base", "--dry-run"], env);
    expect(simulado).toContain("SIMULACIÓN");
    expect(simulado).toContain("Jugadores cargados: 2");
    expect(await db.select().from(jugadores).where(inArray(jugadores.rut, RUTS))).toHaveLength(0);

    const real = await main([archivo, "--hoja", "Base"], env);
    expect(real).toContain("IMPORTACIÓN APLICADA");
    const cargados = await db.select().from(jugadores).where(inArray(jugadores.rut, RUTS));
    expect(cargados.map((j) => j.fecha_nacimiento).sort()).toEqual(["2014-03-15", "2014-03-15"]);
  });
});
