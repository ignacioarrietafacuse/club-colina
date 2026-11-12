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
  /**
   * Adulto sin teléfono y sin un apoderado activo (`faltantes` trae «telefono»): su contacto es
   * el apoderado, así que se aprueba junto con él y su vínculo en la misma petición.
   */
  sin_contacto: boolean;
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
 * Parte marcada solo quien es de esta solicitud (`solicitud_id`) o no tiene ninguna. El contrato
 * no dice quién es «propia» para el servidor, así que esto es aproximado: quien tiene otra
 * solicitud (otra familia, o el segundo apoderado que agregó esta) parte desmarcado, y uno sin
 * solicitud que dejó pendiente otra solicitud parte marcado aunque el servidor lo rechace con 409.
 * En ambos casos el error va hacia denegar; el servidor vuelve a validar todo.
 */
export function esDeEstaSolicitud(p: { solicitud_id: string | null }, s: SolicitudDetalle) {
  return p.solicitud_id === s.id || p.solicitud_id === null;
}

/**
 * Foto que subió el segundo apoderado por `/completar`, con un link que le reenvió quien llenó
 * la solicitud: nadie del club la vio. En su propia solicitud (`segundo_apoderado`) es exacto; en
 * la de origen, el apoderado pendiente de otra solicitud que se muestra es ese segundo apoderado.
 */
export function fotoPorLinkReenviado(
  a: { estado: string; tiene_foto: boolean; solicitud_id: string | null },
  s: SolicitudDetalle,
): boolean {
  if (a.estado !== "pendiente" || !a.tiene_foto) return false;
  return s.tipo === "segundo_apoderado"
    ? a.solicitud_id === s.id
    : a.solicitud_id !== null && a.solicitud_id !== s.id;
}

/**
 * Quién nombra la confirmación de «Rechazar todo lo pendiente» (cuerpo sin `personas`). El
 * servidor rechaza a las personas propias pendientes. Con certeza lo son las que tienen
 * `solicitud_id` de esta solicitud; las demás pendientes que se muestran (el segundo apoderado
 * que agregó esta, un precargado que esta dejó pendiente, o alguien de otra solicitud que solo
 * está por un vínculo) pueden serlo o no: el contrato no lo dice, así que van aparte y en
 * condicional, nunca como rechazadas seguro.
 */
export function alcanceRechazoTotal(s: SolicitudDetalle): {
  seguras: string[];
  posibles: string[];
} {
  const pendientes = [...s.jugadores, ...s.apoderados].filter((p) => p.estado === "pendiente");
  return {
    seguras: pendientes.filter((p) => p.solicitud_id === s.id).map((p) => p.id),
    posibles: pendientes.filter((p) => p.solicitud_id !== s.id).map((p) => p.id),
  };
}

/** Estados con los que un vínculo puede quedar activo (el servidor exige ambos activos al final). */
const admiteVinculo = (estado: string) => estado === "activo" || estado === "pendiente";

/**
 * Un vínculo se ofrece para aprobar solo si sus dos personas vienen en la solicitud y están
 * activas o pendientes: con una rechazada, inactiva o precargada quedaría activo hacia alguien
 * que no lo está (y el servidor lo rechaza).
 */
export function vinculoAprobable(
  v: { jugador_id: string; apoderado_id: string },
  s: SolicitudDetalle,
): boolean {
  const jugador = s.jugadores.find((j) => j.id === v.jugador_id);
  const apoderado = s.apoderados.find((a) => a.id === v.apoderado_id);
  return (
    jugador !== undefined &&
    apoderado !== undefined &&
    admiteVinculo(jugador.estado) &&
    admiteVinculo(apoderado.estado)
  );
}

/**
 * Las dos personas del vínculo vienen en esta solicitud. Si no, su estado no se ve acá y el
 * vínculo no se ofrece.
 */
export function vinculoConocido(
  v: { jugador_id: string; apoderado_id: string },
  s: SolicitudDetalle,
): boolean {
  return (
    s.jugadores.some((j) => j.id === v.jugador_id) &&
    s.apoderados.some((a) => a.id === v.apoderado_id)
  );
}

/**
 * Un adulto sin teléfono puede tener contacto desde esta solicitud: hay un vínculo pendiente que
 * se puede aprobar acá hacia un apoderado ya activo, o pendiente de esta solicitud y con foto.
 * Si no, la única salida es agregarle teléfono en su ficha.
 */
export function contactoPosible(jugadorId: string, s: SolicitudDetalle): boolean {
  return s.vinculos.some((v) => {
    if (v.jugador_id !== jugadorId || v.estado !== "pendiente" || !vinculoAprobable(v, s)) {
      return false;
    }
    const a = s.apoderados.find((x) => x.id === v.apoderado_id);
    if (!a) return false;
    return (
      a.estado === "activo" ||
      (a.estado === "pendiente" && esDeEstaSolicitud(a, s) && !bloquea(a.faltantes))
    );
  });
}

/**
 * Solo lo pendiente se aprueba o rechaza; parte marcado con los valores que ya trae, salvo quien
 * no tiene foto (no se puede aprobar), un hijo marcado «ya no está», quien puede no ser de esta
 * solicitud, y los vínculos que no se pueden aprobar o cuyas personas no parten listas
 * (denegar por defecto).
 */
export function formInicial(
  s: SolicitudDetalle,
  /** Jugadores a los que Mony les quitó la marca «ya no está»: decir que sigue no es aprobarlo. */
  desmarcar: ReadonlySet<string> = new Set(),
): FormAprobacion {
  const jugadores: Record<string, FormJugador> = {};
  for (const j of s.jugadores) {
    if (j.estado !== "pendiente") continue;
    jugadores[j.id] = {
      // Un hijo marcado «ya no está» no se activa por inercia: Mony lo marca a mano si corresponde.
      marcado:
        !bloquea(j.faltantes) &&
        j.marcado_retiro_en === null &&
        esDeEstaSolicitud(j, s) &&
        !desmarcar.has(j.id) &&
        // Un adulto sin teléfono que no puede tener contacto desde acá no se puede aprobar.
        (!j.faltantes.includes("telefono") || contactoPosible(j.id, s)),
      categoria_id: j.categoria_id === null ? "" : String(j.categoria_id),
      numero_camiseta: j.numero_camiseta ?? "",
      beca_mensualidad_pct: String(j.beca_mensualidad_pct),
      beca_torneos_pct: String(j.beca_torneos_pct),
      beca_campus_pct: String(j.beca_campus_pct),
      metodo_pago: j.metodo_pago ?? "",
      sin_contacto: j.faltantes.includes("telefono"),
    };
  }
  const apoderados: Record<string, FormApoderado> = {};
  for (const a of s.apoderados) {
    if (a.estado !== "pendiente") continue;
    apoderados[a.id] = {
      marcado: !bloquea(a.faltantes) && esDeEstaSolicitud(a, s),
      metodo_pago: a.metodo_pago ?? "",
    };
  }
  // Cada persona del vínculo tiene que quedar activa: ya lo está, o parte marcada en este envío.
  const lista = (estado: string, enForm: { marcado: boolean } | undefined) =>
    estado === "activo" || enForm?.marcado === true;
  const vinculos: Record<string, boolean> = {};
  for (const v of s.vinculos) {
    if (v.estado !== "pendiente") continue;
    const jugador = s.jugadores.find((j) => j.id === v.jugador_id);
    const apoderado = s.apoderados.find((a) => a.id === v.apoderado_id);
    vinculos[llaveVinculo(v)] =
      vinculoAprobable(v, s) &&
      lista(jugador?.estado ?? "", jugadores[v.jugador_id]) &&
      lista(apoderado?.estado ?? "", apoderados[v.apoderado_id]);
  }
  return { jugadores, apoderados, vinculos };
}

/**
 * Un vínculo solo va si está marcado y ninguna de sus dos personas quedó pendiente sin marcar en
 * este envío: aprobar el vínculo de alguien que no se aprueba lo dejaría a medias.
 */
export function vinculoVa(form: FormAprobacion, llave: string): boolean {
  if (form.vinculos[llave] !== true) return false;
  const [jugadorId = "", apoderadoId = ""] = llave.split(":");
  const jugador = form.jugadores[jugadorId];
  const apoderado = form.apoderados[apoderadoId];
  return (!jugador || jugador.marcado) && (!apoderado || apoderado.marcado);
}

/**
 * Lo que decide qué se puede aprobar: estados, retiro, faltantes y avisos de personas, vínculos
 * y la solicitud. Si cambia, el formulario armado ya no sirve.
 */
export function firmaSolicitud(s: SolicitudDetalle): string {
  const lista = (x: readonly string[]) => [...x].sort().join(",");
  return [
    `s:${s.estado}:${lista(s.avisos)}`,
    ...s.jugadores.map(
      (j) => `j:${j.id}:${j.estado}:${j.marcado_retiro_en ?? ""}:${lista(j.faltantes)}`,
    ),
    ...s.apoderados.map((a) => `a:${a.id}:${a.estado}:${lista(a.faltantes)}`),
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
  // Un adulto sin teléfono necesita un vínculo que quede activo en esta misma petición (con su
  // apoderado ya activo o aprobado acá): si no, el servidor rechaza todo el envío.
  for (const j of datos.jugadores) {
    if (!form.jugadores[j.id]?.sin_contacto) continue;
    if (!datos.vinculos.some((v) => v.jugador_id === j.id)) {
      errores.push(
        `${nombres[j.id] ?? "Jugador"}: no tiene teléfono. Márcalo junto con su apoderado y el vínculo entre ellos.`,
      );
    }
  }
  const leido = aprobarRequest.safeParse(datos);
  if (!leido.success || errores.length > 0) {
    for (const issue of leido.error?.issues ?? []) {
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
 * un cuerpo sin `personas` ni `vinculos`. La pantalla lo ofrece aparte y con confirmación.
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
  // Nunca se manda vacío: sin `personas` ni `vinculos` se rechazaría todo lo pendiente.
  if (!personas.length) return { ok: false, errores: ["No hay personas marcadas para rechazar."] };
  const leido = rechazarRequest.safeParse({ personas });
  if (!leido.success) return { ok: false, errores: ["Hay datos inválidos en el rechazo."] };
  return { ok: true, datos: { personas } };
}

/**
 * Rechazo de un solo vínculo pendiente: se borra y sus personas siguen pendientes (salvo un
 * precargado que era de la solicitud solo por ese vínculo, que vuelve a como estaba).
 */
export function armarRechazoVinculo(llave: string): Resultado<RechazarRequest> {
  const [jugador_id = "", apoderado_id = ""] = llave.split(":");
  const datos = { vinculos: [{ jugador_id, apoderado_id }] };
  const leido = rechazarRequest.safeParse(datos);
  if (!leido.success) return { ok: false, errores: ["Hay datos inválidos en el rechazo."] };
  return { ok: true, datos };
}
