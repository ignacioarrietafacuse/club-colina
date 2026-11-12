import { generarRutFicticio } from "@club-colina/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ErrorApi, esErrorApi, mensajeDeError } from "./index";

// Datos siempre ficticios.
const ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const TOKEN = "a".repeat(43);

interface Llamada {
  url: string;
  init: RequestInit;
}
let llamadas: Llamada[];

function responder(...respuestas: (Response | Error)[]) {
  const cola = [...respuestas];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      const r = cola.shift();
      if (!r) throw new Error("fetch sin respuesta preparada");
      if (r instanceof Error) throw r;
      return r;
    }),
  );
}

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function cuerpoMultipart(init: RequestInit): FormData {
  if (!(init.body instanceof FormData)) throw new Error("se esperaba multipart");
  return init.body;
}

async function errorDe(promesa: Promise<unknown>): Promise<ErrorApi> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof ErrorApi) return error;
    throw error;
  }
  throw new Error("se esperaba un ErrorApi");
}

beforeEach(() => {
  llamadas = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("respuestas", () => {
  it("valida con el contrato y descarta campos que no están en él", async () => {
    responder(json({ nombre_completo: "Ana Pérez", rol: "jugador", rut: generarRutFicticio(1) }));
    const datos = await api.publico.credencial(TOKEN);
    expect(datos).toEqual({ nombre_completo: "Ana Pérez", rol: "jugador" });
    expect(llamadas[0]?.url).toBe(`/api/public/credencial/${TOKEN}`);
    expect(llamadas[0]?.init.method).toBe("GET");
    expect(llamadas[0]?.init.credentials).toBe("same-origin");
  });

  it("una respuesta fuera de contrato es un error, no un dato a medias", async () => {
    responder(json({ nombre_completo: "Ana Pérez", rol: "presidente" }));
    const error = await errorDe(api.publico.credencial(TOKEN));
    expect(error.codigo).toBe("respuesta_invalida");
    expect(error.status).toBe(200);
  });

  it("un 200 sin cuerpo JSON también es respuesta_invalida", async () => {
    responder(new Response("<html>", { status: 200 }));
    expect((await errorDe(api.panel.dashboard())).codigo).toBe("respuesta_invalida");
  });
});

describe("errores", () => {
  it("lee el error del contrato con su status, código y mensaje", async () => {
    responder(json({ error: { codigo: "conflicto", mensaje: "La lista cambió" } }, 409));
    const error = await errorDe(api.publico.consultarRut(generarRutFicticio(2)));
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error.status).toBe(409);
    expect(error.codigo).toBe("conflicto");
    expect(mensajeDeError(error)).toBe("La lista cambió");
    expect(esErrorApi(error, "conflicto")).toBe(true);
    expect(esErrorApi(error, "validacion")).toBe(false);
  });

  it("un error sin el formato del contrato termina en error_interno con mensaje fijo", async () => {
    responder(new Response("Bad Gateway", { status: 502 }));
    const error = await errorDe(api.panel.dashboard());
    expect(error.status).toBe(502);
    expect(error.codigo).toBe("error_interno");
    expect(error.message).not.toContain("Bad Gateway");
  });

  it("un código que no está en el contrato no se acepta tal cual", async () => {
    responder(json({ error: { codigo: "otra_cosa", mensaje: "x" } }, 400));
    expect((await errorDe(api.panel.dashboard())).codigo).toBe("error_interno");
  });

  it("sin red: sin_conexion con status 0", async () => {
    responder(new TypeError("Failed to fetch"));
    const error = await errorDe(api.publico.categoriasPublicas());
    expect(error.status).toBe(0);
    expect(error.codigo).toBe("sin_conexion");
  });

  it("un error que no es de la API tiene un mensaje genérico", () => {
    expect(mensajeDeError(new Error("detalle interno"))).toBe("Algo salió mal. Intenta de nuevo.");
  });
});

describe("cuerpos y URLs", () => {
  it("manda JSON con su Content-Type", async () => {
    responder(json({ usuario: { id: ID, nombre: "Mony" } }));
    await api.auth.login({ usuario: "mony", password: "secreta" });
    const { url, init } = llamadas[0]!;
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ usuario: "mony", password: "secreta" });
  });

  it("pasa los filtros a la URL y omite los vacíos", async () => {
    responder(json([]));
    await api.panel.jugadores({
      estado: "activo",
      faltan_datos: true,
      sin_numero: false,
      categoria_id: 3,
      q: "",
      disciplina: undefined,
    });
    expect(llamadas[0]?.url).toBe(
      "/api/panel/jugadores?estado=activo&faltan_datos=true&sin_numero=false&categoria_id=3",
    );
  });

  it("sin filtros no agrega '?'", async () => {
    responder(json([]));
    await api.panel.solicitudes();
    expect(llamadas[0]?.url).toBe("/api/panel/solicitudes");
  });

  it("codifica los ids en la ruta", async () => {
    responder(new Response(null, { status: 204 }));
    await api.panel.editarJugador("a/b", { nombre: "Ana" });
    expect(llamadas[0]?.url).toBe("/api/panel/jugadores/a%2Fb");
    expect(llamadas[0]?.init.method).toBe("PATCH");
  });

  it("el formulario va en multipart: datos primero y cada foto como foto_<clave>", async () => {
    responder(json({ token_acceso: TOKEN, otros_apoderados: [] }));
    const foto = new Blob(["x"], { type: "image/jpeg" });
    const rut = generarRutFicticio(3);
    const r = await api.publico.crearSolicitud(
      { rut, tipo: "apoderado", consentimiento: true, foto: "titular" },
      { titular: foto },
    );
    expect(r.token_acceso).toBe(TOKEN);
    const { init } = llamadas[0]!;
    // El navegador pone el boundary: el cliente no fija Content-Type en multipart.
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    const formData = cuerpoMultipart(init);
    expect([...formData.keys()]).toEqual(["datos", "foto_titular"]);
    expect(JSON.parse(String(formData.get("datos")))).toMatchObject({ rut, foto: "titular" });
  });

  it("completar manda el consentimiento y la foto, y acepta un 204", async () => {
    responder(new Response(null, { status: 204 }));
    await api.publico.enviarCompletar(TOKEN, new Blob(["x"], { type: "image/jpeg" }));
    const formData = cuerpoMultipart(llamadas[0]!.init);
    expect(formData.get("consentimiento")).toBe("true");
    expect(formData.get("foto")).toBeInstanceOf(Blob);
  });

  it("la URL de una foto del panel pasa por el backend", () => {
    expect(api.panel.urlFoto("entrenadores", ID)).toBe(`/api/panel/entrenadores/${ID}/foto`);
    expect(api.publico.urlFotoCredencial(TOKEN)).toBe(`/api/public/credencial/${TOKEN}/foto`);
  });
});

describe("sesión", () => {
  it("con sesión devuelve el usuario", async () => {
    responder(json({ usuario: { id: ID, nombre: "Mony" } }));
    expect(await api.auth.sesionActual()).toEqual({ id: ID, nombre: "Mony" });
  });

  it("un 401 es 'sin sesión'", async () => {
    responder(json({ error: { codigo: "no_autenticado", mensaje: "Inicia sesión" } }, 401));
    expect(await api.auth.sesionActual()).toBeNull();
  });

  it("cualquier otro error se lanza", async () => {
    responder(json({ error: { codigo: "error_interno", mensaje: "Error interno" } }, 500));
    expect((await errorDe(api.auth.sesionActual())).status).toBe(500);
  });
});
