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
 * La persona se aprueba o rechaza desde esta solicitud (contrato: `propia && estado ===
 * "pendiente"`). Las demás solo se muestran: una propia ya decidida responde 409, y una que no es
 * propia (el titular que ya estaba activo, un hijo de otra solicitud nombrado por RUT, un hijo
 * marcado «ya no está») se decide en otro lado; desde acá, a lo más, su vínculo.
 */
export const seDecideAca = (p: { propia: boolean; estado: string }) =>
  p.propia && p.estado === "pendiente";

/**
 * Foto que subió el segundo apoderado por `/completar`, con un link que le reenvió quien llenó
 * la solicitud: nadie del club la vio. En su propia solicitud (`segundo_apoderado`) es el
 * apoderado de esa solicitud; en la de origen, el apoderado propio que trae otra solicitud.
 */
export function fotoPorLinkReenviado(
  a: { estado: string; propia: boolean; tiene_foto: boolean; solicitud_id: string | null },
  s: SolicitudDetalle,
): boolean {
  if (!seDecideAca(a) || !a.tiene_foto) return false;
  return s.tipo === "segundo_apoderado"
    ? a.solicitud_id === s.id
    : a.solicitud_id !== null && a.solicitud_id !== s.id;
}

/**
 * A quién rechaza «Rechazar todo lo pendiente» (cuerpo sin `personas` ni `vinculos`): las
 * personas que se deciden desde esta solicitud. Los ids, en el orden en que se muestran.
 */
export function alcanceRechazoTotal(s: SolicitudDetalle): string[] {
  return [...s.jugadores, ...s.apoderados].filter(seDecideAca).map((p) => p.id);
}

/**
 * Con quién un vínculo puede quedar activo: el servidor exige ambas puntas activas al final, así
 * que la persona ya lo está o se aprueba en este mismo envío.
 */
const admiteVinculo = (p: { propia: boolean; estado: string }) =>
  p.estado === "activo" || seDecideAca(p);

/**
 * Un vínculo se ofrece para aprobar solo si sus dos personas vienen en la solicitud y cada una
 * está activa o se aprueba desde acá: con una rechazada, inactiva, precargada o pendiente de otra
 * solicitud quedaría activo hacia alguien que no lo está (y el servidor lo rechaza).
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
    admiteVinculo(jugador) &&
    admiteVinculo(apoderado)
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
    return a.estado === "activo" || (seDecideAca(a) && !bloquea(a.faltantes));
  });
}

/**
 * Entra al formulario solo quien se decide desde acá (`seDecideAca`); parte marcado con los valores
 * que ya trae, salvo quien no tiene foto (no se puede aprobar), un hijo marcado «ya no está», un
 * adulto sin contacto posible, y los vínculos que no se pueden aprobar o cuyas personas no parten
 * listas (denegar por defecto).
 */
export function formInicial(
  s: SolicitudDetalle,
  /** Jugadores a los que Mony les quitó la marca «ya no está»: decir que sigue no es aprobarlo. */
  desmarcar: ReadonlySet<string> = new Set(),
): FormAprobacion {
  const jugadores: Record<string, FormJugador> = {};
  for (const j of s.jugadores) {
    if (!seDecideAca(j)) continue;
    jugadores[j.id] = {
      // Un hijo marcado «ya no está» no se activa por inercia: Mony lo marca a mano si corresponde.
      marcado:
        !bloquea(j.faltantes) &&
        j.marcado_retiro_en === null &&
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
    if (!seDecideAca(a)) continue;
    apoderados[a.id] = {
      marcado: !bloquea(a.faltantes),
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
