/**
 * Contrato de la API de Club Colina (Etapa 1).
 *
 * Frontend y backend importan de acá los esquemas y los tipos de cada endpoint.
 * Cambiar este archivo es cambiar el contrato: lo hace una sola sesión a la vez
 * (ver CLAUDE.md). Los cambios son compatibles hacia atrás: agregar antes que quitar.
 */
import { z } from "zod";
import { normalizarRut, RUT_NORMALIZADO } from "./rut";

// ---------------------------------------------------------------------------
// Valores fijos
// ---------------------------------------------------------------------------

export const DISCIPLINAS = ["basketball", "voleibol"] as const;
export const ROLES = ["jugador", "apoderado", "entrenador"] as const;
export const ESTADOS_PERSONA = [
  "precargado",
  "pendiente",
  "activo",
  "rechazado",
  "inactivo",
] as const;
export const ESTADOS_ENTRENADOR = ["activo", "inactivo"] as const;
export const ORIGENES = ["base_2026", "formulario"] as const;
export const METODOS_PAGO = [
  "forpay_mensual",
  "transferencia_anual",
  "tarjeta_credito_anual",
] as const;
export const ESTADOS_VINCULO = ["pendiente", "activo"] as const;
export const ESTADOS_SOLICITUD = ["pendiente", "revisada"] as const;
export const TIPOS_SOLICITUD = ["formulario", "segundo_apoderado"] as const;
/**
 * Casos que el panel marca para que Mony los mire antes de aprobar (posible suplantación).
 * Los calcula el backend al recibir la solicitud y quedan guardados en ella.
 */
export const AVISOS_SOLICITUD = [
  /** El RUT de quien llena ya había enviado el formulario antes. */
  "titular_ya_registrado",
  /** El teléfono ingresado no coincide con el que está en la base. */
  "telefono_distinto_base",
  /** Un hijo agregado por RUT ya tiene otro apoderado vinculado. */
  "hijo_con_otro_apoderado",
  /** Se agrega un apoderado nuevo a un hijo que ya estaba registrado. */
  "apoderado_nuevo_para_hijo_registrado",
  /** Se marcó un hijo como "ya no está en el club". */
  "hijo_marcado_ya_no_esta",
  /** El otro apoderado que se agrega ya existía en la base. */
  "otro_apoderado_ya_registrado",
  /** El RUT estaba precargado sin teléfono: no hubo con qué comparar. */
  "sin_telefono_en_base",
  /**
   * Llegó después otra solicitud que involucra a las mismas personas. S2 lo agrega a las
   * solicitudes pendientes anteriores, para que la primera (quizás la falsa) no quede limpia.
   */
  "hay_solicitud_posterior",
  /**
   * Un hijo precargado sin apoderado en la base, nombrado por RUT, se completó con los datos de
   * esta solicitud (solo lo que faltaba). Mony confirma que la familia es la suya.
   */
  "hijo_precargado_completado_por_rut",
  /**
   * Otra solicitud pendiente ya había modificado a una persona de esta (tiene su ficha previa):
   * esta no modificó su ficha (no la completó); a lo más la vinculó o la marcó "ya no está". La
   * otra recibe `hay_solicitud_posterior`.
   */
  "cambios_bloqueados_por_otra_solicitud",
] as const;
/** Segmento de URL de `/api/panel/:tipo/:id/...`. */
export const TIPOS_PERSONA = ["jugadores", "apoderados", "entrenadores"] as const;

/** "99" = sin número asignado. Queda fuera de la validación de números repetidos (Etapa 2). */
export const NUMERO_SIN_ASIGNAR = "99";

export const FOTO_MAX_BYTES = 2 * 1024 * 1024;
export const FOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const FOTOS_MAX_POR_SOLICITUD = 10;
export const HIJOS_MAX_POR_SOLICITUD = 8;

// ---------------------------------------------------------------------------
// Tipos base
// ---------------------------------------------------------------------------

export const disciplina = z.enum(DISCIPLINAS);
export const rol = z.enum(ROLES);
export const estadoPersona = z.enum(ESTADOS_PERSONA);
export const estadoEntrenador = z.enum(ESTADOS_ENTRENADOR);
export const origen = z.enum(ORIGENES);
export const metodoPago = z.enum(METODOS_PAGO);
export const estadoVinculo = z.enum(ESTADOS_VINCULO);
export const estadoSolicitud = z.enum(ESTADOS_SOLICITUD);
export const tipoSolicitud = z.enum(TIPOS_SOLICITUD);
export const avisoSolicitud = z.enum(AVISOS_SOLICITUD);
export const tipoPersona = z.enum(TIPOS_PERSONA);

export const id = z.uuid();
export const categoriaId = z.int().positive();

/** RUT de entrada: acepta cualquier forma de escribirlo y lo deja como `12345678-9`. */
export const rutEntrada = z.string().transform((valor, ctx) => {
  const rut = normalizarRut(valor);
  if (rut === null) {
    ctx.addIssue({ code: "custom", message: "RUT inválido" });
    return z.NEVER;
  }
  return rut;
});
/** RUT ya normalizado (respuestas del panel). */
export const rut = z.string().regex(RUT_NORMALIZADO);

/** Teléfono de entrada: acepta +56, espacios y guiones; lo deja en 9 dígitos. */
export const telefonoEntrada = z.string().transform((valor, ctx) => {
  let digitos = valor.replace(/\D/g, "");
  if (digitos.length === 11 && digitos.startsWith("56")) digitos = digitos.slice(2);
  if (!/^[0-9]{9}$/.test(digitos)) {
    ctx.addIssue({ code: "custom", message: "Teléfono inválido: deben ser 9 dígitos" });
    return z.NEVER;
  }
  return digitos;
});
export const telefono = z.string().regex(/^[0-9]{9}$/);

/** Texto para que "00" y "0" sean números distintos (básquetbol). */
export const numeroCamiseta = z.string().regex(/^[0-9]{1,2}$/);
export const porcentajeBeca = z.int().min(0).max(100);
export const nombrePropio = z.string().trim().min(1).max(80);
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(200));
/** Fecha `AAAA-MM-DD`. */
export const fecha = z.iso.date();
/** Fecha y hora ISO 8601 con zona. */
export const fechaHora = z.iso.datetime({ offset: true });
/** Token aleatorio de 32 bytes en base64url (43 caracteres). */
export const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** Clave de una foto dentro de un multipart: el archivo va en el campo `foto_<clave>`. */
export const claveFoto = z.string().regex(/^[a-z0-9_]{1,32}$/);

export const errorRespuesta = z.object({
  error: z.object({ codigo: z.string(), mensaje: z.string() }),
});
export type ErrorRespuesta = z.infer<typeof errorRespuesta>;

/** Códigos de error que usa la API. Lo público no encontrado es siempre `no_encontrado`. */
export const CODIGOS_ERROR = [
  "validacion",
  "no_encontrado",
  "no_autenticado",
  "credenciales_invalidas",
  "origen_no_permitido",
  "demasiados_intentos",
  "requisitos_incompletos",
  "conflicto",
  "archivo_invalido",
  "debe_cambiar_clave",
  "no_disponible",
  "error_interno",
] as const;
export type CodigoError = (typeof CODIGOS_ERROR)[number];

/** GET /api/health — 503 con estado "error" si la base no responde. */
export const healthResponse = z.object({ estado: z.enum(["ok", "error"]) });

// ---------------------------------------------------------------------------
// Público (sin login)
// ---------------------------------------------------------------------------

export const faltanteApoderado = z.enum(["nombre", "apellido", "telefono", "foto"]);
export const faltanteJugador = z.enum([
  "nombre",
  "apellido",
  "fecha_nacimiento",
  "numero_camiseta",
  "telefono",
  "foto",
]);

/** POST /api/public/rut-lookup */
export const rutLookupRequest = z.object({ rut: rutEntrada });
export const rutLookupResponse = z.union([
  z.object({ encontrado: z.literal(false) }),
  z.object({
    encontrado: z.literal(true),
    tipo: z.literal("apoderado"),
    /** Ya envió el formulario: solo puede agregar hijos nuevos y otro apoderado. */
    ya_registrado: z.boolean(),
    faltantes: z.array(faltanteApoderado),
    /**
     * Hijos precargados, en el orden en que el servidor los lista para ese RUT. Nunca se
     * devuelven ids: la solicitud los nombra por su posición (`ref.precargado`) y el servidor
     * vuelve a calcular la lista desde el RUT al recibirla.
     */
    hijos: z.array(
      z.object({
        posicion: z.int().min(0),
        primer_nombre: z.string(),
        ya_registrado: z.boolean(),
        faltantes: z.array(faltanteJugador),
      }),
    ),
  }),
  z.object({
    encontrado: z.literal(true),
    tipo: z.literal("jugador"),
    primer_nombre: z.string(),
    adulto: z.boolean(),
    ya_registrado: z.boolean(),
    faltantes: z.array(faltanteJugador),
  }),
]);

/**
 * Un hijo dentro de la solicitud. `precargado` es la `posicion` que devolvió `rut-lookup` para
 * el RUT de quien llena, junto con el `primer_nombre` que se mostró. El servidor recalcula la
 * lista desde ese RUT y responde 409 `conflicto` si la posición no existe o el nombre ya no
 * coincide (la lista cambió entre la consulta y el envío). Un hijo nuevo, o de otra familia,
 * se nombra por su RUT.
 */
export const hijoSolicitud = z.object({
  ref: z.union([
    z.object({ precargado: z.int().min(0), primer_nombre: z.string().min(1) }),
    z.object({ rut: rutEntrada }),
  ]),
  /** Casilla "Ya no está en el club": solo una señal para Mony, que confirma con la familia y lo da de baja en la ficha. No lo saca de /familia ni toca su credencial. */
  ya_no_esta: z.literal(true).optional(),
  nombre: nombrePropio.optional(),
  apellido: nombrePropio.optional(),
  fecha_nacimiento: fecha.optional(),
  disciplina: disciplina.optional(),
  numero_camiseta: numeroCamiseta.optional(),
  foto: claveFoto.optional(),
});

/**
 * Campo `datos` (JSON) de POST /api/public/solicitudes. Las fotos van como archivos
 * `foto_<clave>` en el mismo multipart. El servidor vuelve a calcular qué falta y exige solo eso.
 * Si el apoderado ya está registrado, se ignoran sus datos propios: solo se procesan
 * `hijos` y `otro_apoderado`.
 */
export const solicitudDatos = z
  .object({
    rut: rutEntrada,
    tipo: z.enum(["apoderado", "jugador_adulto"]),
    consentimiento: z.literal(true),
    nombre: nombrePropio.optional(),
    apellido: nombrePropio.optional(),
    telefono: telefonoEntrada.optional(),
    foto: claveFoto.optional(),
    /** Apoderado: "soy quien paga la mensualidad" (aplica a los hijos de esta solicitud). */
    paga_mensualidad: z.boolean().optional(),
    /** Jugador adulto. */
    fecha_nacimiento: fecha.optional(),
    disciplina: disciplina.optional(),
    numero_camiseta: numeroCamiseta.optional(),
    hijos: z.array(hijoSolicitud).max(HIJOS_MAX_POR_SOLICITUD).default([]),
    otro_apoderado: z
      .object({
        nombre: nombrePropio,
        apellido: nombrePropio,
        rut: rutEntrada,
        telefono: telefonoEntrada,
        /** Índices dentro de `hijos`. */
        hijos: z.array(z.int().min(0)).min(1),
      })
      .optional(),
  })
  .superRefine((d, ctx) => {
    const posiciones = new Set<number>();
    const ruts = new Set<string>([d.rut]);
    d.hijos.forEach((h, i) => {
      const repetido =
        "precargado" in h.ref
          ? posiciones.size === posiciones.add(h.ref.precargado).size
          : ruts.size === ruts.add(h.ref.rut).size;
      if (repetido) ctx.addIssue({ code: "custom", path: ["hijos", i, "ref"], message: "Hijo repetido" });
    });
    if (d.otro_apoderado) {
      if (ruts.has(d.otro_apoderado.rut)) {
        ctx.addIssue({ code: "custom", path: ["otro_apoderado", "rut"], message: "RUT repetido" });
      }
      const indices = d.otro_apoderado.hijos;
      if (new Set(indices).size !== indices.length || indices.some((i) => i >= d.hijos.length)) {
        ctx.addIssue({ code: "custom", path: ["otro_apoderado", "hijos"], message: "Índice inválido" });
      }
    }
  });
/**
 * La base guarda solo el hash de `token_acceso` y de cada `completar_token`: esta respuesta es la
 * única vez que se entregan. Si se pierden, Mony genera un link nuevo desde el panel.
 */
export const solicitudCreadaResponse = z.object({
  token_acceso: token,
  /** Links personales para que el primer apoderado se los reenvíe a los otros. */
  otros_apoderados: z.array(z.object({ nombre_completo: z.string(), completar_token: token })),
});

/**
 * GET /api/public/familia/:token_acceso — solo las personas que llegaron en esa solicitud: las
 * que tienen ese `solicitud_id` y los hijos cuyo vínculo creó esa solicitud
 * (`jugador_apoderado.solicitud_id`), estos últimos solo cuando Mony aprobó el vínculo. Nunca el
 * resto de la familia que esté en la base. Un hijo marcado "ya no está" sigue apareciendo (la
 * marca es solo una señal para Mony).
 */
export const familiaResponse = z.object({
  estado_solicitud: estadoSolicitud,
  personas: z.array(
    z.object({
      nombre_completo: z.string(),
      rol: z.enum(["jugador", "apoderado"]),
      estado: z.enum(["pendiente", "activo", "rechazado", "inactivo"]),
      /** Solo si está activa: con esto se arma el QR. */
      credencial_token: token.optional(),
    }),
  ),
  /** Otros apoderados de la solicitud y si ya subieron su foto (sin su link: ver `solicitudCreadaResponse`). */
  otros_apoderados: z.array(z.object({ nombre_completo: z.string(), foto_subida: z.boolean() })),
});

/**
 * GET /api/public/completar/:token — `credencial_token` solo cuando Mony ya aprobó a ese
 * apoderado (activo): con eso ve su propio QR. Nunca nada del resto de la familia.
 */
export const completarResponse = z.object({
  primer_nombre: z.string(),
  foto_subida: z.boolean(),
  credencial_token: token.optional(),
});
/** POST /api/public/completar/:token — multipart: archivo `foto` + campo `consentimiento=true`. Responde 204. */
export const completarCampos = z.object({ consentimiento: z.literal("true") });

/** GET /api/public/credencial/:credencial_token — 404 genérico si no está activa. */
export const credencialResponse = z.object({ nombre_completo: z.string(), rol });

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * `debe_cambiar_clave`: el usuario entró con una clave temporal; el panel solo le muestra la
 * pantalla de cambiar clave, y /api/panel responde 403 `debe_cambiar_clave` hasta que la cambie.
 */
// Con default: un backend anterior a la columna (despliegue a medias o vuelta atrás) no la manda,
// y tampoco aplica el 403, así que leerla como false no abre nada.
export const usuario = z.object({ id, nombre: z.string(), debe_cambiar_clave: z.boolean().default(false) });
/** POST /api/auth/login — deja la cookie `__Host-sesion`. */
export const loginRequest = z.object({
  usuario: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});
export const loginResponse = z.object({ usuario });
/** GET /api/auth/me */
export const meResponse = z.object({ usuario });

/** Largo mínimo de una clave del panel (el mismo que exige el script `crear-usuario`). */
export const CLAVE_MIN = 12;
/**
 * POST /api/auth/cambiar-clave — con sesión. La nueva tiene al menos `CLAVE_MIN` caracteres y es
 * distinta de la actual. Si la actual no coincide: 400 `credenciales_invalidas`. Al cambiarla se
 * cierran todas las sesiones del usuario, se abre una nueva para quien la cambió (cookie nueva: la
 * anterior deja de servir, por si alguien la había copiado) y se apaga `debe_cambiar_clave`.
 * Responde 204. Con límite de intentos por sesión (5 cada 15 minutos; ver `LIMITES.cambiarClave`).
 */
export const cambiarClaveRequest = z
  .object({
    clave_actual: z.string().min(1).max(200),
    clave_nueva: z.string().min(CLAVE_MIN).max(200),
  })
  .refine((d) => d.clave_nueva !== d.clave_actual, { path: ["clave_nueva"], message: "Debe ser distinta de la actual" });
/**
 * Prefijo `__Host-`: el navegador la acepta solo con `Secure`, `Path=/` y sin `Domain`, así que
 * nadie puede pisarla desde un subdominio ni desde http.
 */
export const COOKIE_SESION = "__Host-sesion";

// ---------------------------------------------------------------------------
// Panel (con sesión)
// ---------------------------------------------------------------------------

/** GET /api/panel/dashboard */
export const dashboardResponse = z.object({
  jugadores_activos: z.int().min(0),
  apoderados_activos: z.int().min(0),
  entrenadores_activos: z.int().min(0),
  solicitudes_pendientes: z.int().min(0),
  /** Jugadores marcados "ya no está en el club" que Mony no ha resuelto (ni inactivo ni sin marca). */
  // Con valor por defecto: un frontend nuevo con un backend anterior (despliegue a medias o vuelta
  // atrás) no deja el dashboard entero en error.
  jugadores_marcados_ya_no_esta: z.int().min(0).default(0),
  precargados_sin_registrar: z.object({
    jugadores: z.int().min(0),
    apoderados: z.int().min(0),
  }),
  /**
   * Jugadores activos por categoría, calculada hoy: todas las categorías en el orden de
   * `GET /api/panel/categorias` (también con 0) y al final `categoria_id: null` (sin categoría).
   */
  // Con valor por defecto, igual que arriba: un frontend nuevo con un backend anterior.
  jugadores_por_categoria: z
    .array(z.object({ categoria_id: categoriaId.nullable(), jugadores: z.int().min(0) }))
    .default([]),
});

const becas = {
  beca_mensualidad_pct: porcentajeBeca,
  beca_torneos_pct: porcentajeBeca,
  beca_campus_pct: porcentajeBeca,
};

export const vinculoDeJugador = z.object({
  id,
  nombre_completo: z.string(),
  paga_mensualidad: z.boolean(),
  estado_vinculo: estadoVinculo,
});

export const jugadorResumen = z.object({
  id,
  nombre: z.string().nullable(),
  apellido: z.string().nullable(),
  rut,
  disciplina,
  /** Calculada por edad de temporada al responder (o U11 F marcada esta temporada); no se guarda. */
  categoria_id: categoriaId.nullable(),
  numero_camiseta: numeroCamiseta.nullable(),
  estado: estadoPersona,
  origen,
  tiene_foto: z.boolean(),
  faltan_datos: z.boolean(),
  marcado_retiro_en: fechaHora.nullable(),
});

export const jugadorDetalle = jugadorResumen.extend({
  /** Mony la marcó U11 F en la temporada actual (solo básquet). */
  u11f: z.boolean(),
  fecha_nacimiento: fecha.nullable(),
  /** Calculada; no se guarda. */
  edad: z.int().min(0).nullable(),
  postula_beca: z.boolean(),
  ...becas,
  telefono: telefono.nullable(),
  email: z.string().nullable(),
  metodo_pago: metodoPago.nullable(),
  credencial_token: token.nullable(),
  solicitud_id: id.nullable(),
  faltantes: z.array(faltanteJugador),
  apoderados: z.array(vinculoDeJugador),
  creado_en: fechaHora,
  actualizado_en: fechaHora,
});

export const apoderadoResumen = z.object({
  id,
  nombre: z.string().nullable(),
  apellido: z.string().nullable(),
  rut,
  telefono: telefono.nullable(),
  estado: estadoPersona,
  origen,
  tiene_foto: z.boolean(),
  faltan_datos: z.boolean(),
});

export const apoderadoDetalle = apoderadoResumen.extend({
  email: z.string().nullable(),
  metodo_pago: metodoPago.nullable(),
  credencial_token: token.nullable(),
  solicitud_id: id.nullable(),
  faltantes: z.array(faltanteApoderado),
  jugadores: z.array(vinculoDeJugador),
  creado_en: fechaHora,
  actualizado_en: fechaHora,
});

export const entrenadorDetalle = z.object({
  id,
  nombre: z.string(),
  apellido: z.string(),
  rut,
  telefono,
  disciplina,
  tiene_foto: z.boolean(),
  credencial_token: token.nullable(),
  estado: estadoEntrenador,
  creado_en: fechaHora,
  actualizado_en: fechaHora,
});

const booleanoQuery = z.enum(["true", "false"]).transform((v) => v === "true");

/** GET /api/panel/jugadores */
export const jugadoresQuery = z.object({
  estado: estadoPersona.optional(),
  disciplina: disciplina.optional(),
  /** Por la categoría calculada hoy. */
  categoria_id: z.coerce.number().pipe(categoriaId).optional(),
  /** Sin categoría: sin fecha válida, o su edad no calza con ninguna categoría de su rama. */
  sin_categoria: booleanoQuery.optional(),
  faltan_datos: booleanoQuery.optional(),
  /** Número "99". */
  sin_numero: booleanoQuery.optional(),
  /** Marcados "ya no está en el club" sin resolver: los mismos que cuenta el dashboard. */
  marcado_ya_no_esta: booleanoQuery.optional(),
  q: z.string().trim().max(100).optional(),
});
export const jugadoresResponse = z.array(jugadorResumen);

/** PATCH /api/panel/jugadores/:id */
export const jugadorPatch = z
  .object({
    nombre: nombrePropio,
    apellido: nombrePropio,
    rut: rutEntrada,
    fecha_nacimiento: fecha.nullable(),
    disciplina,
    /** Marca U11 F para la temporada actual (solo básquet; pasar a vóley la quita). */
    u11f: z.boolean(),
    numero_camiseta: numeroCamiseta.nullable(),
    postula_beca: z.boolean(),
    ...becas,
    telefono: telefonoEntrada.nullable(),
    email: email.nullable(),
    metodo_pago: metodoPago.nullable(),
  })
  .partial();

/** GET /api/panel/apoderados */
export const apoderadosQuery = z.object({
  estado: estadoPersona.optional(),
  faltan_datos: booleanoQuery.optional(),
  q: z.string().trim().max(100).optional(),
});
export const apoderadosResponse = z.array(apoderadoResumen);

/** PATCH /api/panel/apoderados/:id */
export const apoderadoPatch = z
  .object({
    nombre: nombrePropio,
    apellido: nombrePropio,
    rut: rutEntrada,
    telefono: telefonoEntrada.nullable(),
    email: email.nullable(),
    metodo_pago: metodoPago.nullable(),
  })
  .partial();

/** GET /api/panel/entrenadores */
export const entrenadoresResponse = z.array(entrenadorDetalle);
/** POST /api/panel/entrenadores — multipart: campo `datos` (JSON) + archivo `foto` obligatorio. */
export const entrenadorCrear = z.object({
  nombre: nombrePropio,
  apellido: nombrePropio,
  rut: rutEntrada,
  telefono: telefonoEntrada,
  disciplina,
});
/** PATCH /api/panel/entrenadores/:id */
export const entrenadorPatch = entrenadorCrear.partial();

/** GET /api/panel/solicitudes */
export const solicitudesQuery = z.object({ estado: estadoSolicitud.optional() });
export const solicitudResumen = z.object({
  id,
  creada_en: fechaHora,
  estado: estadoSolicitud,
  tipo: tipoSolicitud,
  coincide_base: z.boolean(),
  avisos: z.array(avisoSolicitud),
  titular: z.object({ nombre_completo: z.string(), rol: z.enum(["jugador", "apoderado"]) }),
  personas_pendientes: z.int().min(0),
});
export const solicitudesResponse = z.array(solicitudResumen);

/** GET /api/panel/solicitudes/:id */
export const solicitudDetalle = z.object({
  id,
  creada_en: fechaHora,
  estado: estadoSolicitud,
  tipo: tipoSolicitud,
  consentimiento_en: fechaHora.nullable(),
  revisada_en: fechaHora.nullable(),
  coincide_base: z.boolean(),
  avisos: z.array(avisoSolicitud),
  /**
   * `propia`: true si la persona se aprueba o rechaza desde esta solicitud. Las demás (el titular
   * que ya estaba activo, un hijo de otra solicitud nombrado por RUT, un hijo marcado "ya no
   * está") solo se muestran; desde aquí se decide, a lo más, su vínculo. Se aprueba o rechaza
   * con `propia && estado === "pendiente"`: una propia ya decidida sigue `propia` pero responde 409.
   *
   * `en_link_familia`: si el jugador aparece en el link /familia de esta solicitud (solo las
   * personas que entraron por ella; siempre false en una de segundo apoderado). El panel lo usa
   * para recordarle a Mony que entregue el QR desde la ficha a quien no aparece. Aparecer no
   * garantiza el QR: el link lo da solo con un vínculo activo con un titular vigente.
   */
  // Con default: un backend anterior al campo (despliegue a medias) no lo manda; true solo omite el
  // recordatorio, no muestra nada de más.
  jugadores: z.array(jugadorDetalle.extend({ propia: z.boolean(), en_link_familia: z.boolean().default(true) })),
  apoderados: z.array(apoderadoDetalle.extend({ propia: z.boolean() })),
  vinculos: z.array(
    z.object({
      jugador_id: id,
      apoderado_id: id,
      paga_mensualidad: z.boolean(),
      estado: estadoVinculo,
    }),
  ),
});

/**
 * POST /api/panel/solicitudes/:id/aprobar — aprobación parcial: lo que no se envía queda pendiente.
 * Responde el detalle actualizado; 422 `requisitos_incompletos` si falta foto, número, etc.
 */
export const aprobarRequest = z.object({
  jugadores: z
    .array(
      z.object({
        id,
        numero_camiseta: numeroCamiseta,
        ...becas,
        metodo_pago: metodoPago.optional(),
      }),
    )
    .max(50)
    .default([]),
  apoderados: z.array(z.object({ id, metodo_pago: metodoPago.optional() })).max(50).default([]),
  vinculos: z.array(z.object({ jugador_id: id, apoderado_id: id })).max(50).default([]),
});

/**
 * POST /api/panel/solicitudes/:id/rechazar — sin `personas` ni `vinculos` se rechaza todo lo
 * pendiente. Con alguno de los dos, solo lo indicado: un vínculo pendiente de la solicitud se puede
 * rechazar solo (se borra) y sus personas siguen pendientes, salvo quien era de la solicitud solo
 * por ese vínculo (un precargado que ella completó): esa persona vuelve a como estaba.
 */
export const rechazarRequest = z.object({
  personas: z.array(z.object({ rol: z.enum(["jugador", "apoderado"]), id })).max(50).optional(),
  vinculos: z.array(z.object({ jugador_id: id, apoderado_id: id })).max(50).optional(),
});

/**
 * POST /api/panel/solicitudes/:id/link — genera un `token_acceso` nuevo (en una solicitud de
 * segundo apoderado, su link de `/completar`) y anula el anterior: la base guarda solo el hash.
 */
export const linkResponse = z.object({ url: z.url() });

/** POST /api/panel/:tipo/:id/foto — multipart: archivo `foto`. GET devuelve la imagen. */
export const fotoSubidaResponse = z.object({ tiene_foto: z.literal(true) });
/** POST /api/panel/:tipo/:id/regenerar-token — solo personas activas. */
export const regenerarTokenResponse = z.object({ credencial_token: token });
/**
 * POST /api/panel/:tipo/:id/activar — activa a un precargado completado en el panel o reactiva
 * a un inactivo. Exige lo mismo que la aprobación y genera un `credencial_token` nuevo. Al activar
 * a un precargado, sus vínculos de la base (sin solicitud) que sigan pendientes pasan a activos si
 * el otro extremo ya está activo.
 * POST /api/panel/:tipo/:id/desactivar — estado inactivo y token anulado.
 */
export const cambioEstadoResponse = z.object({
  estado: z.enum(["activo", "inactivo"]),
  credencial_token: token.nullable(),
});

/** GET /api/panel/categorias */
export const categoriaPanel = z.object({
  id: categoriaId,
  nombre: z.string(),
  disciplina,
  /** Edades de temporada (temporada − año de nacimiento) que cubre: UN cubre N−1 y N. */
  edad_min: z.int(),
  edad_max: z.int(),
  /** false en U11 F: no se calcula, la marca Mony en la ficha. */
  se_calcula: z.boolean(),
});
export const categoriasPanelResponse = z.array(categoriaPanel);

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

type TipoPersona = (typeof TIPOS_PERSONA)[number];
const seg = encodeURIComponent;

/** Rutas de la API, para no escribirlas a mano en el frontend. */
export const API = {
  health: "/api/health",
  public: {
    rutLookup: "/api/public/rut-lookup",
    solicitudes: "/api/public/solicitudes",
    familia: (tokenAcceso: string) => `/api/public/familia/${seg(tokenAcceso)}`,
    completar: (t: string) => `/api/public/completar/${seg(t)}`,
    credencial: (t: string) => `/api/public/credencial/${seg(t)}`,
    credencialFoto: (t: string) => `/api/public/credencial/${seg(t)}/foto`,
  },
  auth: {
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    me: "/api/auth/me",
    cambiarClave: "/api/auth/cambiar-clave",
  },
  panel: {
    dashboard: "/api/panel/dashboard",
    solicitudes: "/api/panel/solicitudes",
    solicitud: (i: string) => `/api/panel/solicitudes/${seg(i)}`,
    aprobar: (i: string) => `/api/panel/solicitudes/${seg(i)}/aprobar`,
    rechazar: (i: string) => `/api/panel/solicitudes/${seg(i)}/rechazar`,
    link: (i: string) => `/api/panel/solicitudes/${seg(i)}/link`,
    // Cierra una solicitud pendiente que ya no deja personas ni vínculos por decidir y borra sus
    // copias en `fichas_previas`. Sin cuerpo; responde `solicitudDetalle`. 409 si no está
    // pendiente o si todavía queda algo por decidir.
    darPorRevisada: (i: string) => `/api/panel/solicitudes/${seg(i)}/dar-por-revisada`,
    jugadores: "/api/panel/jugadores",
    jugador: (i: string) => `/api/panel/jugadores/${seg(i)}`,
    apoderados: "/api/panel/apoderados",
    apoderado: (i: string) => `/api/panel/apoderados/${seg(i)}`,
    entrenadores: "/api/panel/entrenadores",
    entrenador: (i: string) => `/api/panel/entrenadores/${seg(i)}`,
    foto: (t: TipoPersona, i: string) => `/api/panel/${t}/${seg(i)}/foto`,
    regenerarToken: (t: TipoPersona, i: string) => `/api/panel/${t}/${seg(i)}/regenerar-token`,
    activar: (t: TipoPersona, i: string) => `/api/panel/${t}/${seg(i)}/activar`,
    desactivar: (t: TipoPersona, i: string) => `/api/panel/${t}/${seg(i)}/desactivar`,
    /** DELETE: Mony confirma que el jugador sigue en el club y le quita la marca "ya no está". Responde `jugadorDetalle`. */
    marcaRetiro: (i: string) => `/api/panel/jugadores/${seg(i)}/marca-retiro`,
    categorias: "/api/panel/categorias",
  },
  /** Suscripción del club en Flow. Con sesión, salvo `retorno` (lo llama Flow, no el panel). */
  suscripcion: {
    estado: "/api/suscripcion",
    aviso: "/api/suscripcion/aviso",
    inscribirTarjeta: "/api/suscripcion/inscribir-tarjeta",
    reintentar: "/api/suscripcion/reintentar",
    retorno: "/api/suscripcion/retorno",
  },
} as const;

/** URL que va dentro del QR. `baseUrl` es PUBLIC_BASE_URL (sin barra final). */
export function urlCredencial(baseUrl: string, credencialToken: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/c/${encodeURIComponent(credencialToken)}`;
}

// ---------------------------------------------------------------------------
// Suscripción del club al servicio (Flow, cargo automático). Ver docs/suscripcion-flow.md.
// No tiene relación con los pagos de las familias ni con Forpay.
// ---------------------------------------------------------------------------

/** Valores de `FLOW_MODO`. Cualquier otro valor (o vacío) deja el módulo sin configurar. */
export const MODOS_FLOW = ["sandbox", "produccion"] as const;
export const modoFlow = z.enum(MODOS_FLOW);
/** El plan de Flow al que se suscribe el club. Existe con este ID en sandbox y en producción. */
export const PLAN_SUSCRIPCION = "suscripcion_clubcolina";
export const ESTADOS_SUSCRIPCION = [
  "sin_tarjeta",
  "activa",
  "cobro_fallido",
  "no_disponible",
  "pendiente_configuracion",
] as const;
export const estadoSuscripcion = z.enum(ESTADOS_SUSCRIPCION);
export const ESTADOS_COBRO = ["pagado", "pendiente", "fallido", "anulado"] as const;
export const estadoCobro = z.enum(ESTADOS_COBRO);

/**
 * GET /api/suscripcion — con sesión. Se arma leyendo Flow en el momento; si Flow falla o tarda más
 * de 8 s, `no_disponible`. `modo` es null solo en `pendiente_configuracion`. El monto viene siempre
 * del plan en Flow (nunca fijo en el código).
 */
export const suscripcionResponse = z.object({
  estado: estadoSuscripcion,
  modo: modoFlow.nullable(),
  /** Ya hay cliente en Flow para el modo activo: para inscribir otra tarjeta no se pide el correo. */
  tiene_cliente: z.boolean(),
  /** Hay un importe vencido: "Reintentar cobro" puede servir. Si no, solo "Cambiar tarjeta". */
  puede_reintentar: z.boolean(),
  plan: z.object({ nombre: z.string(), monto: z.number().nonnegative(), moneda: z.string() }).nullable(),
  /**
   * Con `no_disponible`: Flow rechazó las claves o no encuentra el plan, no es una caída. Opcional:
   * el backend anterior no lo manda.
   */
  configuracion_incorrecta: z.enum(["claves", "plan"]).nullish(),
  proximo_cobro: fecha.nullable(),
  tarjeta: z.object({ tipo: z.string(), ultimos4: z.string().regex(/^[0-9]{4}$/) }).nullable(),
  historial: z.array(
    z.object({
      fecha,
      monto: z.number().nonnegative(),
      estado: estadoCobro,
      /**
       * Período que cubre el cobro, tal cual lo informa Flow (`period_start`, `period_end`). Flow ya
       * termina el período el día anterior al cobro siguiente. Opcional: el backend anterior no lo manda.
       */
      periodo: z.object({ desde: fecha, hasta: fecha }).nullish(),
    }),
  ),
});

/**
 * POST /api/suscripcion/inscribir-tarjeta — con sesión. `email` es obligatorio solo la primera vez
 * (cuando aún no hay cliente en Flow para el modo activo); para cambiar la tarjeta no se pide.
 * Responde la URL de Flow a la que el navegador tiene que ir, o `recuperada` si Flow ya tenía al
 * cliente del club (externalId repetido) con su suscripción vigente. 409 `conflicto` si falta el correo o si
 * se intenta desde sandbox con una suscripción de producción guardada; 503 `no_disponible` si Flow
 * falla o no está configurado.
 */
export const inscribirTarjetaRequest = z.object({ email: email.optional() });
/**
 * `flow`: hay que llevar el navegador a `url` (el registro de tarjeta en Flow). `recuperada`: Flow ya
 * tenía al cliente del club con su suscripción vigente; quedó guardada y no hay que ir a Flow.
 */
export const inscribirTarjetaResponse = z
  .object({
    // Sin `resultado` es "flow": así el frontend nuevo entiende al backend anterior mientras uno de
    // los dos aún no se publica (Vercel y Railway publican por separado).
    resultado: z.enum(["flow", "recuperada"]).default("flow"),
    url: z.url().optional(),
  })
  .refine((r) => r.resultado === "recuperada" || r.url !== undefined, { path: ["url"] });

/**
 * POST /api/suscripcion/reintentar — con sesión y límite de intentos. Reintenta el cobro del
 * importe vencido más antiguo. 409 `conflicto` si no hay ninguno o si Flow no acepta el reintento.
 */
export const reintentarCobroResponse = z.object({ resultado: z.enum(["pagado", "rechazado"]) });

/** GET /api/suscripcion/aviso — con sesión; con caché de 15 minutos en el backend. */
export const avisoSuscripcionResponse = z.object({ cobro_fallido: z.boolean() });

/** `?resultado=` con que /api/suscripcion/retorno redirige a la página del panel. */
export const RESULTADOS_RETORNO = ["ok", "error"] as const;
/** Ruta de la página del panel (el retorno de Flow redirige acá). */
export const RUTA_SUSCRIPCION = "/suscripcion";

// ---------------------------------------------------------------------------
// Tipos inferidos
// ---------------------------------------------------------------------------

export type Disciplina = z.infer<typeof disciplina>;
export type Rol = z.infer<typeof rol>;
export type EstadoPersona = z.infer<typeof estadoPersona>;
export type MetodoPago = z.infer<typeof metodoPago>;
export type RutLookupRequest = z.input<typeof rutLookupRequest>;
export type RutLookupResponse = z.infer<typeof rutLookupResponse>;
export type SolicitudDatos = z.input<typeof solicitudDatos>;
export type SolicitudCreadaResponse = z.infer<typeof solicitudCreadaResponse>;
export type FamiliaResponse = z.infer<typeof familiaResponse>;
export type CompletarResponse = z.infer<typeof completarResponse>;
export type CredencialResponse = z.infer<typeof credencialResponse>;
export type Usuario = z.infer<typeof usuario>;
export type LoginRequest = z.input<typeof loginRequest>;
export type CambiarClaveRequest = z.input<typeof cambiarClaveRequest>;
export type DashboardResponse = z.infer<typeof dashboardResponse>;
export type JugadorResumen = z.infer<typeof jugadorResumen>;
export type JugadorDetalle = z.infer<typeof jugadorDetalle>;
export type JugadorPatch = z.input<typeof jugadorPatch>;
export type ApoderadoResumen = z.infer<typeof apoderadoResumen>;
export type ApoderadoDetalle = z.infer<typeof apoderadoDetalle>;
export type ApoderadoPatch = z.input<typeof apoderadoPatch>;
export type EntrenadorDetalle = z.infer<typeof entrenadorDetalle>;
export type EntrenadorCrear = z.input<typeof entrenadorCrear>;
export type EntrenadorPatch = z.input<typeof entrenadorPatch>;
export type SolicitudResumen = z.infer<typeof solicitudResumen>;
export type SolicitudDetalle = z.infer<typeof solicitudDetalle>;
export type AvisoSolicitud = z.infer<typeof avisoSolicitud>;
export type AprobarRequest = z.input<typeof aprobarRequest>;
export type RechazarRequest = z.input<typeof rechazarRequest>;
export type CambioEstadoResponse = z.infer<typeof cambioEstadoResponse>;
export type CategoriaPanel = z.infer<typeof categoriaPanel>;
export type ModoFlow = z.infer<typeof modoFlow>;
export type EstadoSuscripcion = z.infer<typeof estadoSuscripcion>;
export type SuscripcionResponse = z.infer<typeof suscripcionResponse>;
export type InscribirTarjetaRequest = z.input<typeof inscribirTarjetaRequest>;
export type InscribirTarjetaResponse = z.infer<typeof inscribirTarjetaResponse>;
export type ReintentarCobroResponse = z.infer<typeof reintentarCobroResponse>;
export type AvisoSuscripcionResponse = z.infer<typeof avisoSuscripcionResponse>;
