import { token as esquemaToken } from "@club-colina/shared";
import type { CredencialResponse } from "@club-colina/shared";
import { statusDe } from "./api";
import type { EstadoCredencial } from "./Credencial";

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

/** Cuánto vale una verificación en pantalla. Pasado esto, hay que volver a escanear. */
export const VIGENCIA_VERIFICACION_MS = 60_000;

/**
 * Qué mostrar con lo que tiene la consulta. Denegar por defecto: "válida" solo con datos de una
 * respuesta que terminó (sin otra en curso ni en pausa) hace menos de un minuto.
 */
export function estadoDesdeConsulta(c: {
  conForma: boolean;
  pendiente: boolean;
  enCurso: boolean;
  error: "no_encontrado" | "demasiados_intentos" | "otro" | null;
  datos: CredencialResponse | undefined;
  actualizadaEn: number;
  ahora: number;
  fotoUrl: string;
}): EstadoCredencial {
  if (!c.conForma) return { tipo: "no_valida" };
  if (c.error === "no_encontrado") return { tipo: "no_valida" };
  if (c.error === "demasiados_intentos") return { tipo: "demasiados_intentos" };
  if (c.error === "otro") return { tipo: "error" };
  if (c.pendiente || c.enCurso || !c.datos) return { tipo: "cargando" };
  if (c.ahora - c.actualizadaEn > VIGENCIA_VERIFICACION_MS) return { tipo: "vencida" };
  return {
    tipo: "valida",
    datos: c.datos,
    fotoUrl: c.fotoUrl,
    verificadaEn: new Date(c.actualizadaEn),
  };
}
