import type { AvisoSolicitud, Disciplina, EstadoPersona, MetodoPago } from "@club-colina/shared";
import { NUMERO_SIN_ASIGNAR } from "@club-colina/shared";

/** Textos del panel para los valores fijos del contrato. */

/** Campos que pueden faltar en una ficha (`faltanteJugador` y `faltanteApoderado`). */
export const TEXTO_FALTANTE: Record<string, string> = {
  nombre: "nombre",
  apellido: "apellido",
  fecha_nacimiento: "fecha de nacimiento",
  categoria: "categoría",
  numero_camiseta: "número",
  telefono: "teléfono",
  foto: "foto",
};

export function textoFaltantes(faltantes: readonly string[]): string {
  return faltantes.map((f) => TEXTO_FALTANTE[f] ?? f).join(", ");
}

export const TEXTO_AVISO: Record<AvisoSolicitud, string> = {
  titular_ya_registrado: "Este RUT ya había enviado el formulario antes.",
  telefono_distinto_base: "El teléfono ingresado no coincide con el de la base.",
  hijo_con_otro_apoderado: "Un hijo agregado por RUT ya tiene otro apoderado vinculado.",
  apoderado_nuevo_para_hijo_registrado: "Se agrega un apoderado nuevo a un hijo ya registrado.",
  hijo_marcado_ya_no_esta:
    "Se marcó un hijo como «ya no está en el club». Para confirmar el retiro, abre su ficha y déjalo inactivo.",
  otro_apoderado_ya_registrado: "El otro apoderado que se agrega ya existía en la base.",
  sin_telefono_en_base: "El RUT estaba en la base sin teléfono: no hubo con qué comparar.",
  hay_solicitud_posterior: "Llegó después otra solicitud con las mismas personas.",
  hijo_precargado_completado_por_rut:
    "Un hijo de la base, nombrado por RUT, se completó con los datos de esta solicitud. Confirma que la familia es la suya.",
  cambios_bloqueados_por_otra_solicitud:
    "Otra solicitud pendiente ya había modificado a una persona de esta: esta no cambió su ficha, a lo más la vinculó.",
};

export const TEXTO_ESTADO: Record<EstadoPersona, string> = {
  precargado: "Precargado",
  pendiente: "Pendiente",
  activo: "Activo",
  rechazado: "Rechazado",
  inactivo: "Inactivo",
};

export const TONO_ESTADO: Record<EstadoPersona, "neutral" | "warning" | "success" | "danger"> = {
  precargado: "neutral",
  pendiente: "warning",
  activo: "success",
  rechazado: "danger",
  inactivo: "neutral",
};

export const TEXTO_METODO_PAGO: Record<MetodoPago, string> = {
  forpay_mensual: "Forpay mensual",
  transferencia_anual: "Transferencia anual",
  tarjeta_credito_anual: "Tarjeta de crédito anual",
};

export const TEXTO_DISCIPLINA: Record<Disciplina, string> = {
  basketball: "Basketball",
  voleibol: "Voleibol",
};

export function nombreCompleto(p: { nombre: string | null; apellido: string | null }): string {
  const texto = [p.nombre, p.apellido].filter(Boolean).join(" ").trim();
  return texto || "(sin nombre)";
}

/** "99" es "sin número asignado" (diseño, Número 99). */
export function textoNumero(numero: string | null): string {
  if (numero === null) return "—";
  if (numero === NUMERO_SIN_ASIGNAR) return "Sin número (99)";
  return numero;
}

const formatoFecha = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const formatoFechaHora = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** `AAAA-MM-DD` sin pasar por la zona horaria (si no, en Chile se corre un día). */
export function textoFecha(fecha: string | null): string {
  if (!fecha) return "—";
  const [a, m, d] = fecha.split("-").map(Number);
  if (!a || !m || !d) return "—";
  return formatoFecha.format(new Date(a, m - 1, d));
}

export function textoFechaHora(fechaHora: string | null): string {
  if (!fechaHora) return "—";
  const fecha = new Date(fechaHora);
  return Number.isNaN(fecha.getTime()) ? "—" : formatoFechaHora.format(fecha);
}
