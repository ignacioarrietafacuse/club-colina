import { DISCIPLINAS, ESTADOS_PERSONA } from "@club-colina/shared";
import type { FiltrosApoderados, FiltrosJugadores } from "@/lib/api";

/** Filtros como los tiene la pantalla: "" = sin filtro. */
export interface FormFiltrosJugadores {
  q: string;
  estado: string;
  disciplina: string;
  categoria_id: string;
  faltan_datos: boolean;
  sin_numero: boolean;
}
export interface FormFiltrosApoderados {
  q: string;
  estado: string;
  faltan_datos: boolean;
}

const estado = (v: string) => ESTADOS_PERSONA.find((e) => e === v);
const disciplina = (v: string) => DISCIPLINAS.find((d) => d === v);

/** Solo lo que filtra: un checkbox apagado no es "false", es "sin filtro". */
export function filtrosJugadores(f: FormFiltrosJugadores): FiltrosJugadores {
  const categoria = Number(f.categoria_id);
  const q = f.q.trim().slice(0, 100);
  return {
    ...(q ? { q } : {}),
    ...(estado(f.estado) ? { estado: estado(f.estado) } : {}),
    ...(disciplina(f.disciplina) ? { disciplina: disciplina(f.disciplina) } : {}),
    ...(Number.isInteger(categoria) && categoria > 0 ? { categoria_id: categoria } : {}),
    ...(f.faltan_datos ? { faltan_datos: true } : {}),
    ...(f.sin_numero ? { sin_numero: true } : {}),
  };
}

export function filtrosApoderados(f: FormFiltrosApoderados): FiltrosApoderados {
  const q = f.q.trim().slice(0, 100);
  return {
    ...(q ? { q } : {}),
    ...(estado(f.estado) ? { estado: estado(f.estado) } : {}),
    ...(f.faltan_datos ? { faltan_datos: true } : {}),
  };
}
