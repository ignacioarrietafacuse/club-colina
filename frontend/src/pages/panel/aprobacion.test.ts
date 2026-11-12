import {
  generarRutFicticio,
  type JugadorDetalle,
  type SolicitudDetalle,
} from "@club-colina/shared";
import { describe, expect, it } from "vitest";
import { armarAprobacion, armarRechazo, formInicial, llaveVinculo } from "./aprobacion";

// Datos siempre ficticios.
const J1 = "11111111-1111-4111-8111-111111111111";
const J2 = "22222222-2222-4222-8222-222222222222";
const A1 = "33333333-3333-4333-8333-333333333333";
const S = "44444444-4444-4444-8444-444444444444";
const AHORA = "2026-11-12T10:00:00.000Z";

function jugador(id: string, cambios: Partial<JugadorDetalle> = {}): JugadorDetalle {
  return {
    id,
    nombre: "Ana",
    apellido: "Pérez",
    rut: generarRutFicticio(id === J1 ? 1 : 2),
    disciplina: "basketball",
    categoria_id: 3,
    numero_camiseta: "00",
    estado: "pendiente",
    origen: "formulario",
    tiene_foto: true,
    faltan_datos: false,
    marcado_retiro_en: null,
    fecha_nacimiento: "2014-05-02",
    edad: 12,
    postula_beca: false,
    beca_mensualidad_pct: 0,
    beca_torneos_pct: 0,
    beca_campus_pct: 0,
    telefono: null,
    email: null,
    metodo_pago: null,
    credencial_token: null,
    solicitud_id: S,
    faltantes: [],
    apoderados: [],
    creado_en: AHORA,
    actualizado_en: AHORA,
    ...cambios,
  };
}

function solicitud(cambios: Partial<SolicitudDetalle> = {}): SolicitudDetalle {
  return {
    id: S,
    creada_en: AHORA,
    estado: "pendiente",
    tipo: "formulario",
    consentimiento_en: AHORA,
    revisada_en: null,
    coincide_base: false,
    avisos: [],
    jugadores: [jugador(J1), jugador(J2, { estado: "activo" })],
    apoderados: [
      {
        id: A1,
        nombre: "Luis",
        apellido: "Rojas",
        rut: generarRutFicticio(3),
        telefono: "912345678",
        estado: "pendiente",
        origen: "formulario",
        tiene_foto: true,
        faltan_datos: false,
        email: null,
        metodo_pago: "forpay_mensual",
        credencial_token: null,
        solicitud_id: S,
        faltantes: [],
        jugadores: [],
        creado_en: AHORA,
        actualizado_en: AHORA,
      },
    ],
    vinculos: [
      { jugador_id: J1, apoderado_id: A1, paga_mensualidad: true, estado: "pendiente" },
      { jugador_id: J2, apoderado_id: A1, paga_mensualidad: false, estado: "activo" },
    ],
    ...cambios,
  };
}

const nombres = { [J1]: "Ana Pérez", [J2]: "Bea Pérez", [A1]: "Luis Rojas" };

describe("formulario inicial", () => {
  it("solo lo pendiente entra, marcado y con los valores que ya trae", () => {
    const form = formInicial(solicitud());
    expect(Object.keys(form.jugadores)).toEqual([J1]);
    expect(form.jugadores[J1]).toMatchObject({
      marcado: true,
      categoria_id: "3",
      numero_camiseta: "00",
      beca_mensualidad_pct: "0",
    });
    expect(form.apoderados[A1]).toEqual({ marcado: true, metodo_pago: "forpay_mensual" });
    expect(form.vinculos).toEqual({ [llaveVinculo({ jugador_id: J1, apoderado_id: A1 })]: true });
  });
});

describe("aprobar", () => {
  it("arma el cuerpo del contrato con lo marcado", () => {
    const r = armarAprobacion(formInicial(solicitud()), nombres);
    expect(r).toEqual({
      ok: true,
      datos: {
        jugadores: [
          {
            id: J1,
            categoria_id: 3,
            numero_camiseta: "00",
            beca_mensualidad_pct: 0,
            beca_torneos_pct: 0,
            beca_campus_pct: 0,
          },
        ],
        apoderados: [{ id: A1, metodo_pago: "forpay_mensual" }],
        vinculos: [{ jugador_id: J1, apoderado_id: A1 }],
      },
    });
  });

  it("'00' y '0' son números distintos; sin categoría va null", () => {
    const form = formInicial(solicitud());
    form.jugadores[J1] = { ...form.jugadores[J1]!, numero_camiseta: "0", categoria_id: "" };
    const r = armarAprobacion(form, nombres);
    expect(r.ok && r.datos.jugadores?.[0]).toMatchObject({
      numero_camiseta: "0",
      categoria_id: null,
    });
  });

  it("lo desmarcado queda pendiente: no se envía", () => {
    const form = formInicial(solicitud());
    form.jugadores[J1]!.marcado = false;
    const r = armarAprobacion(form, nombres);
    expect(r.ok && r.datos.jugadores).toEqual([]);
  });

  it.each([
    ["sin número", { numero_camiseta: "" }, "número de camiseta"],
    ["número de tres cifras", { numero_camiseta: "100" }, "número de camiseta"],
    ["beca sobre 100", { beca_mensualidad_pct: "120" }, "beca de mensualidad"],
    ["beca con decimales", { beca_torneos_pct: "10.5" }, "beca de torneos"],
    ["beca vacía", { beca_campus_pct: "" }, "beca de campus"],
  ])("%s: no se envía y nombra al jugador y el campo", (_caso, cambio, campo) => {
    const form = formInicial(solicitud());
    form.jugadores[J1] = { ...form.jugadores[J1]!, ...cambio };
    const r = armarAprobacion(form, nombres);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toContain(`Ana Pérez: revisa ${campo}.`);
  });

  it("sin nada marcado no se envía", () => {
    const form = formInicial(solicitud());
    form.jugadores[J1]!.marcado = false;
    form.apoderados[A1]!.marcado = false;
    form.vinculos = {};
    expect(armarAprobacion(form, nombres)).toEqual({
      ok: false,
      errores: ["No hay nada marcado para aprobar."],
    });
  });
});

describe("rechazar", () => {
  it("rechaza solo a las personas marcadas", () => {
    const form = formInicial(solicitud());
    form.apoderados[A1]!.marcado = false;
    expect(armarRechazo(form)).toEqual({
      ok: true,
      datos: { personas: [{ rol: "jugador", id: J1 }] },
    });
  });

  it("sin personas marcadas no manda nada (un cuerpo vacío rechazaría todo)", () => {
    const form = formInicial(solicitud());
    form.jugadores[J1]!.marcado = false;
    form.apoderados[A1]!.marcado = false;
    expect(armarRechazo(form).ok).toBe(false);
  });
});
