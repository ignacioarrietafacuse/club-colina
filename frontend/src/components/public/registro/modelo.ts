import {
  FOTOS_MAX_POR_SOLICITUD,
  HIJOS_MAX_POR_SOLICITUD,
  normalizarRut,
  type Disciplina,
  type RutLookupResponse,
  type SolicitudDatos,
} from "@club-colina/shared";

/**
 * Estado del formulario de registro y las reglas para pasar de un paso a otro. Todo es puro
 * (sin React ni red) para poder probarlo entero; los componentes solo lo muestran.
 */

export type CampoPersona =
  | "nombre"
  | "apellido"
  | "telefono"
  | "fecha_nacimiento"
  | "disciplina"
  | "numero_camiseta"
  | "categoria"
  | "foto";

export interface DatosPersona {
  nombre: string;
  apellido: string;
  telefono: string;
  fecha_nacimiento: string;
  disciplina: Disciplina | "";
  numero_camiseta: string;
  /** "" = que el servidor la calcule por el año de nacimiento. */
  categoria_id: string;
}

export const DATOS_VACIOS: DatosPersona = {
  nombre: "",
  apellido: "",
  telefono: "",
  fecha_nacimiento: "",
  disciplina: "",
  numero_camiseta: "",
  categoria_id: "",
};

/**
 * Qué se le pregunta a una persona. La categoría se pregunta solo cuando el servidor dice que
 * falta (`faltantes` de un precargado): a una persona nueva el servidor se la calcula por año
 * de nacimiento, y si no calza, la completa Mony al aprobar.
 */
export interface Campos {
  pedir: ReadonlySet<CampoPersona>;
}

type LookupApoderado = Extract<RutLookupResponse, { tipo: "apoderado" }>;
type LookupJugador = Extract<RutLookupResponse, { tipo: "jugador" }>;
export type HijoPrecargado = LookupApoderado["hijos"][number];

export type OrigenHijo =
  | { tipo: "precargado"; hijo: HijoPrecargado }
  | { tipo: "rut"; rut: string; busqueda: BusquedaHijo };

/** Resultado de buscar el RUT de un hijo agregado a mano. */
export type BusquedaHijo =
  | { estado: "sin_buscar" }
  | { estado: "nuevo" }
  | {
      estado: "precargado";
      primer_nombre: string;
      ya_registrado: boolean;
      faltantes: LookupJugador["faltantes"];
    };

export interface Hijo {
  /** Identificador local; también nombra su foto en el multipart (`foto_<clave>`). */
  clave: string;
  origen: OrigenHijo;
  ya_no_esta: boolean;
  datos: DatosPersona;
  foto: File | null;
}

export interface OtroApoderado {
  nombre: string;
  apellido: string;
  rut: string;
  telefono: string;
  /** Claves de los hijos a los que corresponde. */
  hijos: string[];
}

export type Titular =
  | { tipo: "apoderado"; lookup: LookupApoderado | null }
  | { tipo: "jugador_adulto"; lookup: LookupJugador | null };

export interface Formulario {
  rut: string;
  titular: Titular;
  datos: DatosPersona;
  foto: File | null;
  paga_mensualidad: boolean;
  hijos: Hijo[];
  otro: OtroApoderado | null;
  consentimiento: boolean;
}

export type Errores = Partial<Record<string, string>>;

// ---------------------------------------------------------------------------
// Qué se pregunta
// ---------------------------------------------------------------------------

const TODO_APODERADO: CampoPersona[] = ["nombre", "apellido", "telefono", "foto"];
const TODO_ADULTO: CampoPersona[] = [
  "nombre",
  "apellido",
  "telefono",
  "fecha_nacimiento",
  "disciplina",
  "numero_camiseta",
  "foto",
];
const TODO_HIJO: CampoPersona[] = [
  "nombre",
  "apellido",
  "fecha_nacimiento",
  "disciplina",
  "numero_camiseta",
  "foto",
];

function campos(lista: readonly CampoPersona[]): Campos {
  return { pedir: new Set(lista) };
}

/** Lo que se le pregunta a quien llena el formulario sobre sí mismo. */
export function camposTitular(t: Titular): Campos {
  if (t.lookup === null) {
    return campos(t.tipo === "apoderado" ? TODO_APODERADO : TODO_ADULTO);
  }
  // Ya registrado: solo agrega hijos y otro apoderado; sus datos no se piden ni se cambian.
  if (t.lookup.ya_registrado) return campos([]);
  const faltantes: readonly CampoPersona[] = t.lookup.faltantes;
  // Al apoderado precargado el teléfono se le pide siempre, aunque la base lo tenga: el servidor
  // lo exige para compararlo con el de la base y avisarle a Mony si no coincide.
  if (t.tipo === "apoderado" && !faltantes.includes("telefono"))
    return campos([...faltantes, "telefono"]);
  return campos(faltantes);
}

/**
 * El contrato no lleva teléfono para un hijo (`hijoSolicitud`): si el servidor lo trata como
 * adulto (o no sabe su edad), igual no se le pide a la familia.
 */
function sinTelefono<T extends string>(faltantes: readonly T[]): T[] {
  return faltantes.filter((x) => x !== "telefono");
}

/** Lo que se pregunta de un hijo. Uno marcado "ya no está" no lleva nada más. */
export function camposHijo(h: Hijo): Campos {
  if (h.ya_no_esta) return campos([]);
  // Un hijo que ya se registró (por otro apoderado o antes) no lleva datos: solo se vincula.
  if (h.origen.tipo === "precargado") {
    const { ya_registrado, faltantes } = h.origen.hijo;
    return ya_registrado ? campos([]) : campos(sinTelefono(faltantes));
  }
  const b = h.origen.busqueda;
  if (b.estado === "nuevo") return campos(TODO_HIJO);
  if (b.estado === "precargado" && !b.ya_registrado) {
    return campos(b.faltantes);
  }
  return campos([]);
}

export function esApoderado(f: Formulario): boolean {
  return f.titular.tipo === "apoderado";
}

/** Apoderado que ya envió el formulario antes: no se le piden sus datos. */
export function titularYaRegistrado(f: Formulario): boolean {
  return f.titular.lookup?.ya_registrado ?? false;
}

/** Puede marcar "Ya no está en el club" solo en un hijo precargado que no se registró. */
export function puedeMarcarYaNoEsta(h: Hijo): boolean {
  return h.origen.tipo === "precargado" && !h.origen.hijo.ya_registrado;
}

/** Nombre con que se muestra un hijo en el formulario. */
export function nombreHijo(h: Hijo, indice: number): string {
  const escrito = camposHijo(h).pedir.has("nombre") ? h.datos.nombre.trim() : "";
  if (escrito) return escrito;
  if (h.origen.tipo === "precargado") return h.origen.hijo.primer_nombre || `Hijo ${indice + 1}`;
  if (h.origen.busqueda.estado === "precargado") return h.origen.busqueda.primer_nombre;
  return `Hijo ${indice + 1}`;
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

function hijoPrecargado(hijo: HijoPrecargado): Hijo {
  return {
    clave: `p${hijo.posicion}`,
    origen: { tipo: "precargado", hijo },
    ya_no_esta: false,
    datos: { ...DATOS_VACIOS },
    foto: null,
  };
}

/** Qué hacer con el resultado de la consulta del RUT de quien llena. */
export type InicioFormulario =
  | { tipo: "formulario"; formulario: Formulario }
  | { tipo: "elegir_rol"; rut: string }
  | { tipo: "menor_de_edad" }
  | { tipo: "adulto_ya_registrado" };

export function iniciarFormulario(rut: string, lookup: RutLookupResponse): InicioFormulario {
  if (!lookup.encontrado) return { tipo: "elegir_rol", rut };
  if (lookup.tipo === "jugador") {
    if (!lookup.adulto) return { tipo: "menor_de_edad" };
    if (lookup.ya_registrado) return { tipo: "adulto_ya_registrado" };
    return {
      tipo: "formulario",
      formulario: nuevoFormulario(rut, { tipo: "jugador_adulto", lookup }),
    };
  }
  const f = nuevoFormulario(rut, { tipo: "apoderado", lookup });
  f.hijos = lookup.hijos.map(hijoPrecargado);
  return { tipo: "formulario", formulario: f };
}

export function nuevoFormulario(rut: string, titular: Titular): Formulario {
  return {
    rut,
    titular,
    datos: { ...DATOS_VACIOS },
    foto: null,
    paga_mensualidad: false,
    hijos: [],
    otro: null,
    consentimiento: false,
  };
}

let contadorHijos = 0;

/** Hijo agregado a mano: primero se pide su RUT. */
export function nuevoHijoPorRut(): Hijo {
  contadorHijos += 1;
  return {
    clave: `n${contadorHijos}`,
    origen: { tipo: "rut", rut: "", busqueda: { estado: "sin_buscar" } },
    ya_no_esta: false,
    datos: { ...DATOS_VACIOS },
    foto: null,
  };
}

/** Qué significa, para un hijo, lo que devolvió la consulta de su RUT. */
export function busquedaDesdeLookup(lookup: RutLookupResponse): BusquedaHijo | { error: string } {
  if (!lookup.encontrado) return { estado: "nuevo" };
  if (lookup.tipo === "apoderado") {
    return { error: "Ese RUT es de un apoderado. Escribe el RUT del jugador." };
  }
  return {
    estado: "precargado",
    primer_nombre: lookup.primer_nombre,
    ya_registrado: lookup.ya_registrado,
    faltantes: sinTelefono(lookup.faltantes),
  };
}

/** Hijos que se pueden agregar a mano sin pasar el máximo por solicitud. */
export function puedeAgregarHijo(f: Formulario): boolean {
  return hijosQueSeEnvian(f).length < HIJOS_MAX_POR_SOLICITUD;
}

// ---------------------------------------------------------------------------
// Validación por paso
// ---------------------------------------------------------------------------

const NUMERO = /^[0-9]{1,2}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function telefonoValido(valor: string): boolean {
  let digitos = valor.replace(/\D/g, "");
  if (digitos.length === 11 && digitos.startsWith("56")) digitos = digitos.slice(2);
  return /^[0-9]{9}$/.test(digitos);
}

function fechaValida(valor: string, hoy: Date): boolean {
  if (!FECHA.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) return false;
  return d.getUTCFullYear() >= 1900 && d.getTime() <= hoy.getTime();
}

function validarPersona(
  prefijo: string,
  c: Campos,
  datos: DatosPersona,
  foto: File | null,
  errores: Errores,
  hoy: Date,
) {
  const p = (campo: string) => `${prefijo}${campo}`;
  if (c.pedir.has("nombre") && !datos.nombre.trim()) errores[p("nombre")] = "Escribe el nombre.";
  if (c.pedir.has("apellido") && !datos.apellido.trim())
    errores[p("apellido")] = "Escribe el apellido.";
  if (c.pedir.has("telefono") && !telefonoValido(datos.telefono)) {
    errores[p("telefono")] = "El teléfono debe tener 9 dígitos, por ejemplo 912345678.";
  }
  if (c.pedir.has("fecha_nacimiento") && !fechaValida(datos.fecha_nacimiento, hoy)) {
    errores[p("fecha_nacimiento")] = "Escribe una fecha de nacimiento válida.";
  }
  if (c.pedir.has("disciplina") && !datos.disciplina) errores[p("disciplina")] = "Elige la rama.";
  if (c.pedir.has("numero_camiseta") && !NUMERO.test(datos.numero_camiseta.trim())) {
    errores[p("numero_camiseta")] =
      "Escribe un número de 1 o 2 dígitos. Si aún no tiene, escribe 99.";
  }
  if (c.pedir.has("categoria") && !datos.categoria_id) {
    errores[p("categoria_id")] = "Elige la categoría.";
  }
  if (c.pedir.has("foto") && !foto) errores[p("foto")] = "Falta la foto.";
}

/** Años cumplidos a `hoy` de alguien nacido en `fecha` (`AAAA-MM-DD`). */
export function edadEn(fecha: string, hoy: Date): number {
  const [a, m, d] = fecha.split("-").map(Number);
  if (a === undefined || m === undefined || d === undefined) return Number.NaN;
  const cumplio = hoy.getMonth() + 1 > m || (hoy.getMonth() + 1 === m && hoy.getDate() >= d);
  return hoy.getFullYear() - a - (cumplio ? 0 : 1);
}

export function validarTitular(f: Formulario, hoy = new Date()): Errores {
  const errores: Errores = {};
  const c = camposTitular(f.titular);
  validarPersona("", c, f.datos, f.foto, errores, hoy);
  if (
    f.titular.tipo === "jugador_adulto" &&
    c.pedir.has("fecha_nacimiento") &&
    !errores["fecha_nacimiento"] &&
    edadEn(f.datos.fecha_nacimiento, hoy) < 18
  ) {
    errores["fecha_nacimiento"] =
      "Si eres menor de 18 años, el registro lo hace tu apoderado con su propio RUT.";
  }
  return errores;
}

export function validarHijos(f: Formulario, hoy = new Date()): Errores {
  const errores: Errores = {};
  const ruts = new Set<string>([f.rut]);
  f.hijos.forEach((h) => {
    const p = `hijo.${h.clave}.`;
    if (h.origen.tipo === "rut") {
      const rut = normalizarRut(h.origen.rut);
      if (rut === null) {
        errores[`${p}rut`] = "Escribe un RUT válido.";
        return;
      }
      if (ruts.has(rut)) {
        errores[`${p}rut`] = rut === f.rut ? "Es tu propio RUT." : "Ese RUT ya está en la lista.";
        return;
      }
      ruts.add(rut);
      if (h.origen.busqueda.estado === "sin_buscar") {
        errores[`${p}rut`] = "Presiona «Buscar» para revisar el RUT.";
        return;
      }
    }
    validarPersona(p, camposHijo(h), h.datos, h.foto, errores, hoy);
  });
  // Un apoderado nuevo inscribe al menos a un hijo; uno de la base ya tiene los suyos.
  if (esApoderado(f) && f.titular.lookup === null && f.hijos.length === 0) {
    errores["hijos"] = "Agrega al menos un hijo.";
  }
  if (hijosQueSeEnvian(f).length > HIJOS_MAX_POR_SOLICITUD) {
    errores["hijos"] = `Puedes inscribir hasta ${HIJOS_MAX_POR_SOLICITUD} hijos por vez.`;
  }
  return errores;
}

export function validarOtro(f: Formulario): Errores {
  const errores: Errores = {};
  const o = f.otro;
  if (!o) return errores;
  if (!o.nombre.trim()) errores["otro.nombre"] = "Escribe el nombre.";
  if (!o.apellido.trim()) errores["otro.apellido"] = "Escribe el apellido.";
  const rut = normalizarRut(o.rut);
  if (rut === null) errores["otro.rut"] = "Escribe un RUT válido.";
  else if (rut === f.rut) errores["otro.rut"] = "Es tu propio RUT.";
  else if (f.hijos.some((h) => h.origen.tipo === "rut" && normalizarRut(h.origen.rut) === rut)) {
    errores["otro.rut"] = "Ese RUT es de uno de los hijos.";
  }
  if (!telefonoValido(o.telefono)) errores["otro.telefono"] = "El teléfono debe tener 9 dígitos.";
  const validos = new Set(hijosParaOtro(f).map((h) => h.clave));
  if (!o.hijos.some((c) => validos.has(c))) errores["otro.hijos"] = "Marca al menos un hijo.";
  return errores;
}

/** Último paso: consentimiento, y que haya algo que mandar. */
export function validarEnvio(f: Formulario): Errores {
  const errores: Errores = {};
  if (titularYaRegistrado(f) && hijosQueSeEnvian(f).length === 0 && !f.otro) {
    errores["envio"] = "Ya estás registrado. Agrega un hijo o a otro apoderado para enviar.";
  }
  if (!f.consentimiento) errores["consentimiento"] = "Necesitamos tu autorización para continuar.";
  return errores;
}

/** Hijos que el otro apoderado puede tomar: todos menos los marcados "ya no está". */
export function hijosParaOtro(f: Formulario): Hijo[] {
  return f.hijos.filter(
    (h) => !h.ya_no_esta && !(h.origen.tipo === "rut" && h.origen.busqueda.estado === "sin_buscar"),
  );
}

// ---------------------------------------------------------------------------
// Armado de la solicitud
// ---------------------------------------------------------------------------

/** Un hijo va en la solicitud si hay algo que mandar de él o si lo nombra el otro apoderado. */
function hijoSeEnvia(f: Formulario, h: Hijo): boolean {
  if (h.origen.tipo === "rut") return true;
  if (h.ya_no_esta) return true;
  if (!h.origen.hijo.ya_registrado) return true;
  return f.otro?.hijos.includes(h.clave) ?? false;
}

export function hijosQueSeEnvian(f: Formulario): Hijo[] {
  return f.hijos.filter((h) => hijoSeEnvia(f, h));
}

function opcional(valor: string): string | undefined {
  const v = valor.trim();
  return v === "" ? undefined : v;
}

interface DatosEnviados {
  nombre?: string;
  apellido?: string;
  telefono?: string;
  fecha_nacimiento?: string;
  disciplina?: Disciplina;
  numero_camiseta?: string;
  categoria_id?: number;
  foto?: string;
}

/** Solo los campos que se preguntaron y se llenaron: el resto no se manda. */
function datosPersona(c: Campos, d: DatosPersona, claveFoto: string | undefined): DatosEnviados {
  const r: DatosEnviados = {};
  const texto = (campo: CampoPersona, valor: string) =>
    c.pedir.has(campo) ? opcional(valor) : undefined;
  const nombre = texto("nombre", d.nombre);
  if (nombre !== undefined) r.nombre = nombre;
  const apellido = texto("apellido", d.apellido);
  if (apellido !== undefined) r.apellido = apellido;
  const telefono = texto("telefono", d.telefono);
  if (telefono !== undefined) r.telefono = telefono;
  const fecha = texto("fecha_nacimiento", d.fecha_nacimiento);
  if (fecha !== undefined) r.fecha_nacimiento = fecha;
  if (c.pedir.has("disciplina") && d.disciplina) r.disciplina = d.disciplina;
  const numero = texto("numero_camiseta", d.numero_camiseta);
  if (numero !== undefined) r.numero_camiseta = numero;
  const categoria = texto("categoria", d.categoria_id);
  if (categoria !== undefined) r.categoria_id = Number(categoria);
  if (c.pedir.has("foto") && claveFoto !== undefined) r.foto = claveFoto;
  return r;
}

export interface SolicitudArmada {
  datos: SolicitudDatos;
  /** Por clave: cada una va en el multipart como `foto_<clave>` (`api.publico.crearSolicitud`). */
  fotos: Record<string, File>;
}

/**
 * Arma el campo `datos` y las fotos de POST /api/public/solicitudes a partir del formulario.
 * Supone que cada paso ya se validó; el contrato y el servidor vuelven a validar todo.
 */
export function armarSolicitud(f: Formulario): SolicitudArmada {
  const fotos: Record<string, File> = {};
  const conFoto = (c: Campos, clave: string, foto: File | null) => {
    if (!c.pedir.has("foto") || !foto) return undefined;
    fotos[clave] = foto;
    return clave;
  };

  const cTitular = camposTitular(f.titular);
  const ya = titularYaRegistrado(f);
  const titular = ya ? {} : datosPersona(cTitular, f.datos, conFoto(cTitular, "titular", f.foto));

  const enviados = hijosQueSeEnvian(f);
  const hijos = enviados.map((h) => {
    const ref =
      h.origen.tipo === "precargado"
        ? { precargado: h.origen.hijo.posicion, primer_nombre: h.origen.hijo.primer_nombre }
        : { rut: normalizarRut(h.origen.rut) ?? h.origen.rut };
    if (h.ya_no_esta) return { ref, ya_no_esta: true as const };
    const c = camposHijo(h);
    return { ref, ...datosPersona(c, h.datos, conFoto(c, `hijo_${h.clave}`, h.foto)) };
  });

  const datos: SolicitudDatos = {
    rut: f.rut,
    tipo: f.titular.tipo,
    consentimiento: true,
    ...titular,
    ...(esApoderado(f) && !ya ? { paga_mensualidad: f.paga_mensualidad } : {}),
    hijos: esApoderado(f) ? hijos : [],
  };

  if (esApoderado(f) && f.otro) {
    const indices = f.otro.hijos
      .map((clave) => enviados.findIndex((h) => h.clave === clave && !h.ya_no_esta))
      .filter((i) => i >= 0);
    datos.otro_apoderado = {
      nombre: f.otro.nombre.trim(),
      apellido: f.otro.apellido.trim(),
      rut: normalizarRut(f.otro.rut) ?? f.otro.rut,
      telefono: f.otro.telefono.trim(),
      hijos: [...new Set(indices)].sort((a, b) => a - b),
    };
  }

  if (Object.keys(fotos).length > FOTOS_MAX_POR_SOLICITUD) {
    throw new Error(`Más de ${FOTOS_MAX_POR_SOLICITUD} fotos en una solicitud`);
  }
  return { datos, fotos };
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

export type Paso = "titular" | "hijos" | "otro" | "confirmar";

/** Pasos del formulario después del RUT, según quién llena. */
export function pasosDe(f: Formulario): Paso[] {
  const pasos: Paso[] = [];
  const preguntaAlgo = camposTitular(f.titular).pedir.size > 0;
  if (preguntaAlgo || (esApoderado(f) && !titularYaRegistrado(f))) pasos.push("titular");
  if (esApoderado(f)) pasos.push("hijos", "otro");
  pasos.push("confirmar");
  return pasos;
}

export function validarPaso(f: Formulario, paso: Paso, hoy = new Date()): Errores {
  switch (paso) {
    case "titular":
      return validarTitular(f, hoy);
    case "hijos":
      return validarHijos(f, hoy);
    case "otro":
      return validarOtro(f);
    case "confirmar":
      return validarEnvio(f);
  }
}

/** Cambia un hijo sin tocar el resto. */
export function conHijo(f: Formulario, clave: string, cambio: (h: Hijo) => Hijo): Formulario {
  return { ...f, hijos: f.hijos.map((h) => (h.clave === clave ? cambio(h) : h)) };
}

/** Quita un hijo agregado a mano, y lo saca de la lista del otro apoderado. */
export function sinHijo(f: Formulario, clave: string): Formulario {
  const hijo = f.hijos.find((h) => h.clave === clave);
  if (!hijo || hijo.origen.tipo === "precargado") return f;
  return {
    ...f,
    hijos: f.hijos.filter((h) => h.clave !== clave),
    otro: f.otro ? { ...f.otro, hijos: f.otro.hijos.filter((c) => c !== clave) } : null,
  };
}
