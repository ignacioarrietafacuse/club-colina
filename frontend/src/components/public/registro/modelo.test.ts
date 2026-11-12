import { generarRutFicticio, solicitudDatos, type RutLookupResponse } from "@club-colina/shared";
import { describe, expect, it } from "vitest";
import {
  armarSolicitud,
  busquedaDesdeLookup,
  camposHijo,
  camposTitular,
  iniciarFormulario,
  nuevoFormulario,
  nombreHijo,
  nuevoHijoPorRut,
  pasosDe,
  sinHijo,
  validarPaso,
  validarEnvio,
  validarHijos,
  validarOtro,
  validarTitular,
  type Formulario,
  type Hijo,
} from "./modelo";

const RUT = generarRutFicticio(1);
const RUT_HIJO = generarRutFicticio(2);
const RUT_OTRO = generarRutFicticio(3);
const HOY = new Date("2026-11-12T12:00:00Z");
const foto = () => new File([new Uint8Array([1, 2, 3])], "x.jpg", { type: "image/jpeg" });

/** Los tres hijos precargados de `apoderadoBase`, sin `as`. */
function tresHijos(f: Formulario): [Hijo, Hijo, Hijo] {
  const [a, b, c] = f.hijos;
  if (!a || !b || !c) throw new Error("faltan hijos");
  return [a, b, c];
}

function formulario(inicio: ReturnType<typeof iniciarFormulario>): Formulario {
  if (inicio.tipo !== "formulario") throw new Error(`esperaba formulario, vino ${inicio.tipo}`);
  return inicio.formulario;
}

const apoderadoBase: Extract<RutLookupResponse, { tipo: "apoderado" }> = {
  encontrado: true,
  tipo: "apoderado",
  ya_registrado: false,
  faltantes: ["foto"],
  hijos: [
    {
      posicion: 0,
      primer_nombre: "Ana",
      ya_registrado: false,
      faltantes: ["foto", "numero_camiseta"],
    },
    {
      posicion: 1,
      primer_nombre: "Beto",
      ya_registrado: false,
      faltantes: ["foto", "numero_camiseta", "categoria"],
    },
    { posicion: 2, primer_nombre: "Caro", ya_registrado: true, faltantes: [] },
  ],
};

/** El contrato es el juez: todo lo que arma el formulario tiene que pasar `solicitudDatos`. */
function cumpleContrato(f: Formulario) {
  const armada = armarSolicitud(f);
  const r = solicitudDatos.safeParse(armada.datos);
  expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  return armada;
}

describe("inicio según la consulta del RUT", () => {
  it("RUT no encontrado: pide elegir rol", () => {
    expect(iniciarFormulario(RUT, { encontrado: false })).toEqual({ tipo: "elegir_rol", rut: RUT });
  });

  it("jugador menor: no puede llenar el formulario con su RUT", () => {
    const r = iniciarFormulario(RUT, {
      encontrado: true,
      tipo: "jugador",
      primer_nombre: "Ana",
      adulto: false,
      ya_registrado: false,
      faltantes: [],
    });
    expect(r.tipo).toBe("menor_de_edad");
  });

  it("jugador adulto ya registrado: no hay nada que llenar", () => {
    const r = iniciarFormulario(RUT, {
      encontrado: true,
      tipo: "jugador",
      primer_nombre: "Ana",
      adulto: true,
      ya_registrado: true,
      faltantes: [],
    });
    expect(r.tipo).toBe("adulto_ya_registrado");
  });

  it("apoderado precargado: trae a sus hijos por posición", () => {
    const f = formulario(iniciarFormulario(RUT, apoderadoBase));
    expect(f.hijos.map((h) => h.clave)).toEqual(["p0", "p1", "p2"]);
    expect([...camposTitular(f.titular).pedir]).toEqual(["foto"]);
  });
});

describe("qué se pregunta", () => {
  it("persona nueva: todo menos la categoría, que calcula el servidor", () => {
    const c = camposTitular({ tipo: "jugador_adulto", lookup: null });
    expect(c.pedir.has("disciplina")).toBe(true);
    expect(c.pedir.has("categoria")).toBe(false);
    const h = nuevoHijoPorRut();
    h.origen = { tipo: "rut", rut: RUT_HIJO, busqueda: { estado: "nuevo" } };
    expect(camposHijo(h).pedir.has("categoria")).toBe(false);
    expect(camposTitular({ tipo: "apoderado", lookup: null }).pedir.has("numero_camiseta")).toBe(
      false,
    );
  });

  it("precargado: solo lo que falta; la categoría, si el servidor dice que falta, es obligatoria", () => {
    const f = formulario(iniciarFormulario(RUT, apoderadoBase));
    const [ana, beto, caro] = tresHijos(f);
    expect([...camposHijo(ana).pedir].sort()).toEqual(["foto", "numero_camiseta"]);
    expect(camposHijo(beto).pedir.has("categoria")).toBe(true);
    expect(camposHijo(caro).pedir.size).toBe(0);
    expect(validarHijos(f, HOY)[`hijo.${beto.clave}.categoria_id`]).toMatch(/categoría/);
  });

  it("a un hijo por RUT nunca se le pide teléfono, aunque el servidor lo trate como adulto", () => {
    const b = busquedaDesdeLookup({
      encontrado: true,
      tipo: "jugador",
      primer_nombre: "Dani",
      adulto: true,
      ya_registrado: false,
      faltantes: ["telefono", "foto", "fecha_nacimiento"],
    });
    expect(b).toEqual({
      estado: "precargado",
      primer_nombre: "Dani",
      ya_registrado: false,
      faltantes: ["foto", "fecha_nacimiento"],
    });
  });

  it("el nombre de un hijo es el que escribió la familia, si se le pidió", () => {
    const f = formulario(
      iniciarFormulario(RUT, {
        ...apoderadoBase,
        hijos: [{ posicion: 0, primer_nombre: "", ya_registrado: false, faltantes: ["nombre"] }],
      }),
    );
    const [h] = f.hijos;
    if (!h) throw new Error("falta el hijo");
    expect(nombreHijo(h, 0)).toBe("Hijo 1");
    h.datos.nombre = "Dani";
    expect(nombreHijo(h, 0)).toBe("Dani");
  });

  it("apoderado ya registrado: no se le piden sus datos", () => {
    const f = formulario(
      iniciarFormulario(RUT, { ...apoderadoBase, ya_registrado: true, faltantes: ["foto"] }),
    );
    expect(camposTitular(f.titular).pedir.size).toBe(0);
  });

  it("hijo marcado «ya no está»: nada más", () => {
    const f = formulario(iniciarFormulario(RUT, apoderadoBase));
    const [ana] = tresHijos(f);
    ana.ya_no_esta = true;
    expect(camposHijo(ana).pedir.size).toBe(0);
  });

  it("hijo por RUT: según la búsqueda", () => {
    expect(busquedaDesdeLookup({ encontrado: false })).toEqual({ estado: "nuevo" });
    expect(busquedaDesdeLookup({ ...apoderadoBase })).toHaveProperty("error");
    const h = nuevoHijoPorRut();
    h.origen = { tipo: "rut", rut: RUT_HIJO, busqueda: { estado: "nuevo" } };
    expect(camposHijo(h).pedir.has("disciplina")).toBe(true);
    h.origen.busqueda = {
      estado: "precargado",
      primer_nombre: "Dani",
      ya_registrado: true,
      faltantes: ["foto"],
    };
    expect(camposHijo(h).pedir.size).toBe(0);
  });
});

describe("validación", () => {
  it("titular nuevo: exige todo y revisa formatos", () => {
    const f = nuevoFormulario(RUT, { tipo: "jugador_adulto", lookup: null });
    f.datos = {
      nombre: " ",
      apellido: "Pérez",
      telefono: "1234",
      fecha_nacimiento: "2030-01-01",
      disciplina: "",
      numero_camiseta: "100",
      categoria_id: "",
    };
    const e = validarTitular(f, HOY);
    expect(Object.keys(e).sort()).toEqual(
      ["disciplina", "fecha_nacimiento", "foto", "nombre", "numero_camiseta", "telefono"].sort(),
    );
  });

  it("jugador adulto nuevo menor de 18: lo registra su apoderado", () => {
    const f = nuevoFormulario(RUT, { tipo: "jugador_adulto", lookup: null });
    f.datos.fecha_nacimiento = "2010-01-01";
    expect(validarTitular(f, HOY)["fecha_nacimiento"]).toMatch(/menor de 18/);
    f.datos.fecha_nacimiento = "2008-11-12";
    expect(validarTitular(f, HOY)["fecha_nacimiento"]).toBeUndefined();
    f.datos.fecha_nacimiento = "2008-11-13";
    expect(validarTitular(f, HOY)["fecha_nacimiento"]).toMatch(/menor de 18/);
  });

  it("acepta teléfono con +56, número 0 y 00, fecha válida", () => {
    const f = nuevoFormulario(RUT, { tipo: "jugador_adulto", lookup: null });
    f.datos = {
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "+56 9 1234 5678",
      fecha_nacimiento: "2000-02-29",
      disciplina: "voleibol",
      numero_camiseta: "00",
      categoria_id: "",
    };
    f.foto = foto();
    expect(validarTitular(f, HOY)).toEqual({});
    f.datos.fecha_nacimiento = "2001-02-29";
    expect(validarTitular(f, HOY)).toHaveProperty("fecha_nacimiento");
  });

  it("hijos por RUT: inválido, repetido, el propio y sin buscar", () => {
    const f = nuevoFormulario(RUT, { tipo: "apoderado", lookup: null });
    const malo = nuevoHijoPorRut();
    if (malo.origen.tipo === "rut") malo.origen.rut = "12.345.678-0";
    const propio = nuevoHijoPorRut();
    if (propio.origen.tipo === "rut") propio.origen.rut = RUT;
    const a = nuevoHijoPorRut();
    if (a.origen.tipo === "rut")
      a.origen = { tipo: "rut", rut: RUT_HIJO, busqueda: { estado: "sin_buscar" } };
    const b = nuevoHijoPorRut();
    if (b.origen.tipo === "rut")
      b.origen = { tipo: "rut", rut: RUT_HIJO, busqueda: { estado: "nuevo" } };
    f.hijos = [malo, propio, a, b];
    const e = validarHijos(f, HOY);
    expect(e[`hijo.${malo.clave}.rut`]).toMatch(/válido/);
    expect(e[`hijo.${propio.clave}.rut`]).toMatch(/propio/);
    expect(e[`hijo.${a.clave}.rut`]).toMatch(/Buscar/);
    expect(e[`hijo.${b.clave}.rut`]).toMatch(/ya está/);
  });

  it("apoderado nuevo sin hijos no avanza", () => {
    const f = nuevoFormulario(RUT, { tipo: "apoderado", lookup: null });
    expect(validarHijos(f, HOY)).toHaveProperty("hijos");
  });

  it("otro apoderado: datos y al menos un hijo", () => {
    const f = formulario(iniciarFormulario(RUT, apoderadoBase));
    f.otro = { nombre: "", apellido: "X", rut: RUT, telefono: "9", hijos: [] };
    expect(Object.keys(validarOtro(f)).sort()).toEqual(
      ["otro.hijos", "otro.nombre", "otro.rut", "otro.telefono"].sort(),
    );
  });

  it("envío: consentimiento, y un apoderado ya registrado tiene que mandar algo", () => {
    const f = formulario(
      iniciarFormulario(RUT, { ...apoderadoBase, ya_registrado: true, hijos: [] }),
    );
    expect(Object.keys(validarEnvio(f)).sort()).toEqual(["consentimiento", "envio"]);
  });
});

describe("armado de la solicitud", () => {
  it("apoderado precargado: refs por posición, solo lo que falta, ya no está y otro apoderado", () => {
    const f = formulario(iniciarFormulario(RUT, apoderadoBase));
    f.foto = foto();
    f.paga_mensualidad = true;
    const [ana, beto, caro] = tresHijos(f);
    ana.foto = foto();
    ana.datos.numero_camiseta = "0";
    ana.datos.nombre = "No se manda";
    beto.ya_no_esta = true;
    const nuevo = nuevoHijoPorRut();
    nuevo.origen = { tipo: "rut", rut: RUT_HIJO, busqueda: { estado: "nuevo" } };
    nuevo.datos = {
      nombre: "Dani",
      apellido: "Rojas",
      telefono: "",
      fecha_nacimiento: "2014-05-01",
      disciplina: "basketball",
      numero_camiseta: "99",
      categoria_id: "",
    };
    nuevo.foto = foto();
    f.hijos.push(nuevo);
    f.otro = {
      nombre: "Eva",
      apellido: "Soto",
      rut: RUT_OTRO,
      telefono: "912345678",
      hijos: [caro.clave, nuevo.clave, beto.clave],
    };
    f.consentimiento = true;

    expect(validarTitular(f, HOY)).toEqual({});
    expect(validarHijos(f, HOY)).toEqual({});
    expect(validarOtro(f)).toEqual({});
    expect(validarEnvio(f)).toEqual({});

    const { datos, fotos } = cumpleContrato(f);
    expect(datos).toEqual({
      rut: RUT,
      tipo: "apoderado",
      consentimiento: true,
      foto: "titular",
      paga_mensualidad: true,
      hijos: [
        { ref: { precargado: 0, primer_nombre: "Ana" }, numero_camiseta: "0", foto: "hijo_p0" },
        { ref: { precargado: 1, primer_nombre: "Beto" }, ya_no_esta: true },
        // Caro ya estaba registrada: va solo porque el otro apoderado la nombra.
        { ref: { precargado: 2, primer_nombre: "Caro" } },
        {
          ref: { rut: RUT_HIJO },
          nombre: "Dani",
          apellido: "Rojas",
          fecha_nacimiento: "2014-05-01",
          disciplina: "basketball",
          numero_camiseta: "99",
          foto: `hijo_${nuevo.clave}`,
        },
      ],
      // Beto quedó fuera por "ya no está"; los índices apuntan a Caro y Dani.
      otro_apoderado: {
        nombre: "Eva",
        apellido: "Soto",
        rut: RUT_OTRO,
        telefono: "912345678",
        hijos: [2, 3],
      },
    });
    expect(Object.keys(fotos)).toEqual(["titular", "hijo_p0", `hijo_${nuevo.clave}`]);
  });

  it("un hijo ya registrado que nadie nombra no se manda", () => {
    const f = formulario(iniciarFormulario(RUT, apoderadoBase));
    f.foto = foto();
    const { datos } = cumpleContrato(f);
    expect(datos.hijos?.map((h) => ("precargado" in h.ref ? h.ref.precargado : -1))).toEqual([
      0, 1,
    ]);
  });

  it("apoderado ya registrado: no manda sus datos ni la casilla de pago", () => {
    const f = formulario(iniciarFormulario(RUT, { ...apoderadoBase, ya_registrado: true }));
    f.datos.nombre = "Ignorado";
    f.foto = foto();
    const { datos, fotos } = cumpleContrato(f);
    expect(datos).not.toHaveProperty("nombre");
    expect(datos).not.toHaveProperty("foto");
    expect(datos).not.toHaveProperty("paga_mensualidad");
    expect(Object.keys(fotos)).toEqual([]);
  });

  it("jugador adulto nuevo: sin categoría (la calcula el servidor) y sin hijos", () => {
    const f = nuevoFormulario(RUT, { tipo: "jugador_adulto", lookup: null });
    f.datos = {
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "912345678",
      fecha_nacimiento: "2004-01-01",
      disciplina: "voleibol",
      numero_camiseta: "7",
      categoria_id: "9",
    };
    f.foto = foto();
    const { datos } = cumpleContrato(f);
    expect(datos).toMatchObject({ tipo: "jugador_adulto", disciplina: "voleibol", hijos: [] });
    // Aunque quedara un valor en el estado, una categoría que no se preguntó no se manda.
    expect(datos).not.toHaveProperty("categoria_id");
    expect(datos).not.toHaveProperty("paga_mensualidad");
  });
});

describe("pasos", () => {
  it("apoderado nuevo: todos", () => {
    const f = nuevoFormulario(RUT, { tipo: "apoderado", lookup: null });
    expect(pasosDe(f)).toEqual(["titular", "hijos", "otro", "confirmar"]);
  });

  it("apoderado ya registrado: sin el paso de sus datos", () => {
    const f = formulario(iniciarFormulario(RUT, { ...apoderadoBase, ya_registrado: true }));
    expect(pasosDe(f)).toEqual(["hijos", "otro", "confirmar"]);
  });

  it("apoderado precargado sin faltantes: igual ve sus datos por la casilla de pago", () => {
    const f = formulario(iniciarFormulario(RUT, { ...apoderadoBase, faltantes: [] }));
    expect(pasosDe(f)).toEqual(["titular", "hijos", "otro", "confirmar"]);
  });

  it("jugador adulto precargado sin faltantes: solo confirmar", () => {
    const f = formulario(
      iniciarFormulario(RUT, {
        encontrado: true,
        tipo: "jugador",
        primer_nombre: "Ana",
        adulto: true,
        ya_registrado: false,
        faltantes: [],
      }),
    );
    expect(pasosDe(f)).toEqual(["confirmar"]);
  });

  it("quitar un hijo lo saca también del otro apoderado; un precargado no se quita", () => {
    const f = formulario(iniciarFormulario(RUT, apoderadoBase));
    const h = nuevoHijoPorRut();
    f.hijos.push(h);
    f.otro = { nombre: "", apellido: "", rut: "", telefono: "", hijos: [h.clave, "p0"] };
    const g = sinHijo(sinHijo(f, h.clave), "p0");
    expect(g.hijos.map((x) => x.clave)).toEqual(["p0", "p1", "p2"]);
    expect(g.otro?.hijos).toEqual(["p0"]);
  });

  it("validarPaso usa el validador de cada paso", () => {
    const f = nuevoFormulario(RUT, { tipo: "apoderado", lookup: null });
    expect(validarPaso(f, "hijos", HOY)).toHaveProperty("hijos");
    expect(validarPaso(f, "otro", HOY)).toEqual({});
    expect(validarPaso(f, "confirmar", HOY)).toHaveProperty("consentimiento");
  });
});
