import { describe, expect, it } from "vitest";
import { BACKEND, CABECERA_PROXY, reenviar } from "./middleware";

describe("middleware de Vercel", () => {
  it("sin secreto deja seguir a la reescritura de vercel.json", () => {
    const r = reenviar(new Request("https://club-colina.vercel.app/api/health"), undefined);
    expect(r.headers.get("x-middleware-next")).toBe("1");
    expect(r.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("con secreto reenvía al backend con la cabecera del proxy, sin perder la ruta ni la query", () => {
    const r = reenviar(
      new Request("https://club-colina.vercel.app/api/public/categorias?x=1", {
        headers: { "x-otra": "a", [CABECERA_PROXY]: "falso-del-cliente" },
      }),
      "s".repeat(43),
    );
    expect(r.headers.get("x-middleware-rewrite")).toBe(`${BACKEND}/api/public/categorias?x=1`);
    // El secreto reemplaza cualquier valor que haya mandado el cliente.
    expect(r.headers.get(`x-middleware-request-${CABECERA_PROXY}`)).toBe("s".repeat(43));
    expect(r.headers.get("x-middleware-request-x-otra")).toBe("a");
    // Y el secreto nunca va en la respuesta al navegador.
    expect([...r.headers.keys()].filter((k) => k === CABECERA_PROXY)).toEqual([]);
  });
});
