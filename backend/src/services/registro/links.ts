import { type CompletarResponse, type FamiliaResponse, token as esquemaToken } from "@club-colina/shared";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db, Ejecutor } from "../../db/cliente";
import { apoderados, entrenadores, jugadorApoderado, jugadores, solicitudesRegistro } from "../../db/schema";
import { ErrorApi, noEncontrado } from "../../lib/errores";
import { guardarFoto } from "../../lib/fotos";
import { hashToken } from "../../lib/tokens";
import { nombreCompleto, primerNombre } from "./consulta";

/** Un token con forma inválida es un 404 genérico, igual que uno que no existe. */
export function tokenValido(valor: string): boolean {
  return esquemaToken.safeParse(valor).success;
}

type EstadoPublico = FamiliaResponse["personas"][number]["estado"];

/** El link privado muestra "pendiente" mientras la persona no está aprobada. */
function estadoPublico(estado: string): EstadoPublico {
  if (estado === "activo" || estado === "rechazado" || estado === "inactivo") return estado;
  return "pendiente";
}

async function solicitudPorToken(db: Ejecutor, token: string, tipo: "formulario" | "segundo_apoderado") {
  if (!tokenValido(token)) return null;
  const [s] = await db
    .select()
    .from(solicitudesRegistro)
    .where(and(eq(solicitudesRegistro.token_acceso_hash, hashToken(token)), eq(solicitudesRegistro.tipo, tipo)));
  return s ?? null;
}

const APODERADO_DADO_DE_BAJA = new Set(["inactivo", "rechazado"]);

type Persona = { id: string; nombre: string | null; apellido: string | null; estado: string; credencial_token: string | null };

/**
 * Mientras una persona no está aprobada se muestra solo su primer nombre: si vino de la base,
 * quien llenó el formulario no escribió su apellido y podría no ser quien dice (suplantación).
 */
function nombreVisible(p: Persona): string {
  return p.estado === "activo" ? nombreCompleto(p) : primerNombre(p.nombre);
}

/**
 * GET /familia/:token_acceso — solo las personas que llegaron en esa solicitud: las que tienen ese
 * `solicitud_id` y los hijos cuyo vínculo con el titular creó la solicitud, estos solo cuando Mony
 * lo aprobó. Nunca el resto de la familia de la base, ni un hijo marcado "ya no está". El token se
 * busca solo entre solicitudes de tipo `formulario`.
 *
 * "Titular" = los apoderados de la solicitud (su `solicitud_id`) y los de los vínculos que creó,
 * salvo los otros apoderados nuevos (que tienen su propia solicitud). Un apoderado titular inactivo
 * o rechazado no cuenta. El QR de un jugador se entrega solo si está activo y mantiene un vínculo
 * activo con un titular que cuenta; así, si Mony corta el vínculo o da de baja al apoderado, el
 * link deja de mostrarlo. La excepción es el jugador adulto titular, que no tiene apoderado.
 *
 * Límite conocido: un otro apoderado que ya existía no tiene solicitud propia, y sus vínculos con
 * esta solicitud no se distinguen de los del titular (la solicitud no guarda quién la llenó).
 */
export async function verFamilia(db: Db, token: string): Promise<FamiliaResponse> {
  const s = await solicitudPorToken(db, token, "formulario");
  if (!s) throw noEncontrado();

  const segundas = await db
    .select({ id: solicitudesRegistro.id })
    .from(solicitudesRegistro)
    .where(eq(solicitudesRegistro.solicitud_origen_id, s.id))
    .orderBy(asc(solicitudesRegistro.creada_en), asc(solicitudesRegistro.id));
  const otros =
    segundas.length === 0
      ? []
      : await db
          .select()
          .from(apoderados)
          .where(inArray(apoderados.solicitud_id, segundas.map((x) => x.id)))
          .orderBy(asc(apoderados.creado_en), asc(apoderados.id));
  const idsOtros = new Set(otros.map((o) => o.id));

  const aps = await db
    .select()
    .from(apoderados)
    .where(eq(apoderados.solicitud_id, s.id))
    .orderBy(asc(apoderados.creado_en), asc(apoderados.id));
  const vinculosSolicitud = await db
    .select({ vinculo: jugadorApoderado, estadoApoderado: apoderados.estado })
    .from(jugadorApoderado)
    .innerJoin(apoderados, eq(apoderados.id, jugadorApoderado.apoderado_id))
    .where(eq(jugadorApoderado.solicitud_id, s.id));

  const titulares = new Set<string>();
  for (const a of aps) if (!APODERADO_DADO_DE_BAJA.has(a.estado)) titulares.add(a.id);
  for (const { vinculo, estadoApoderado } of vinculosSolicitud) {
    if (!idsOtros.has(vinculo.apoderado_id) && !APODERADO_DADO_DE_BAJA.has(estadoApoderado)) {
      titulares.add(vinculo.apoderado_id);
    }
  }
  const hayApoderados = aps.length > 0 || vinculosSolicitud.length > 0;

  // Hijos que llegaron por un vínculo de la solicitud con un titular, ya aprobado por Mony.
  const porVinculo = new Set(
    vinculosSolicitud
      .filter(({ vinculo }) => vinculo.estado === "activo" && titulares.has(vinculo.apoderado_id))
      .map(({ vinculo }) => vinculo.jugador_id),
  );
  const jugadoresSolicitud = await db
    .select()
    .from(jugadores)
    .where(
      and(
        isNull(jugadores.marcado_retiro_en),
        porVinculo.size > 0
          ? or(eq(jugadores.solicitud_id, s.id), inArray(jugadores.id, [...porVinculo]))
          : eq(jugadores.solicitud_id, s.id),
      ),
    )
    .orderBy(asc(jugadores.creado_en), asc(jugadores.id));

  // Vínculos activos de esos jugadores con un titular (de esta solicitud o de la base).
  const ids = jugadoresSolicitud.map((j) => j.id);
  const conTitular = new Set(
    ids.length === 0 || titulares.size === 0
      ? []
      : (
          await db
            .select({ jugador_id: jugadorApoderado.jugador_id })
            .from(jugadorApoderado)
            .where(
              and(
                inArray(jugadorApoderado.jugador_id, ids),
                inArray(jugadorApoderado.apoderado_id, [...titulares]),
                eq(jugadorApoderado.estado, "activo"),
              ),
            )
        ).map((f) => f.jugador_id),
  );

  const persona = (p: Persona, rol: "jugador" | "apoderado", qr: boolean) => {
    const estado = estadoPublico(p.estado);
    return {
      nombre_completo: nombreVisible(p),
      rol,
      estado,
      ...(qr && estado === "activo" && p.credencial_token ? { credencial_token: p.credencial_token } : {}),
    };
  };

  return {
    estado_solicitud: s.estado,
    personas: [
      ...aps.map((a) => persona(a, "apoderado", true)),
      ...jugadoresSolicitud.map((j) =>
        persona(j, "jugador", hayApoderados ? conTitular.has(j.id) : j.solicitud_id === s.id),
      ),
    ],
    otros_apoderados: otros.map((o) => ({ nombre_completo: nombreVisible(o), foto_subida: o.foto_id !== null })),
  };
}

/** El segundo apoderado del link `/completar/:token` (solo solicitudes `segundo_apoderado`). */
async function segundoApoderado(db: Ejecutor, token: string) {
  const s = await solicitudPorToken(db, token, "segundo_apoderado");
  if (!s) return null;
  const [a] = await db.select().from(apoderados).where(eq(apoderados.solicitud_id, s.id));
  return a ? { solicitud: s, apoderado: a } : null;
}

/** Si el link `/completar` existe; la ruta lo mira antes de leer el cuerpo. */
export async function existeCompletar(db: Db, token: string): Promise<boolean> {
  return (await segundoApoderado(db, token)) !== null;
}

/**
 * GET /completar/:token — su primer nombre, si ya subió la foto y, cuando Mony lo aprobó, su
 * propio `credencial_token` para ver su QR. Nada de la familia.
 */
export async function verCompletar(db: Db, token: string): Promise<CompletarResponse> {
  const encontrado = await segundoApoderado(db, token);
  if (!encontrado) throw noEncontrado();
  const { apoderado: a } = encontrado;
  return {
    primer_nombre: primerNombre(a.nombre),
    foto_subida: a.foto_id !== null,
    ...(a.estado === "activo" && a.credencial_token ? { credencial_token: a.credencial_token } : {}),
  };
}

/**
 * POST /completar/:token — sube la foto del segundo apoderado y registra su consentimiento. Una sola
 * vez: con la foto ya subida es 409 (si hay que cambiarla, lo hace Mony en el panel). El link solo
 * existe para un otro apoderado nuevo, que se crea pendiente.
 */
export async function subirFotoCompletar(db: Db, token: string, foto: Buffer): Promise<void> {
  await db.transaction(async (tx) => {
    const encontrado = await segundoApoderado(tx, token);
    if (!encontrado) throw noEncontrado();
    const { apoderado: a, solicitud: s } = encontrado;
    if (a.foto_id !== null || a.estado !== "pendiente") {
      throw new ErrorApi(409, "conflicto", "Este link ya no admite cambios.");
    }
    const fotoId = await guardarFoto(tx, foto);
    const ahora = new Date();
    const filas = await tx
      .update(apoderados)
      .set({ foto_id: fotoId })
      .where(and(eq(apoderados.id, a.id), isNull(apoderados.foto_id)))
      .returning({ id: apoderados.id });
    if (filas.length === 0) throw new ErrorApi(409, "conflicto", "Este link ya no admite cambios.");
    await tx
      .update(solicitudesRegistro)
      .set({ consentimiento_en: ahora })
      .where(eq(solicitudesRegistro.id, s.id));
  });
}

type Credencial = { nombre: string | null; apellido: string | null; foto_id: string | null; rol: "jugador" | "apoderado" | "entrenador" };

/**
 * La persona activa dueña de ese `credencial_token`, en cualquiera de las tres tablas. En cada
 * tabla el token es único y solo lo tiene una persona activa (CHECK), así que un revocado no
 * aparece; entre tablas no hay unicidad, pero son 32 bytes aleatorios.
 */
export async function credencialActiva(db: Ejecutor, token: string): Promise<Credencial | null> {
  if (!tokenValido(token)) return null;
  const columnas = (t: typeof jugadores | typeof apoderados | typeof entrenadores) => ({
    nombre: t.nombre,
    apellido: t.apellido,
    foto_id: t.foto_id,
  });
  const [j] = await db
    .select(columnas(jugadores))
    .from(jugadores)
    .where(and(eq(jugadores.credencial_token, token), eq(jugadores.estado, "activo")));
  if (j) return { ...j, rol: "jugador" };
  const [a] = await db
    .select(columnas(apoderados))
    .from(apoderados)
    .where(and(eq(apoderados.credencial_token, token), eq(apoderados.estado, "activo")));
  if (a) return { ...a, rol: "apoderado" };
  const [e] = await db
    .select(columnas(entrenadores))
    .from(entrenadores)
    .where(and(eq(entrenadores.credencial_token, token), eq(entrenadores.estado, "activo")));
  if (e) return { ...e, rol: "entrenador" };
  return null;
}
