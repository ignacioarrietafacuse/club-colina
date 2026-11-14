import type { CategoriaPanel, DashboardResponse, Disciplina } from "@club-colina/shared";

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

export interface FilaCategoria {
  clave: string;
  disciplina: Disciplina | null;
  nombre: string;
  jugadores: number;
}

/**
 * Jugadores activos por categoría, para la tabla del dashboard: en el orden que manda el servidor
 * (por rama y edad), con el nombre de cada categoría, y al final "Sin categoría". Sin la lista de
 * categorías no hay nombres: no se muestra nada (nunca un id suelto).
 */
export function filasPorCategoria(
  porCategoria: DashboardResponse["jugadores_por_categoria"],
  categorias: readonly CategoriaPanel[] | undefined,
): FilaCategoria[] {
  if (!categorias) return [];
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const filas: FilaCategoria[] = [];
  for (const f of porCategoria) {
    if (f.categoria_id === null) {
      filas.push({
        clave: "sin",
        disciplina: null,
        nombre: "Sin categoría",
        jugadores: f.jugadores,
      });
      continue;
    }
    const c = porId.get(f.categoria_id);
    if (c)
      filas.push({
        clave: String(c.id),
        disciplina: c.disciplina,
        nombre: c.nombre,
        jugadores: f.jugadores,
      });
  }
  return filas;
}
