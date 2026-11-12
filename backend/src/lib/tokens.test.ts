import { describe, expect, it } from "vitest";
import { token } from "@club-colina/shared";
import { generarToken, hashToken, tokensIguales } from "./tokens";

describe("tokens", () => {
  it("genera 32 bytes en base64url, distintos cada vez", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const t = generarToken();
      expect(token.safeParse(t).success).toBe(true);
      expect(Buffer.from(t, "base64url")).toHaveLength(32);
      vistos.add(t);
    }
    expect(vistos.size).toBe(1000);
  });

  it("hashea con sha256 sin devolver el token", () => {
    const t = generarToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });

  it("compara en tiempo constante", () => {
    const t = generarToken();
    expect(tokensIguales(t, t)).toBe(true);
    expect(tokensIguales(t, generarToken())).toBe(false);
    expect(tokensIguales(t, "corto")).toBe(false);
  });
});
