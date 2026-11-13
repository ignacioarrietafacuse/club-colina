import type { SuscripcionResponse } from "@club-colina/shared";

/** `?resultado=` con que vuelve el retorno de Flow. Cualquier otro valor se ignora. */
export type BusquedaSuscripcion = { resultado?: "ok" | "error" };

export function busquedaSuscripcion(search: Record<string, unknown>): BusquedaSuscripcion {
  return search.resultado === "ok" || search.resultado === "error"
    ? { resultado: search.resultado }
    : {};
}

export function mensajeResultado(resultado: "ok" | "error"): string {
  return resultado === "ok"
    ? "Listo: la tarjeta quedó inscrita en Flow. El cargo es automático y mensual."
    : "No se pudo inscribir la tarjeta. Vuelve a intentarlo; si se repite, avisa a Ignacio.";
}

/**
 * Solo se sale del panel hacia Flow: si el servidor devolviera otra dirección, no se sigue. Son los
 * dos sitios de Flow (producción y sandbox).
 */
export function esUrlDeFlow(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" && (u.hostname === "www.flow.cl" || u.hostname === "sandbox.flow.cl")
    );
  } catch {
    return false;
  }
}

export function formatoMonto(plan: NonNullable<SuscripcionResponse["plan"]>): string {
  const monto = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(plan.monto);
  return plan.moneda === "CLP" ? `$${monto}` : `${monto} ${plan.moneda}`;
}

/** "2026-12-13" → "13-12-2026", sin pasar por `Date` (que la correría de zona horaria). */
export function formatoFecha(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return a && m && d ? `${d}-${m}-${a}` : fecha;
}

export const TEXTO_ESTADO_COBRO = {
  pagado: "Pagado",
  pendiente: "Pendiente",
  fallido: "Fallido",
  anulado: "Anulado",
} as const;

/** Cada cuánto se vuelve a pedir el aviso (el backend también lo guarda 15 minutos). */
export const DURACION_AVISO_MS = 15 * 60 * 1000;

/** Clave de TanStack Query del aviso global (se invalida al inscribir o reintentar). */
export const CLAVE_AVISO_SUSCRIPCION = ["suscripcion", "aviso"] as const;
export const CLAVE_SUSCRIPCION = ["suscripcion", "estado"] as const;
