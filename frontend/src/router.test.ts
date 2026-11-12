import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { crearRouter } from "./router";

// El esqueleto de rutas es el contrato del frontend para la Ola 1: si alguien quita o
// renombra una ruta, este test falla.
describe("rutas", () => {
  it("declara todas las rutas del panel y las públicas", () => {
    const router = crearRouter(new QueryClient(), createMemoryHistory());
    const rutas = Object.keys(router.routesByPath).sort();
    expect(rutas).toEqual(
      [
        "/",
        "/apoderados",
        "/apoderados/$id",
        "/c/$token",
        "/categorias",
        "/completar/$token",
        "/conversaciones",
        "/entrenadores",
        "/entrenadores/$id",
        "/familia/$token",
        "/jugadores",
        "/jugadores/$id",
        "/jugadores/solicitudes",
        "/jugadores/solicitudes/$id",
        "/leads",
        "/login",
        "/pagos",
        "/registro",
        "/torneos",
        "/uniformes",
      ].sort(),
    );
  });

  it("las rutas públicas y el login no llevan el menú del panel", () => {
    const router = crearRouter(new QueryClient(), createMemoryHistory());
    const porRuta = new Map(Object.entries(router.routesByPath));
    for (const ruta of [
      "/registro",
      "/familia/$token",
      "/completar/$token",
      "/c/$token",
      "/login",
    ]) {
      expect(porRuta.get(ruta)?.parentRoute?.id).toBe("__root__");
    }
    expect(porRuta.get("/jugadores")?.parentRoute?.id).toBe("/_panel");
  });
});
