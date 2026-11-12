import { generarRutFicticio, type SolicitudDetalle } from "@club-colina/shared";
import { describe, expect, it } from "vitest";
import {
  armarAprobacion,
  armarRechazo,
  armarRechazoVinculo,
  contactoPosible,
  firmaSolicitud,
  formInicial,
  llaveVinculo,
  RECHAZO_TOTAL,
  esDeEstaSolicitud,
  alcanceRechazoTotal,
  fotoPorLinkReenviado,
  vinculoAprobable,
  vinculoConocido,
  vinculoVa,
} from "./aprobacion";

// Datos siempre ficticios.
const J1 = "11111111-1111-4111-8111-111111111111";
const J2 = "22222222-2222-4222-8222-222222222222";
const A1 = "33333333-3333-4333-8333-333333333333";
const S = "44444444-4444-4444-8444-444444444444";
const AHORA = "2026-11-12T10:00:00.000Z";

// `propia` viene en el detalle de la solicitud desde el #29 (S1); aquí todos son propios.
type JugadorDeSolicitud = SolicitudDetalle["jugadores"][number];
function jugador(id: string, cambios: Partial<JugadorDeSolicitud> = {}): JugadorDeSolicitud {
  return {
    propia: true,
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
        propia: true,
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

describe("vínculos y personas", () => {
  const LLAVE = llaveVinculo({ jugador_id: J1, apoderado_id: A1 });

  it("un vínculo no se aprueba si su jugador queda desmarcado", () => {
    const form = formInicial(solicitud());
    form.jugadores[J1]!.marcado = false;
    expect(vinculoVa(form, LLAVE)).toBe(false);
    const r = armarAprobacion(form, nombres);
    expect(r.ok && r.datos.vinculos).toEqual([]);
  });

  it("un vínculo con una persona ya rechazada parte desmarcado y no se envía", () => {
    const s = solicitud({ jugadores: [jugador(J1, { estado: "rechazado" })] });
    const form = formInicial(s);
    expect(form.vinculos[LLAVE]).toBe(false);
    const r = armarAprobacion(form, nombres);
    expect(r.ok && r.datos.vinculos).toEqual([]);
  });

  it("un vínculo hacia alguien que no viene en la solicitud no se ofrece", () => {
    const s = solicitud({
      jugadores: [],
      vinculos: [{ jugador_id: J1, apoderado_id: A1, paga_mensualidad: true, estado: "pendiente" }],
    });
    expect(vinculoConocido(s.vinculos[0]!, s)).toBe(false);
    expect(vinculoAprobable(s.vinculos[0]!, s)).toBe(false);
    const form = formInicial(s);
    expect(form.vinculos[LLAVE]).toBe(false);
    const r = armarAprobacion(form, nombres);
    expect(r.ok && r.datos.vinculos).toEqual([]);
  });

  it("un vínculo con una persona precargada no se ofrece (se activa en su ficha)", () => {
    const s = solicitud({ jugadores: [jugador(J1, { estado: "precargado" })] });
    expect(vinculoAprobable(s.vinculos[0]!, s)).toBe(false);
    expect(formInicial(s).vinculos[LLAVE]).toBe(false);
  });

  it("un vínculo parte desmarcado si una de sus personas pendientes parte desmarcada", () => {
    const s = solicitud({ jugadores: [jugador(J1, { marcado_retiro_en: AHORA })] });
    expect(formInicial(s).vinculos[LLAVE]).toBe(false);
  });

  it("quien no tiene foto parte desmarcado (no se puede aprobar)", () => {
    const s = solicitud({ jugadores: [jugador(J1, { tiene_foto: false, faltantes: ["foto"] })] });
    expect(formInicial(s).jugadores[J1]?.marcado).toBe(false);
  });

  it("solo con vínculos pendientes, el rechazo de todo va sin personas", () => {
    expect(RECHAZO_TOTAL).toEqual({});
    const s = solicitud({ jugadores: [], apoderados: [] });
    expect(armarRechazo(formInicial(s)).ok).toBe(false);
  });
});

describe("casos de la segunda revisión", () => {
  const LLAVE = llaveVinculo({ jugador_id: J1, apoderado_id: A1 });

  it("un hijo marcado «ya no está» parte desmarcado", () => {
    const s = solicitud({ jugadores: [jugador(J1, { marcado_retiro_en: AHORA })] });
    expect(formInicial(s).jugadores[J1]?.marcado).toBe(false);
  });

  it("un vínculo con una persona inactiva tampoco se aprueba", () => {
    const s = solicitud({ jugadores: [jugador(J1, { estado: "inactivo" })] });
    expect(formInicial(s).vinculos[LLAVE]).toBe(false);
  });

  it("la firma cambia si cambia el estado de una persona o vínculo, no por otros datos", () => {
    const base = solicitud();
    expect(firmaSolicitud(solicitud({ coincide_base: true }))).toBe(firmaSolicitud(base));
    // Un hijo que queda marcado «ya no está», un aviso nuevo o un faltante cambian la firma.
    expect(
      firmaSolicitud(
        solicitud({
          jugadores: [jugador(J1, { marcado_retiro_en: AHORA }), jugador(J2, { estado: "activo" })],
        }),
      ),
    ).not.toBe(firmaSolicitud(base));
    expect(firmaSolicitud(solicitud({ avisos: ["hay_solicitud_posterior"] }))).not.toBe(
      firmaSolicitud(base),
    );
    expect(
      firmaSolicitud(
        solicitud({
          jugadores: [jugador(J1, { faltantes: ["foto"] }), jugador(J2, { estado: "activo" })],
        }),
      ),
    ).not.toBe(firmaSolicitud(base));
    expect(
      firmaSolicitud(
        solicitud({
          jugadores: [jugador(J1, { estado: "activo" }), jugador(J2, { estado: "activo" })],
        }),
      ),
    ).not.toBe(firmaSolicitud(base));
  });
});

describe("quién se decide desde esta solicitud", () => {
  const OTRA = "55555555-5555-4555-8555-555555555555";

  it("una persona de otra solicitud (o el segundo apoderado) parte desmarcada", () => {
    const s = solicitud({
      apoderados: [{ ...solicitud().apoderados[0]!, solicitud_id: OTRA }],
    });
    expect(esDeEstaSolicitud(s.apoderados[0]!, s)).toBe(false);
    const form = formInicial(s);
    expect(form.apoderados[A1]?.marcado).toBe(false);
    // Su vínculo tampoco parte marcado: el apoderado no quedaría activo.
    expect(form.vinculos[llaveVinculo({ jugador_id: J1, apoderado_id: A1 })]).toBe(false);
  });

  it("sin solicitud asignada (precargado que esta dejó pendiente) es de esta", () => {
    const s = solicitud({ jugadores: [jugador(J1, { solicitud_id: null })] });
    expect(formInicial(s).jugadores[J1]?.marcado).toBe(true);
  });

  it("nota de foto reenviada: el apoderado de una solicitud de segundo apoderado", () => {
    const base = solicitud().apoderados[0]!;
    const segunda = solicitud({ tipo: "segundo_apoderado" });
    expect(fotoPorLinkReenviado(base, segunda)).toBe(true);
    expect(fotoPorLinkReenviado({ ...base, tiene_foto: false }, segunda)).toBe(false);
    expect(fotoPorLinkReenviado({ ...base, estado: "activo" }, segunda)).toBe(false);
  });

  it("nota de foto reenviada: en la solicitud de origen, el apoderado de la segunda", () => {
    const base = solicitud().apoderados[0]!;
    const origen = solicitud();
    expect(fotoPorLinkReenviado(base, origen)).toBe(false);
    expect(fotoPorLinkReenviado({ ...base, solicitud_id: OTRA }, origen)).toBe(true);
  });
});

describe("quitar la marca de retiro", () => {
  it("al rehacer el formulario, el jugador al que se le quitó la marca parte sin marcar", () => {
    // Después del DELETE el detalle llega sin la marca: sin la lista, partiría marcado.
    const despues = solicitud({ jugadores: [jugador(J1)] });
    expect(formInicial(despues).jugadores[J1]?.marcado).toBe(true);
    const form = formInicial(despues, new Set([J1]));
    expect(form.jugadores[J1]?.marcado).toBe(false);
    // Su vínculo tampoco parte marcado, y nada de él va en la aprobación.
    expect(form.vinculos[llaveVinculo({ jugador_id: J1, apoderado_id: A1 })]).toBe(false);
    const r = armarAprobacion(form, nombres);
    expect(r.ok && r.datos.jugadores).toEqual([]);
    expect(r.ok && r.datos.vinculos).toEqual([]);
  });
});

describe("alcance de «Rechazar todo lo pendiente»", () => {
  const OTRA = "55555555-5555-4555-8555-555555555555";

  it("seguras: solo las pendientes con solicitud_id de esta; el resto, en condicional", () => {
    const s = solicitud({
      jugadores: [jugador(J1), jugador(J2, { solicitud_id: null })],
      apoderados: [{ ...solicitud().apoderados[0]!, solicitud_id: OTRA }],
    });
    expect(alcanceRechazoTotal(s)).toEqual({ seguras: [J1], posibles: [J2, A1] });
  });

  it("no nombra a quien ya no está pendiente", () => {
    const s = solicitud({ jugadores: [jugador(J1, { estado: "activo" })] });
    expect(alcanceRechazoTotal(s)).toEqual({ seguras: [A1], posibles: [] });
  });
});

describe("adulto sin teléfono (#27)", () => {
  const conFaltaTelefono = () =>
    solicitud({
      jugadores: [
        jugador(J1, { faltantes: ["telefono"], fecha_nacimiento: "2000-01-01", edad: 26 }),
      ],
    });

  it("va con su apoderado y el vínculo en la misma petición", () => {
    const form = formInicial(conFaltaTelefono());
    expect(form.jugadores[J1]?.sin_contacto).toBe(true);
    const r = armarAprobacion(form, nombres);
    expect(r.ok && r.datos).toMatchObject({
      jugadores: [{ id: J1 }],
      apoderados: [{ id: A1 }],
      vinculos: [{ jugador_id: J1, apoderado_id: A1 }],
    });
  });

  it("sin su apoderado o sin el vínculo no se envía y explica por qué", () => {
    const sinApoderado = formInicial(conFaltaTelefono());
    sinApoderado.apoderados[A1]!.marcado = false;
    const sinVinculo = formInicial(conFaltaTelefono());
    sinVinculo.vinculos[llaveVinculo({ jugador_id: J1, apoderado_id: A1 })] = false;
    for (const form of [sinApoderado, sinVinculo]) {
      const r = armarAprobacion(form, nombres);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errores[0]).toMatch(/^Ana Pérez: no tiene teléfono/);
    }
  });

  it("sin un apoderado aprobable desde acá parte desmarcado (se le agrega teléfono en su ficha)", () => {
    const OTRA = "55555555-5555-4555-8555-555555555555";
    const sinVinculos = solicitud({ ...conFaltaTelefono(), vinculos: [] });
    const deOtra = conFaltaTelefono();
    deOtra.apoderados[0] = { ...deOtra.apoderados[0]!, solicitud_id: OTRA };
    const sinFoto = conFaltaTelefono();
    sinFoto.apoderados[0] = { ...sinFoto.apoderados[0]!, tiene_foto: false, faltantes: ["foto"] };
    for (const s of [sinVinculos, deOtra, sinFoto]) {
      expect(contactoPosible(J1, s)).toBe(false);
      expect(formInicial(s).jugadores[J1]?.marcado).toBe(false);
    }
    expect(contactoPosible(J1, conFaltaTelefono())).toBe(true);
  });

  it("junta el error de teléfono con los de los campos", () => {
    const form = formInicial(conFaltaTelefono());
    form.apoderados[A1]!.marcado = false;
    form.jugadores[J1]!.numero_camiseta = "";
    const r = armarAprobacion(form, nombres);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errores).toContain("Ana Pérez: revisa número de camiseta.");
      expect(r.errores.some((e) => e.includes("no tiene teléfono"))).toBe(true);
    }
  });

  it("con su apoderado ya activo basta el vínculo", () => {
    const s = conFaltaTelefono();
    s.apoderados[0] = { ...s.apoderados[0]!, estado: "activo" };
    const r = armarAprobacion(formInicial(s), nombres);
    expect(r.ok && r.datos.vinculos).toEqual([{ jugador_id: J1, apoderado_id: A1 }]);
  });
});

describe("rechazar un vínculo suelto (#27)", () => {
  it("manda solo ese vínculo, sin personas", () => {
    expect(armarRechazoVinculo(`${J1}:${A1}`)).toEqual({
      ok: true,
      datos: { vinculos: [{ jugador_id: J1, apoderado_id: A1 }] },
    });
  });

  it("una llave rota no se envía", () => {
    expect(armarRechazoVinculo("x").ok).toBe(false);
  });
});
