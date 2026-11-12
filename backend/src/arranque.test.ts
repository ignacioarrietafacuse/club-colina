import { describe, expect, it } from "vitest";
import { arrancar } from "./arranque";

describe("arranque", () => {
  it("migra antes de levantar el servidor", async () => {
    const orden: string[] = [];
    const ok = await arrancar({
      migrar: async () => void orden.push("migrar"),
      levantar: async () => void orden.push("levantar"),
      fallar: () => orden.push("fallar"),
    });
    expect(ok).toBe(true);
    expect(orden).toEqual(["migrar", "levantar"]);
  });

  it("si las migraciones fallan, no levanta el servidor", async () => {
    const orden: string[] = [];
    const ok = await arrancar({
      migrar: async () => {
        throw new Error("falla");
      },
      levantar: async () => void orden.push("levantar"),
      fallar: (etapa) => orden.push(`fallar:${etapa}`),
    });
    expect(ok).toBe(false);
    expect(orden).toEqual(["fallar:migraciones"]);
  });

  it("si el servidor no levanta, también falla", async () => {
    const etapas: string[] = [];
    const ok = await arrancar({
      migrar: async () => {},
      levantar: async () => {
        throw new Error("puerto ocupado");
      },
      fallar: (etapa) => etapas.push(etapa),
    });
    expect(ok).toBe(false);
    expect(etapas).toEqual(["servidor"]);
  });
});
