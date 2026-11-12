export type Estado = "precargado" | "pendiente" | "activo" | "rechazado" | "inactivo";

/** Qué acciones de estado se ofrecen (contrato: activar / desactivar). */
export function accionesEstado(estado: Estado) {
  return {
    // Activa a un precargado completado en el panel o reactiva a un inactivo.
    activar: estado === "precargado" || estado === "inactivo",
    // Da de baja a un activo, o a un precargado que ya no está en el club.
    desactivar: estado === "activo" || estado === "precargado",
  };
}
