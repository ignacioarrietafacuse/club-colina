/** Indicadores de la Etapa 2 (PRD, sección 7): tarjetas "Pendiente", sin números de ejemplo. */
export const INDICADORES_ETAPA_2 = [
  "Pagos recibidos",
  "Pagos pendientes",
  "Leads nuevos",
  "Conversaciones recibidas",
  "Consultas respondidas mediante IA",
  "Torneos y campus activos",
  "Pedidos de uniformes activos",
  "Actividad reciente",
] as const;

/** Saludo genérico (PRD, sección 5): no personaliza el sistema para una persona. */
export function saludo(hora: number): string {
  if (hora >= 5 && hora < 12) return "Buenos días";
  if (hora >= 12 && hora < 20) return "Buenas tardes";
  return "Bienvenido nuevamente";
}
