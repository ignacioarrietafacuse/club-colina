import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BACKEND, CABECERA_IP, CABECERA_PROXY, reenviar } from "./middleware";

const SECRETO = "s".repeat(43);

describe("middleware de Vercel", () => {
  it("sin secreto deja seguir a la reescritura de vercel.json", () => {
    const r = reenviar(new Request("https://club-colina.vercel.app/api/health"), undefined);
    expect(r.headers.get("x-middleware-next")).toBe("1");
    expect(r.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("con secreto reenvía al backend con el secreto y la IP del borde de Vercel", () => {
    const r = reenviar(
      new Request("https://club-colina.vercel.app/api/public/categorias?x=1", {
        headers: {
          cookie: "sesion=abc",
          "content-type": "application/json",
          "x-real-ip": "203.0.113.50",
          // Lo que mande el cliente en nuestras cabeceras se descarta.
          [CABECERA_PROXY]: "falso-del-cliente",
          [CABECERA_IP]: "198.51.100.1",
          host: "club-colina.vercel.app",
          "x-vercel-oidc-token": "interno",
          "x-forwarded-for": "198.51.100.2",
          "x-middleware-rewrite": "https://evil.example",
        },
      }),
      SECRETO,
    );
    expect(r.headers.get("x-middleware-rewrite")).toBe(`${BACKEND}/api/public/categorias?x=1`);
    const pedido = (n: string) => r.headers.get(`x-middleware-request-${n}`);
    expect(pedido(CABECERA_PROXY)).toBe(SECRETO);
    expect(pedido(CABECERA_IP)).toBe("203.0.113.50");
    expect(pedido("cookie")).toBe("sesion=abc");
    expect(pedido("content-type")).toBe("application/json");
    for (const n of ["host", "x-vercel-oidc-token", "x-forwarded-for", "x-real-ip"]) {
      expect(pedido(n)).toBeNull();
    }
    // Las x-middleware-* que mande el cliente no se reenvían.
    expect(pedido("x-middleware-rewrite")).toBeNull();
    // Y nada de eso va en la respuesta al navegador como cabecera propia.
    expect(r.headers.get(CABECERA_PROXY)).toBeNull();
  });

  it("una ruta armada para cambiar de dominio nunca sale del backend", () => {
    const rutas = [
      "/api/..//evil.example/x",
      "/api/%2e%2e//evil.example/x",
      "/api/../\\evil.example/x",
      "/api//evil.example/x",
      "/api/x/..//..//evil.example",
    ];
    for (const ruta of rutas) {
      const r = reenviar(new Request(`https://club-colina.vercel.app${ruta}`), SECRETO);
      const destino = r.headers.get("x-middleware-rewrite");
      if (destino !== null) {
        expect(new URL(destino).origin).toBe(BACKEND);
        expect(new URL(destino).pathname.startsWith("/api/")).toBe(true);
      } else {
        expect(r.headers.get("x-middleware-next")).toBe("1");
      }
    }
  });

  it("el destino es el mismo que la reescritura de vercel.json", () => {
    const vercel: { rewrites: { source: string; destination: string }[] } = JSON.parse(
      readFileSync(new URL("./vercel.json", import.meta.url), "utf8"),
    );
    const api = vercel.rewrites.find((r) => r.source === "/api/:path*");
    expect(api?.destination).toBe(`${BACKEND}/api/:path*`);
  });
});
