import {
  aprobarRequest,
  rechazarRequest,
  type AprobarRequest,
  type MetodoPago,
  type RechazarRequest,
  type SolicitudDetalle,
} from "@club-colina/shared";

/**
 * Estado del formulario de aprobación de una solicitud. Los números van como texto mientras
 * Mony escribe; se validan con el esquema del contrato recién al enviar.
 */
export interface FormJugador {
  marcado: boolean;
  /** "" = sin categoría. */
  categoria_id: string;
  numero_camiseta: string;
  beca_mensualidad_pct: string;
  beca_torneos_pct: string;
  beca_campus_pct: string;
  /** "" = no se envía (queda el que tenga). */
  metodo_pago: MetodoPago | "";
}
export interface FormApoderado {
  marcado: boolean;
  metodo_pago: MetodoPago | "";
}
export interface FormAprobacion {
  jugadores: Record<string, FormJugador>;
  apoderados: Record<string, FormApoderado>;
  /** Llave `jugador_id:apoderado_id`. */
  vinculos: Record<string, boolean>;
}

export const llaveVinculo = (v: { jugador_id: string; apoderado_id: string }) =>
  `${v.jugador_id}:${v.apoderado_id}`;

/** Solo lo pendiente se aprueba o rechaza; parte todo marcado con los valores que ya trae. */
export function formInicial(s: SolicitudDetalle): FormAprobacion {
  const jugadores: Record<string, FormJugador> = {};
  for (const j of s.jugadores) {
    if (j.estado !== "pendiente") continue;
    jugadores[j.id] = {
      marcado: true,
      categoria_id: j.categoria_id === null ? "" : String(j.categoria_id),
      numero_camiseta: j.numero_camiseta ?? "",
      beca_mensualidad_pct: String(j.beca_mensualidad_pct),
      beca_torneos_pct: String(j.beca_torneos_pct),
      beca_campus_pct: String(j.beca_campus_pct),
      metodo_pago: j.metodo_pago ?? "",
    };
  }
  const apoderados: Record<string, FormApoderado> = {};
  for (const a of s.apoderados) {
    if (a.estado !== "pendiente") continue;
    apoderados[a.id] = { marcado: true, metodo_pago: a.metodo_pago ?? "" };
  }
  const vinculos: Record<string, boolean> = {};
  for (const v of s.vinculos) {
    if (v.estado === "pendiente") vinculos[llaveVinculo(v)] = true;
  }
  return { jugadores, apoderados, vinculos };
}

/** Texto → entero, o NaN si no es un entero escrito tal cual (así el esquema lo rechaza). */
function entero(texto: string): number {
  const limpio = texto.trim();
  return /^-?[0-9]+$/.test(limpio) ? Number(limpio) : Number.NaN;
}

const NOMBRES_CAMPO: Record<string, string> = {
  numero_camiseta: "número de camiseta",
  categoria_id: "categoría",
  beca_mensualidad_pct: "beca de mensualidad",
  beca_torneos_pct: "beca de torneos",
  beca_campus_pct: "beca de campus",
  metodo_pago: "método de pago",
};

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

/**
 * Arma el cuerpo de `POST .../aprobar` con lo marcado y lo valida con el contrato. Los errores
 * nombran al jugador y el campo, para que Mony sepa qué corregir.
 */
export function armarAprobacion(
  form: FormAprobacion,
  nombres: Record<string, string>,
): Resultado<AprobarRequest> {
  const errores: string[] = [];
  const datos = {
    jugadores: Object.entries(form.jugadores)
      .filter(([, j]) => j.marcado)
      .map(([id, j]) => ({
        id,
        categoria_id: j.categoria_id === "" ? null : entero(j.categoria_id),
        numero_camiseta: j.numero_camiseta.trim(),
        beca_mensualidad_pct: entero(j.beca_mensualidad_pct),
        beca_torneos_pct: entero(j.beca_torneos_pct),
        beca_campus_pct: entero(j.beca_campus_pct),
        ...(j.metodo_pago ? { metodo_pago: j.metodo_pago } : {}),
      })),
    apoderados: Object.entries(form.apoderados)
      .filter(([, a]) => a.marcado)
      .map(([id, a]) => ({ id, ...(a.metodo_pago ? { metodo_pago: a.metodo_pago } : {}) })),
    vinculos: Object.entries(form.vinculos)
      .filter(([, marcado]) => marcado)
      .map(([llave]) => {
        const [jugador_id = "", apoderado_id = ""] = llave.split(":");
        return { jugador_id, apoderado_id };
      }),
  };
  if (!datos.jugadores.length && !datos.apoderados.length && !datos.vinculos.length) {
    return { ok: false, errores: ["No hay nada marcado para aprobar."] };
  }
  const leido = aprobarRequest.safeParse(datos);
  if (!leido.success) {
    for (const issue of leido.error.issues) {
      const [seccion, indice, campo] = issue.path;
      if (seccion === "jugadores" && typeof indice === "number") {
        const id = datos.jugadores[indice]?.id ?? "";
        const campoTexto = typeof campo === "string" ? (NOMBRES_CAMPO[campo] ?? campo) : "datos";
        errores.push(`${nombres[id] ?? "Jugador"}: revisa ${campoTexto}.`);
      } else {
        errores.push("Hay datos inválidos en la aprobación.");
      }
    }
    return { ok: false, errores: [...new Set(errores)] };
  }
  return { ok: true, datos };
}

/** Rechazo de las personas marcadas (jugadores y apoderados pendientes). */
export function armarRechazo(form: FormAprobacion): Resultado<RechazarRequest> {
  const personas = [
    ...Object.entries(form.jugadores)
      .filter(([, j]) => j.marcado)
      .map(([id]) => ({ rol: "jugador" as const, id })),
    ...Object.entries(form.apoderados)
      .filter(([, a]) => a.marcado)
      .map(([id]) => ({ rol: "apoderado" as const, id })),
  ];
  // Nunca se manda sin `personas`: eso rechazaría todo lo pendiente sin que Mony lo eligiera.
  if (!personas.length) return { ok: false, errores: ["No hay personas marcadas para rechazar."] };
  const leido = rechazarRequest.safeParse({ personas });
  if (!leido.success) return { ok: false, errores: ["Hay datos inválidos en el rechazo."] };
  return { ok: true, datos: { personas } };
}
