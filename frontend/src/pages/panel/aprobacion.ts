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

/** Una persona sin foto no se puede aprobar (diseño: sin foto no se activa la credencial). */
const bloquea = (faltantes: readonly string[]) => faltantes.includes("foto");

/**
 * Un vínculo con una persona de esta solicitud rechazada o inactiva no se ofrece para aprobar:
 * quedaría activo hacia alguien que no lo está.
 */
export function vinculoAprobable(
  v: { jugador_id: string; apoderado_id: string },
  s: SolicitudDetalle,
): boolean {
  const caida = (estado: string) => estado === "rechazado" || estado === "inactivo";
  const jugador = s.jugadores.find((j) => j.id === v.jugador_id);
  const apoderado = s.apoderados.find((a) => a.id === v.apoderado_id);
  return !(jugador && caida(jugador.estado)) && !(apoderado && caida(apoderado.estado));
}

/**
 * Solo lo pendiente se aprueba o rechaza; parte marcado con los valores que ya trae, salvo quien
 * no tiene foto (no se puede aprobar) y los vínculos con una persona rechazada.
 */
export function formInicial(s: SolicitudDetalle): FormAprobacion {
  const jugadores: Record<string, FormJugador> = {};
  for (const j of s.jugadores) {
    if (j.estado !== "pendiente") continue;
    jugadores[j.id] = {
      // Un hijo marcado «ya no está» no se activa por inercia: Mony lo marca a mano si corresponde.
      marcado: !bloquea(j.faltantes) && j.marcado_retiro_en === null,
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
    apoderados[a.id] = { marcado: !bloquea(a.faltantes), metodo_pago: a.metodo_pago ?? "" };
  }
  const vinculos: Record<string, boolean> = {};
  for (const v of s.vinculos) {
    if (v.estado === "pendiente") vinculos[llaveVinculo(v)] = vinculoAprobable(v, s);
  }
  return { jugadores, apoderados, vinculos };
}

/**
 * Un vínculo solo va si está marcado y ninguna de sus dos personas quedó pendiente sin marcar en
 * este envío: aprobar el vínculo de alguien que no se aprueba lo dejaría a medias.
 */
export function vinculoVa(form: FormAprobacion, llave: string): boolean {
  if (!form.vinculos[llave]) return false;
  const [jugadorId = "", apoderadoId = ""] = llave.split(":");
  const jugador = form.jugadores[jugadorId];
  const apoderado = form.apoderados[apoderadoId];
  return (!jugador || jugador.marcado) && (!apoderado || apoderado.marcado);
}

/** Estados de las personas y vínculos: si cambian, el formulario armado ya no sirve. */
export function firmaSolicitud(s: SolicitudDetalle): string {
  return [
    s.estado,
    ...s.jugadores.map((j) => `j:${j.id}:${j.estado}`),
    ...s.apoderados.map((a) => `a:${a.id}:${a.estado}`),
    ...s.vinculos.map((v) => `v:${llaveVinculo(v)}:${v.estado}`),
  ]
    .sort()
    .join("|");
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
    vinculos: Object.keys(form.vinculos)
      .filter((llave) => vinculoVa(form, llave))
      .map((llave) => {
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

/** Personas marcadas para el rechazo. */
export function contarMarcadas(form: FormAprobacion): number {
  return (
    Object.values(form.jugadores).filter((j) => j.marcado).length +
    Object.values(form.apoderados).filter((a) => a.marcado).length
  );
}

/**
 * Rechazo de todo lo pendiente de la solicitud (personas y vínculos): el contrato lo hace con
 * un cuerpo sin `personas`. Es la única forma de rechazar un vínculo, así que la pantalla lo
 * ofrece aparte y con confirmación.
 */
export const RECHAZO_TOTAL: RechazarRequest = {};

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
