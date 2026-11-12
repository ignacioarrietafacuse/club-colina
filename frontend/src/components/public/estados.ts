import { token as esquemaToken } from "@club-colina/shared";
import { statusDe } from "./api";

/** Un token con otra forma ni se consulta: no puede ser válido. */
export function tokenConForma(t: string): boolean {
  return esquemaToken.safeParse(t).success;
}

/**
 * Un error de la API que significa "no existe o no está activa" (404 y cualquier otro 4xx
 * salvo el límite de intentos). Lo demás es "no pudimos verificar": nunca "válida".
 */
export function esNoEncontrado(e: unknown): boolean {
  const s = statusDe(e);
  return s !== null && s >= 400 && s < 500 && s !== 429;
}
