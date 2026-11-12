import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, isRedirect } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { esItemActivo, nav } from "@/components/panel/navegacion";
import { ErrorApi } from "@/lib/api";
import { crearRouter } from "@/router";
import { CategoriasPage } from "./CategoriasPage";
import { ConversacionesPage } from "./ConversacionesPage";
import { INDICADORES_ETAPA_2, saludo } from "./dashboard";
import { guardaPanel } from "./guarda";
import { LeadsPage } from "./LeadsPage";
import { mensajeLogin } from "./login";
import { PagosPage } from "./PagosPage";
import { CLAVE_SESION, esSesionVencida, olvidarSesion } from "./sesion";
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

async function guardar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return guardaPanel({ context: { queryClient } });
}

describe("guarda del panel", () => {
  it("con sesión deja pasar y entrega el usuario", async () => {
    stubMe(json({ usuario: { id: ID, nombre: "Administración" } }));
    expect(await guardar()).toEqual({ usuario: { id: ID, nombre: "Administración" } });
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

describe("sesión", () => {
  it("solo un 401 cuenta como sesión vencida", () => {
    expect(esSesionVencida(new ErrorApi(401, "no_autenticado", "x"))).toBe(true);
    expect(esSesionVencida(new ErrorApi(403, "origen_no_permitido", "x"))).toBe(false);
    expect(esSesionVencida(new Error("x"))).toBe(false);
  });

  it("al olvidar la sesión no queda ningún dato del panel en memoria", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(CLAVE_SESION, { id: ID, nombre: "Administración" });
    queryClient.setQueryData(["panel", "jugadores"], [{ id: ID }]);
    olvidarSesion(queryClient);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
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
