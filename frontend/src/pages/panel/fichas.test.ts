import {
  generarRutFicticio,
  type EntrenadorDetalle,
  type ApoderadoDetalle,
  type JugadorDetalle,
} from "@club-colina/shared";
import { describe, expect, it } from "vitest";
import { accionesEstado } from "@/components/panel/estado";
import { medidasReducidas, esTipoFotoAceptado } from "@/components/panel/foto";
import { nombreArchivoQr, qrPng, urlDelQr } from "@/components/panel/qr";
import {
  cambiosApoderado,
  cambiosEntrenador,
  cambiosJugador,
  datosEntrenadorNuevo,
  FORM_ENTRENADOR_VACIO,
  formApoderado,
  formEntrenador,
  formJugador,
} from "./edicion";
import { busquedaJugadores, filtrosApoderados, filtrosJugadores, SIN_CATEGORIA } from "./filtros";

// Datos siempre ficticios.
const ID = "11111111-1111-4111-8111-111111111111";
const AHORA = "2026-11-12T10:00:00.000Z";
const RUT = generarRutFicticio(7);
const TOKEN = "b".repeat(43);

const jugador: JugadorDetalle = {
  id: ID,
  nombre: "Ana",
  apellido: "Pérez",
  rut: RUT,
  disciplina: "basketball",
  categoria_id: 3,
  u11f: false,
  numero_camiseta: "00",
  estado: "activo",
  origen: "base_2026",
  tiene_foto: true,
  faltan_datos: false,
  marcado_retiro_en: null,
  fecha_nacimiento: "2014-05-02",
  edad: 12,
  postula_beca: false,
  beca_mensualidad_pct: 0,
  beca_torneos_pct: 0,
  beca_campus_pct: 0,
  telefono: "912345678",
  email: "ana@ejemplo.test",
  metodo_pago: null,
  credencial_token: TOKEN,
  solicitud_id: null,
  faltantes: [],
  apoderados: [],
  creado_en: AHORA,
  actualizado_en: AHORA,
};

const apoderado: ApoderadoDetalle = {
  id: ID,
  nombre: null,
  apellido: null,
  rut: RUT,
  telefono: null,
  estado: "precargado",
  origen: "base_2026",
  tiene_foto: false,
  faltan_datos: true,
  email: null,
  metodo_pago: null,
  credencial_token: null,
  solicitud_id: null,
  faltantes: ["nombre", "apellido", "telefono", "foto"],
  jugadores: [],
  creado_en: AHORA,
  actualizado_en: AHORA,
};

describe("edición del jugador", () => {
  it("sin cambios no se envía nada", () => {
    expect(cambiosJugador(jugador, formJugador(jugador))).toEqual({
      ok: false,
      errores: ["No hay cambios que guardar."],
    });
  });

  it("envía solo lo que cambió, ya en el formato del contrato", () => {
    const f = { ...formJugador(jugador), beca_mensualidad_pct: "50", numero_camiseta: "0" };
    expect(cambiosJugador(jugador, f)).toEqual({
      ok: true,
      datos: { beca_mensualidad_pct: 50, numero_camiseta: "0" },
    });
  });

  it("el mismo RUT o teléfono escrito de otra forma no es un cambio", () => {
    const [cuerpo, dv] = RUT.split("-");
    const conPuntos = `${Number(cuerpo).toLocaleString("es-CL")}-${dv}`;
    const f = {
      ...formJugador(jugador),
      rut: conPuntos,
      telefono: "+56 9 1234 5678",
      email: "ANA@ejemplo.test",
    };
    expect(cambiosJugador(jugador, f).ok).toBe(false);
  });

  it("vaciar un campo que admite null lo borra", () => {
    const f = { ...formJugador(jugador), email: "", numero_camiseta: "" };
    expect(cambiosJugador(jugador, f)).toEqual({
      ok: true,
      datos: { email: null, numero_camiseta: null },
    });
  });

  it("marca o quita la U11 F; en vóley nunca se manda encendida", () => {
    expect(cambiosJugador(jugador, { ...formJugador(jugador), u11f: true })).toEqual({
      ok: true,
      datos: { u11f: true },
    });
    const marcada = { ...jugador, u11f: true };
    expect(cambiosJugador(marcada, { ...formJugador(marcada), u11f: false })).toEqual({
      ok: true,
      datos: { u11f: false },
    });
    // Pasar a vóley con la marca puesta: la marca se manda apagada.
    expect(cambiosJugador(marcada, { ...formJugador(marcada), disciplina: "voleibol" })).toEqual({
      ok: true,
      datos: { disciplina: "voleibol", u11f: false },
    });
    expect(
      cambiosJugador(jugador, { ...formJugador(jugador), disciplina: "voleibol", u11f: true }),
    ).toEqual({
      ok: true,
      datos: { disciplina: "voleibol" },
    });
  });

  it.each([
    [{ beca_torneos_pct: "101" }, "Revisa beca de torneos."],
    [{ numero_camiseta: "123" }, "Revisa número de camiseta."],
    [{ rut: "12345678-0" }, "Revisa RUT."],
    [{ telefono: "123" }, "Revisa teléfono."],
    [{ nombre: "" }, "Revisa nombre."],
  ])("rechaza %o", (cambio, error) => {
    const r = cambiosJugador(jugador, { ...formJugador(jugador), ...cambio });
    expect(r).toEqual({ ok: false, errores: [error] });
  });
});

describe("edición del apoderado", () => {
  it("un precargado sin nombre: dejar el campo vacío no es un cambio", () => {
    expect(cambiosApoderado(apoderado, formApoderado(apoderado)).ok).toBe(false);
  });

  it("Mony completa lo que falta", () => {
    const f = { ...formApoderado(apoderado), nombre: "Luis", telefono: "9 8765 4321" };
    expect(cambiosApoderado(apoderado, f)).toEqual({
      ok: true,
      datos: { nombre: "Luis", telefono: "987654321" },
    });
  });
});

describe("filtros", () => {
  it("la URL solo abre el filtro de marcados con marcados=true", () => {
    expect(busquedaJugadores({ marcados: true })).toEqual({ marcados: true });
    expect(busquedaJugadores({ marcados: "true" })).toEqual({ marcados: true });
    expect(busquedaJugadores({ marcados: "1" })).toEqual({});
    expect(busquedaJugadores({ q: "12345678-5" })).toEqual({});
  });

  it("un checkbox apagado no filtra; los vacíos no van", () => {
    expect(
      filtrosJugadores({
        q: "  ",
        estado: "",
        disciplina: "",
        categoria_id: "",
        faltan_datos: false,
        sin_numero: false,
        marcado_ya_no_esta: false,
      }),
    ).toEqual({});
  });

  it("'Sin categoría' filtra los sin categoría", () => {
    expect(
      filtrosJugadores({
        q: "",
        estado: "",
        disciplina: "",
        categoria_id: SIN_CATEGORIA,
        faltan_datos: false,
        sin_numero: false,
        marcado_ya_no_esta: false,
      }),
    ).toEqual({ sin_categoria: true });
  });

  it("pasa estado, disciplina, categoría y marcas válidas", () => {
    expect(
      filtrosJugadores({
        q: "ana",
        estado: "precargado",
        disciplina: "voleibol",
        categoria_id: "9",
        faltan_datos: true,
        sin_numero: true,
        marcado_ya_no_esta: true,
      }),
    ).toEqual({
      q: "ana",
      estado: "precargado",
      disciplina: "voleibol",
      categoria_id: 9,
      faltan_datos: true,
      sin_numero: true,
      marcado_ya_no_esta: true,
    });
  });

  it("descarta valores que no son del contrato", () => {
    expect(filtrosApoderados({ q: "", estado: "borrado", faltan_datos: false })).toEqual({});
  });
});

describe("estado, foto y QR", () => {
  it("activar: precargado o inactivo; desactivar: activo o precargado", () => {
    expect(accionesEstado("precargado")).toEqual({ activar: true, desactivar: true });
    expect(accionesEstado("inactivo")).toEqual({ activar: true, desactivar: false });
    expect(accionesEstado("activo")).toEqual({ activar: false, desactivar: true });
    expect(accionesEstado("pendiente")).toEqual({ activar: false, desactivar: false });
    expect(accionesEstado("rechazado")).toEqual({ activar: false, desactivar: false });
  });

  it("la foto se reduce a lado mayor 1024 sin agrandar", () => {
    expect(medidasReducidas(4000, 3000)).toEqual({ ancho: 1024, alto: 768 });
    expect(medidasReducidas(1500, 3000)).toEqual({ ancho: 512, alto: 1024 });
    expect(medidasReducidas(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });

  it("solo JPG, PNG o WebP", () => {
    expect(esTipoFotoAceptado("image/jpeg")).toBe(true);
    expect(esTipoFotoAceptado("image/heic")).toBe(false);
    expect(esTipoFotoAceptado("image/svg+xml")).toBe(false);
  });

  it("el QR lleva la URL pública de la credencial", async () => {
    const url = urlDelQr(TOKEN, "https://club-colina.vercel.app/");
    expect(url).toBe(`https://club-colina.vercel.app/c/${TOKEN}`);
    expect(await qrPng(url)).toMatch(/^data:image\/png;base64,/);
    // Sin base explícita, la fijada al compilar (en los tests, la ficticia de vitest.config.ts).
    expect(urlDelQr(TOKEN)).toBe(`https://club-colina.test/c/${TOKEN}`);
  });

  it("el archivo del QR se nombra sin tildes ni símbolos", () => {
    expect(nombreArchivoQr("José Peña Ñúñez")).toBe("qr-jose-pena-nunez.png");
    expect(nombreArchivoQr("")).toBe("qr-credencial.png");
  });
});

describe("entrenadores", () => {
  const entrenador: EntrenadorDetalle = {
    id: ID,
    nombre: "Luis",
    apellido: "Rojas",
    rut: RUT,
    telefono: "912345678",
    disciplina: "voleibol",
    tiene_foto: true,
    credencial_token: TOKEN,
    estado: "activo",
    creado_en: AHORA,
    actualizado_en: AHORA,
  };

  it("el alta exige todos los campos", () => {
    const r = datosEntrenadorNuevo(FORM_ENTRENADOR_VACIO);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores).toEqual(
        expect.arrayContaining([
          "Revisa nombre.",
          "Revisa RUT.",
          "Revisa teléfono.",
          "Revisa disciplina.",
        ]),
      );
    }
  });

  it("el alta normaliza RUT y teléfono", () => {
    const [cuerpo, dv] = RUT.split("-");
    const r = datosEntrenadorNuevo({
      nombre: " Luis ",
      apellido: "Rojas",
      rut: `${Number(cuerpo).toLocaleString("es-CL")}-${dv}`,
      telefono: "+56 9 1234 5678",
      disciplina: "basketball",
    });
    expect(r).toEqual({
      ok: true,
      datos: {
        nombre: "Luis",
        apellido: "Rojas",
        rut: RUT,
        telefono: "912345678",
        disciplina: "basketball",
      },
    });
  });

  it("la edición envía solo lo que cambió y no deja vaciar un obligatorio", () => {
    expect(
      cambiosEntrenador(entrenador, { ...formEntrenador(entrenador), disciplina: "basketball" }),
    ).toEqual({
      ok: true,
      datos: { disciplina: "basketball" },
    });
    expect(cambiosEntrenador(entrenador, { ...formEntrenador(entrenador), telefono: "" }).ok).toBe(
      false,
    );
  });
});

describe("edición del jugador: números", () => {
  it("una beca escrita con cero adelante no es un cambio", () => {
    const f = { ...formJugador({ ...jugador, beca_torneos_pct: 7 }), beca_torneos_pct: "07" };
    expect(cambiosJugador({ ...jugador, beca_torneos_pct: 7 }, f).ok).toBe(false);
  });
});
