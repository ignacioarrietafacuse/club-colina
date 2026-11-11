import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes aleatorios en base64url (43 caracteres). Para credenciales, links y sesiones. */
export function generarToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 en hex. Las sesiones se guardan así: la base nunca tiene el token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparación en tiempo constante. */
export function tokensIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
