/**
 * Esquema de la base (Etapa 1). Las migraciones se generan desde acá con `pnpm db:generar`
 * y quedan en backend/migrations/. Una migración aplicada nunca se edita: se agrega otra.
 *
 * Los valores fijos van como text + CHECK (no como enum de Postgres) para que agregar un
 * valor sea una migración que solo agrega.
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  AVISOS_SOLICITUD,
  DISCIPLINAS,
  ESTADOS_ENTRENADOR,
  ESTADOS_PERSONA,
  ESTADOS_SOLICITUD,
  ESTADOS_VINCULO,
  FOTO_MAX_BYTES,
  FOTO_MIMES,
  METODOS_PAGO,
  ORIGENES,
  TIPOS_SOLICITUD,
} from "@club-colina/shared";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** `columna IN ('a', 'b')` con los valores del contrato. */
function enLista(columna: string, valores: readonly string[]) {
  const lista = valores.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
  return sql.raw(`"${columna}" IN (${lista})`);
}

const tiempos = {
  creado_en: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizado_en: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const RUT_CHECK = `"rut" ~ '^[0-9]{7,8}-[0-9K]$'`;
const TELEFONO_CHECK = `"telefono" ~ '^[0-9]{9}$'`;
const EMAIL_CHECK = `"email" = lower("email")`;

/** Fotos de credencial. Van aparte para que las listas no arrastren bytea. */
export const fotos = pgTable(
  "fotos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    creado_en: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check("fotos_mime_check", enLista("mime", FOTO_MIMES)),
    check("fotos_tamano_check", sql.raw(`octet_length("bytes") BETWEEN 1 AND ${FOTO_MAX_BYTES}`)),
  ],
);

export const solicitudesRegistro = pgTable(
  "solicitudes_registro",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creada_en: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    /**
     * sha256 (hex) del link privado (`/familia/:token`, o `/completar/:token` si es de un segundo
     * apoderado). La base nunca guarda el link: se entrega una sola vez y reenviar genera otro.
     */
    token_acceso_hash: text("token_acceso_hash").notNull().unique(),
    /**
     * Solo en una solicitud de segundo apoderado: la solicitud de formulario que lo agregó. Así
     * `/familia` lista a los otros apoderados y el panel muestra de dónde vino el link.
     */
    solicitud_origen_id: uuid("solicitud_origen_id").references(
      (): AnyPgColumn => solicitudesRegistro.id,
      { onDelete: "restrict" },
    ),
    /** Nulo solo en la solicitud de un segundo apoderado mientras no sube su foto. */
    consentimiento_en: timestamp("consentimiento_en", { withTimezone: true }),
    estado: text("estado", { enum: ESTADOS_SOLICITUD }).notNull().default("pendiente"),
    revisada_en: timestamp("revisada_en", { withTimezone: true }),
    tipo: text("tipo", { enum: TIPOS_SOLICITUD }).notNull().default("formulario"),
    coincide_base: boolean("coincide_base").notNull().default(false),
    /**
     * Quién llenó el formulario: el apoderado, o el jugador adulto. Lo escribe S2 al recibir la
     * solicitud; el panel lo muestra como titular y desde ahí busca a los hijos marcados "ya no
     * está". Nulo en una solicitud de segundo apoderado (su apoderado tiene `solicitud_id`).
     * `/familia` lo usa para restringir, nunca para ampliar: el QR de un hijo sale solo si tiene un
     * vínculo activo con este titular y el titular está pendiente o activo. Nulo = sin QR de hijos.
     */
    titular_apoderado_id: uuid("titular_apoderado_id").references((): AnyPgColumn => apoderados.id, {
      onDelete: "restrict",
    }),
    titular_jugador_id: uuid("titular_jugador_id").references((): AnyPgColumn => jugadores.id, {
      onDelete: "restrict",
    }),
    /** Casos que Mony debe mirar antes de aprobar (`AVISOS_SOLICITUD`). */
    avisos: text("avisos", { enum: AVISOS_SOLICITUD })
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [
    check("solicitudes_estado_check", enLista("estado", ESTADOS_SOLICITUD)),
    check("solicitudes_tipo_check", enLista("tipo", TIPOS_SOLICITUD)),
    check(
      "solicitudes_origen_check",
      sql.raw(`("tipo" = 'segundo_apoderado') = ("solicitud_origen_id" IS NOT NULL)`),
    ),
    index("solicitudes_origen_idx").on(t.solicitud_origen_id),
    check("solicitudes_token_hash_check", sql.raw(`"token_acceso_hash" ~ '^[0-9a-f]{64}$'`)),
    check(
      "solicitudes_avisos_check",
      sql.raw(`"avisos" <@ ARRAY[${AVISOS_SOLICITUD.map((v) => `'${v}'`).join(", ")}]::text[]`),
    ),
    check(
      "solicitudes_consentimiento_check",
      sql.raw(`"tipo" = 'segundo_apoderado' OR "consentimiento_en" IS NOT NULL`),
    ),
    index("solicitudes_estado_idx").on(t.estado),
    check(
      "solicitudes_un_titular_check",
      sql.raw(`num_nonnulls("titular_apoderado_id", "titular_jugador_id") <= 1`),
    ),
    check(
      "solicitudes_segundo_sin_titular_check",
      sql.raw(`"tipo" <> 'segundo_apoderado' OR num_nonnulls("titular_apoderado_id", "titular_jugador_id") = 0`),
    ),
  ],
);

export const categorias = pgTable(
  "categorias",
  {
    id: smallint("id").primaryKey().generatedAlwaysAsIdentity(),
    nombre: text("nombre").notNull(),
    disciplina: text("disciplina", { enum: DISCIPLINAS }).notNull(),
    anio_desde: smallint("anio_desde").notNull(),
    anio_hasta: smallint("anio_hasta").notNull(),
    /** false en U11 F: no se calcula por año, la asigna Mony. */
    se_calcula: boolean("se_calcula").notNull().default(true),
  },
  (t) => [
    unique("categorias_disciplina_nombre_key").on(t.disciplina, t.nombre),
    check("categorias_disciplina_check", enLista("disciplina", DISCIPLINAS)),
    check("categorias_anios_check", sql.raw(`"anio_desde" <= "anio_hasta"`)),
  ],
);

export const apoderados = pgTable(
  "apoderados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre"),
    apellido: text("apellido"),
    rut: text("rut").notNull().unique(),
    telefono: text("telefono"),
    email: text("email"),
    metodo_pago: text("metodo_pago", { enum: METODOS_PAGO }),
    foto_id: uuid("foto_id").references(() => fotos.id, { onDelete: "restrict" }),
    credencial_token: text("credencial_token").unique(),
    estado: text("estado", { enum: ESTADOS_PERSONA }).notNull().default("precargado"),
    origen: text("origen", { enum: ORIGENES }).notNull(),
    solicitud_id: uuid("solicitud_id").references(() => solicitudesRegistro.id, {
      onDelete: "restrict",
    }),
    ...tiempos,
  },
  (t) => [
    check("apoderados_rut_check", sql.raw(RUT_CHECK)),
    check("apoderados_telefono_check", sql.raw(TELEFONO_CHECK)),
    check("apoderados_email_check", sql.raw(EMAIL_CHECK)),
    check("apoderados_metodo_pago_check", enLista("metodo_pago", METODOS_PAGO)),
    check("apoderados_estado_check", enLista("estado", ESTADOS_PERSONA)),
    check("apoderados_origen_check", enLista("origen", ORIGENES)),
    check(
      "apoderados_activo_completo_check",
      sql.raw(
        `"estado" <> 'activo' OR ("nombre" IS NOT NULL AND "apellido" IS NOT NULL AND "telefono" IS NOT NULL AND "foto_id" IS NOT NULL AND "credencial_token" IS NOT NULL)`,
      ),
    ),
    // Revocación garantizada por la base: solo una persona activa tiene credencial vigente.
    check("apoderados_token_solo_activo_check", sql.raw(`"estado" = 'activo' OR "credencial_token" IS NULL`)),
    index("apoderados_estado_idx").on(t.estado),
    index("apoderados_solicitud_idx").on(t.solicitud_id),
  ],
);

export const jugadores = pgTable(
  "jugadores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre"),
    apellido: text("apellido"),
    rut: text("rut").notNull().unique(),
    fecha_nacimiento: date("fecha_nacimiento"),
    disciplina: text("disciplina", { enum: DISCIPLINAS }).notNull(),
    categoria_id: smallint("categoria_id").references(() => categorias.id, {
      onDelete: "restrict",
    }),
    /** Texto para distinguir "0" de "00". "99" = sin número asignado. */
    numero_camiseta: text("numero_camiseta"),
    postula_beca: boolean("postula_beca").notNull().default(false),
    beca_mensualidad_pct: smallint("beca_mensualidad_pct").notNull().default(0),
    beca_torneos_pct: smallint("beca_torneos_pct").notNull().default(0),
    beca_campus_pct: smallint("beca_campus_pct").notNull().default(0),
    telefono: text("telefono"),
    email: text("email"),
    metodo_pago: text("metodo_pago", { enum: METODOS_PAGO }),
    /** Casilla "Ya no está en el club" del formulario; Mony lo confirma. */
    marcado_retiro_en: timestamp("marcado_retiro_en", { withTimezone: true }),
    foto_id: uuid("foto_id").references(() => fotos.id, { onDelete: "restrict" }),
    credencial_token: text("credencial_token").unique(),
    estado: text("estado", { enum: ESTADOS_PERSONA }).notNull().default("precargado"),
    origen: text("origen", { enum: ORIGENES }).notNull(),
    solicitud_id: uuid("solicitud_id").references(() => solicitudesRegistro.id, {
      onDelete: "restrict",
    }),
    ...tiempos,
  },
  (t) => [
    check("jugadores_rut_check", sql.raw(RUT_CHECK)),
    check("jugadores_telefono_check", sql.raw(TELEFONO_CHECK)),
    check("jugadores_email_check", sql.raw(EMAIL_CHECK)),
    check("jugadores_disciplina_check", enLista("disciplina", DISCIPLINAS)),
    check("jugadores_numero_check", sql.raw(`"numero_camiseta" ~ '^[0-9]{1,2}$'`)),
    check(
      "jugadores_becas_check",
      sql.raw(
        `"beca_mensualidad_pct" BETWEEN 0 AND 100 AND "beca_torneos_pct" BETWEEN 0 AND 100 AND "beca_campus_pct" BETWEEN 0 AND 100`,
      ),
    ),
    check("jugadores_metodo_pago_check", enLista("metodo_pago", METODOS_PAGO)),
    check("jugadores_estado_check", enLista("estado", ESTADOS_PERSONA)),
    check("jugadores_origen_check", enLista("origen", ORIGENES)),
    check(
      "jugadores_activo_completo_check",
      sql.raw(
        `"estado" <> 'activo' OR ("nombre" IS NOT NULL AND "apellido" IS NOT NULL AND "fecha_nacimiento" IS NOT NULL AND "numero_camiseta" IS NOT NULL AND "foto_id" IS NOT NULL AND "credencial_token" IS NOT NULL)`,
      ),
    ),
    // Revocación garantizada por la base: solo una persona activa tiene credencial vigente.
    check("jugadores_token_solo_activo_check", sql.raw(`"estado" = 'activo' OR "credencial_token" IS NULL`)),
    index("jugadores_estado_idx").on(t.estado),
    index("jugadores_categoria_idx").on(t.categoria_id),
    index("jugadores_solicitud_idx").on(t.solicitud_id),
  ],
);

export const jugadorApoderado = pgTable(
  "jugador_apoderado",
  {
    jugador_id: uuid("jugador_id")
      .notNull()
      .references(() => jugadores.id, { onDelete: "cascade" }),
    apoderado_id: uuid("apoderado_id")
      .notNull()
      .references(() => apoderados.id, { onDelete: "cascade" }),
    paga_mensualidad: boolean("paga_mensualidad").notNull().default(false),
    estado: text("estado", { enum: ESTADOS_VINCULO }).notNull().default("pendiente"),
    /** La solicitud que creó el vínculo (nulo si viene de la base 2026 o del panel). */
    solicitud_id: uuid("solicitud_id").references(() => solicitudesRegistro.id, {
      onDelete: "restrict",
    }),
    creado_en: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.jugador_id, t.apoderado_id] }),
    check("jugador_apoderado_estado_check", enLista("estado", ESTADOS_VINCULO)),
    index("jugador_apoderado_apoderado_idx").on(t.apoderado_id),
  ],
);

export const entrenadores = pgTable(
  "entrenadores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    apellido: text("apellido").notNull(),
    rut: text("rut").notNull().unique(),
    telefono: text("telefono").notNull(),
    disciplina: text("disciplina", { enum: DISCIPLINAS }).notNull(),
    foto_id: uuid("foto_id")
      .notNull()
      .references(() => fotos.id, { onDelete: "restrict" }),
    /** Nulo cuando está inactivo. */
    credencial_token: text("credencial_token").unique(),
    estado: text("estado", { enum: ESTADOS_ENTRENADOR }).notNull().default("activo"),
    ...tiempos,
  },
  () => [
    check("entrenadores_rut_check", sql.raw(RUT_CHECK)),
    check("entrenadores_telefono_check", sql.raw(TELEFONO_CHECK)),
    check("entrenadores_disciplina_check", enLista("disciplina", DISCIPLINAS)),
    check("entrenadores_estado_check", enLista("estado", ESTADOS_ENTRENADOR)),
    check(
      "entrenadores_activo_token_check",
      sql.raw(`"estado" <> 'activo' OR "credencial_token" IS NOT NULL`),
    ),
    check(
      "entrenadores_token_solo_activo_check",
      sql.raw(`"estado" = 'activo' OR "credencial_token" IS NULL`),
    ),
  ],
);

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuario: text("usuario").notNull().unique(),
  nombre: text("nombre").notNull(),
  /** argon2id. */
  password_hash: text("password_hash").notNull(),
  activo: boolean("activo").notNull().default(true),
  ...tiempos,
});

export const sesiones = pgTable(
  "sesiones",
  {
    /** sha256 (hex) del token de la cookie. La base nunca guarda el token. */
    id: text("id").primaryKey(),
    usuario_id: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    creada_en: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
    expira_en: timestamp("expira_en", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("sesiones_usuario_idx").on(t.usuario_id),
    index("sesiones_expira_idx").on(t.expira_en),
  ],
);

/**
 * Cómo estaba la ficha de una persona que ya existía (un precargado de la base 2026) antes de que
 * una solicitud la modificara. La escribe S2 en la misma transacción en que modifica la ficha, y
 * solo si no hay ya una fila para esa persona: se guarda el estado original, antes de la primera
 * solicitud. Si Mony rechaza a esa persona, S1 la deja como estaba con estos datos.
 *
 * `datos` guarda solo lo que el formulario puede cambiar, con los nombres de la base:
 * - jugador: nombre, apellido, fecha_nacimiento, disciplina, categoria_id, numero_camiseta,
 *   telefono, email, metodo_pago, foto_id, estado, solicitud_id, marcado_retiro_en;
 * - apoderado: nombre, apellido, telefono, email, metodo_pago, foto_id, estado, solicitud_id.
 * Nunca el RUT ni `credencial_token`. S1 restaura solo esas llaves.
 *
 * Dos solicitudes sobre la misma persona: mientras exista la copia de una solicitud, S2 no
 * modifica la ficha de esa persona desde otra (así ninguna pisa los cambios de la otra). S1
 * restaura y borra la copia solo al decidir a la persona desde la solicitud de la copia.
 *
 * Es una copia de datos personales: cada fila se borra en la misma transacción en que se decide
 * a esa persona (aprobada: ya no hace falta; rechazada: después de restaurar), y se borra sola
 * si se borra la persona (CASCADE).
 */
export const fichasPrevias = pgTable(
  "fichas_previas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** La solicitud que modificó la ficha y escribió esta copia. */
    solicitud_id: uuid("solicitud_id")
      .notNull()
      .references(() => solicitudesRegistro.id, { onDelete: "restrict" }),
    jugador_id: uuid("jugador_id").references(() => jugadores.id, { onDelete: "cascade" }),
    apoderado_id: uuid("apoderado_id").references(() => apoderados.id, { onDelete: "cascade" }),
    datos: jsonb("datos").notNull(),
    creado_en: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A lo más una copia por persona: la del estado original.
    unique("fichas_previas_jugador_key").on(t.jugador_id),
    unique("fichas_previas_apoderado_key").on(t.apoderado_id),
    check("fichas_previas_una_persona_check", sql.raw(`num_nonnulls("jugador_id", "apoderado_id") = 1`)),
    index("fichas_previas_solicitud_idx").on(t.solicitud_id),
  ],
);
