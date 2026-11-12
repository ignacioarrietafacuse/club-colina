import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, isRedirect } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { esItemActivo, nav } from "@/components/panel/navegacion";
import { ErrorApi, reintentar } from "@/lib/api";
import { crearRouter } from "@/router";
import { CategoriasPage } from "./CategoriasPage";
import { ConversacionesPage } from "./ConversacionesPage";
import { INDICADORES_ETAPA_2, saludo } from "./dashboard";
import { guardaPanel } from "./guarda";
import { LeadsPage } from "./LeadsPage";
import { mensajeLogin } from "./login";
import { PagosPage } from "./PagosPage";
import {
  cerrarSesion,
  CLAVE_SESION,
  esSesionVencida,
  olvidarSesion,
  vigilarSesion,
} from "./sesion";
import { TorneosPage } from "./TorneosPage";
import { UniformesPage } from "./UniformesPage";

const ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubMe(respuesta: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url !== "/api/auth/me") throw new Error(`llamada inesperada: ${url}`);
      return respuesta();
    }),
  );
}

const json =
  (cuerpo: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(cuerpo), {
      status,
      headers: { "Content-Type": "application/json" },
    });

async function guardar(pathname = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return guardaPanel({ context: { queryClient }, location: { pathname } });
}

describe("guarda del panel", () => {
  it("con sesión deja pasar y entrega el usuario", async () => {
    stubMe(json({ usuario: { id: ID, nombre: "Administración", debe_cambiar_clave: false } }));
    expect(await guardar()).toEqual({
      usuario: { id: ID, nombre: "Administración", debe_cambiar_clave: false },
    });
  });

  it("con clave temporal: cualquier ruta lleva a /cambiar-clave, y ahí deja pasar", async () => {
    const usuario = { id: ID, nombre: "Ignacio", debe_cambiar_clave: true };
    for (const ruta of ["/", "/jugadores", "/jugadores/solicitudes"]) {
      stubMe(json({ usuario }));
      let lanzado: unknown;
      try {
        await guardar(ruta);
      } catch (error) {
        lanzado = error;
      }
      expect(isRedirect(lanzado), ruta).toBe(true);
      if (isRedirect(lanzado)) expect(lanzado.options.to).toBe("/cambiar-clave");
    }
    stubMe(json({ usuario }));
    expect(await guardar("/cambiar-clave")).toEqual({ usuario });
  });

  const denegados: [string, () => Response | never][] = [
    ["sin sesión (401)", json({ error: { codigo: "no_autenticado", mensaje: "x" } }, 401)],
    ["error del servidor (500)", json({ error: { codigo: "error_interno", mensaje: "x" } }, 500)],
    ["respuesta fuera de contrato", json({ usuario: { nombre: "sin id" } })],
    ["un 502 del proxy", () => new Response("Bad Gateway", { status: 502 })],
    [
      "sin red",
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  ];
  it.each(denegados)("%s: redirige a /login", async (_caso, respuesta) => {
    stubMe(respuesta);
    let lanzado: unknown;
    try {
      await guardar();
    } catch (error) {
      lanzado = error;
    }
    expect(isRedirect(lanzado)).toBe(true);
    if (isRedirect(lanzado)) expect(lanzado.options.to).toBe("/login");
  });

  it("todas las rutas del panel cuelgan de /_panel, que usa la guarda", () => {
    const router = crearRouter(new QueryClient(), createMemoryHistory());
    const panel = router.routesById["/_panel"];
    expect(panel.options.beforeLoad).toBe(guardaPanel);
    const publicas = ["/registro", "/familia/$token", "/completar/$token", "/c/$token", "/login"];
    for (const [ruta, definicion] of Object.entries(router.routesByPath)) {
      if (publicas.includes(ruta)) continue;
      expect(definicion.parentRoute?.id, ruta).toBe("/_panel");
    }
  });
});

describe("clave temporal en medio de la sesión", () => {
  it("un 403 debe_cambiar_clave avisa una vez para ir a cambiar la clave; otros 403 no", () => {
    const queryClient = new QueryClient();
    const alVencer = vi.fn();
    const alDebeCambiar = vi.fn();
    const dejar = vigilarSesion(queryClient, alVencer, alDebeCambiar);
    const fallar = (error: ErrorApi) =>
      queryClient
        .getMutationCache()
        .build(queryClient, { mutationFn: () => Promise.reject(error) })
        .execute(undefined)
        .catch(() => undefined);
    return (async () => {
      await fallar(new ErrorApi(403, "origen_no_permitido", "x"));
      expect(alDebeCambiar).not.toHaveBeenCalled();
      await fallar(new ErrorApi(403, "debe_cambiar_clave", "x"));
      expect(alDebeCambiar).toHaveBeenCalled();
      expect(alVencer).not.toHaveBeenCalled();
      dejar();
    })();
  });
});

describe("sesión", () => {
  it("solo un 401 cuenta como sesión vencida", () => {
    expect(esSesionVencida(new ErrorApi(401, "no_autenticado", "x"))).toBe(true);
    expect(esSesionVencida(new ErrorApi(403, "origen_no_permitido", "x"))).toBe(false);
    expect(esSesionVencida(new Error("x"))).toBe(false);
  });

  it("al olvidar la sesión no queda ningún dato del panel en memoria", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(CLAVE_SESION, {
      id: ID,
      nombre: "Administración",
      debe_cambiar_clave: false,
    });
    queryClient.setQueryData(["panel", "jugadores"], [{ id: ID }]);
    olvidarSesion(queryClient);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe("vencimiento y cierre de sesión", () => {
  const error401 = () => new ErrorApi(401, "no_autenticado", "x");

  it("un 401 de una consulta avisa una sola vez, aunque fallen varias", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const alVencer = vi.fn();
    const dejar = vigilarSesion(queryClient, alVencer);
    for (const clave of ["a", "b"]) {
      await queryClient
        .fetchQuery({ queryKey: ["panel", clave], queryFn: () => Promise.reject(error401()) })
        .catch(() => undefined);
    }
    expect(alVencer).toHaveBeenCalledTimes(1);
    dejar();
  });

  it("un 401 de una acción también avisa", async () => {
    const queryClient = new QueryClient();
    const alVencer = vi.fn();
    vigilarSesion(queryClient, alVencer);
    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => Promise.reject(error401()) })
      .execute(undefined)
      .catch(() => undefined);
    expect(alVencer).toHaveBeenCalledTimes(1);
  });

  it("un 403 o un 500 no cierran la sesión", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const alVencer = vi.fn();
    vigilarSesion(queryClient, alVencer);
    for (const error of [
      new ErrorApi(403, "origen_no_permitido", "x"),
      new ErrorApi(500, "error_interno", "x"),
    ]) {
      await queryClient
        .fetchQuery({ queryKey: ["panel", error.status], queryFn: () => Promise.reject(error) })
        .catch(() => undefined);
    }
    expect(alVencer).not.toHaveBeenCalled();
  });

  it("las consultas del panel no reintentan un 4xx; sí la falta de red y los 5xx", () => {
    expect(reintentar(0, error401())).toBe(false);
    expect(reintentar(0, new ErrorApi(404, "no_encontrado", "x"))).toBe(false);
    expect(reintentar(0, new ErrorApi(0, "sin_conexion", "x"))).toBe(true);
    expect(reintentar(0, new ErrorApi(502, "error_interno", "x"))).toBe(true);
    expect(reintentar(3, new ErrorApi(502, "error_interno", "x"))).toBe(false);
  });

  it("salir borra lo cargado solo si el servidor cerró la sesión", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["panel", "jugadores"], [{ id: ID }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await cerrarSesion(queryClient);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("si el servidor ya no tenía la sesión (401), también se sale", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["panel", "jugadores"], [{ id: ID }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { codigo: "no_autenticado", mensaje: "x" } }, 401)()),
    );
    await cerrarSesion(queryClient);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("si el logout falla, se lanza el error y no se finge la salida", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(CLAVE_SESION, {
      id: ID,
      nombre: "Administración",
      debe_cambiar_clave: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(cerrarSesion(queryClient)).rejects.toBeInstanceOf(ErrorApi);
    expect(queryClient.getQueryData(CLAVE_SESION)).toEqual({
      id: ID,
      nombre: "Administración",
      debe_cambiar_clave: false,
    });
  });

  it("cuando la guarda no encuentra sesión, borra lo que quedó de otra", async () => {
    stubMe(json({ error: { codigo: "no_autenticado", mensaje: "x" } }, 401));
    const queryClient = new QueryClient();
    queryClient.setQueryData(["panel", "jugadores"], [{ id: ID }]);
    await guardaPanel({ context: { queryClient } }).catch(() => undefined);
    expect(queryClient.getQueryData(["panel", "jugadores"])).toBeUndefined();
  });
});

describe("login", () => {
  it("no distingue usuario inexistente de contraseña incorrecta", () => {
    expect(mensajeLogin(new ErrorApi(401, "credenciales_invalidas", "detalle"))).toBe(
      "Usuario o contraseña incorrectos.",
    );
  });

  it("explica el límite de intentos y los errores sin repetir el detalle", () => {
    expect(mensajeLogin(new ErrorApi(429, "demasiados_intentos", "x"))).toMatch(/Demasiados/);
    expect(mensajeLogin(new ErrorApi(500, "error_interno", "detalle interno"))).not.toContain(
      "detalle",
    );
    expect(mensajeLogin(new Error("detalle"))).not.toContain("detalle");
  });
});

describe("menú y secciones de la Etapa 2", () => {
  it("las secciones de la Etapa 2 del PRD están en el menú marcadas como pendientes", () => {
    expect(nav.filter((i) => i.etapa2).map((i) => i.to)).toEqual([
      "/categorias",
      "/torneos",
      "/uniformes",
      "/conversaciones",
      "/leads",
      "/pagos",
    ]);
    expect(nav.filter((i) => !i.etapa2).map((i) => i.to)).toEqual([
      "/",
      "/jugadores",
      "/apoderados",
      "/entrenadores",
    ]);
  });

  it("marca el ítem también en sus subpáginas, y el dashboard solo en /", () => {
    expect(esItemActivo("/jugadores", `/jugadores/${ID}`)).toBe(true);
    expect(esItemActivo("/jugadores", "/jugadores/solicitudes")).toBe(true);
    expect(esItemActivo("/jugadores", "/jugadoresx")).toBe(false);
    expect(esItemActivo("/", "/jugadores")).toBe(false);
    expect(esItemActivo("/", "/")).toBe(true);
  });

  it.each([
    ["Categorías", CategoriasPage],
    ["Torneos y campus", TorneosPage],
    ["Uniformes", UniformesPage],
    ["IA y Conversaciones", ConversacionesPage],
    ["Leads", LeadsPage],
    ["Pagos", PagosPage],
  ])("%s dice Pendiente y no trae datos", (titulo, Pagina) => {
    const html = renderToStaticMarkup(<Pagina />);
    expect(html).toContain(titulo);
    expect(html).toContain("Pendiente");
    expect(html).toContain("Disponible en la próxima etapa.");
    expect(html.replace(/<[^>]+>/g, "")).not.toMatch(/[0-9]/);
  });
});

describe("dashboard", () => {
  it("saludo genérico según la hora", () => {
    expect(saludo(8)).toBe("Buenos días");
    expect(saludo(15)).toBe("Buenas tardes");
    expect(saludo(23)).toBe("Bienvenido nuevamente");
    expect(saludo(2)).toBe("Bienvenido nuevamente");
  });

  it("los indicadores de la Etapa 2 son los del PRD", () => {
    expect(INDICADORES_ETAPA_2).toHaveLength(8);
    expect(INDICADORES_ETAPA_2).toContain("Pagos recibidos");
    expect(INDICADORES_ETAPA_2).toContain("Actividad reciente");
  });
});
