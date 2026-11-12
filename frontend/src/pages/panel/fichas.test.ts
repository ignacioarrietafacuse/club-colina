import {
  generarRutFicticio,
  type ApoderadoDetalle,
  type JugadorDetalle,
} from "@club-colina/shared";
import { describe, expect, it } from "vitest";
import { accionesEstado } from "@/components/panel/estado";
import { medidasReducidas, esTipoFotoAceptado } from "@/components/panel/foto";
import { nombreArchivoQr, qrPng, urlDelQr } from "@/components/panel/qr";
import { cambiosApoderado, cambiosJugador, formApoderado, formJugador } from "./edicion";
import { filtrosApoderados, filtrosJugadores } from "./filtros";

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
    const f = { ...formJugador(jugador), email: "", categoria_id: "", numero_camiseta: "" };
    expect(cambiosJugador(jugador, f)).toEqual({
      ok: true,
      datos: { email: null, categoria_id: null, numero_camiseta: null },
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
  it("un checkbox apagado no filtra; los vacíos no van", () => {
    expect(
      filtrosJugadores({
        q: "  ",
        estado: "",
        disciplina: "",
        categoria_id: "",
        faltan_datos: false,
        sin_numero: false,
      }),
    ).toEqual({});
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
      }),
    ).toEqual({
      q: "ana",
      estado: "precargado",
      disciplina: "voleibol",
      categoria_id: 9,
      faltan_datos: true,
      sin_numero: true,
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
  });

  it("el archivo del QR se nombra sin tildes ni símbolos", () => {
    expect(nombreArchivoQr("José Peña Ñúñez")).toBe("qr-jose-pena-nunez.png");
    expect(nombreArchivoQr("")).toBe("qr-credencial.png");
  });
});
