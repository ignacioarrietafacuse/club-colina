import type { Disciplina, Rol } from "@club-colina/shared";

export const NOMBRE_ROL: Record<Rol, string> = {
  jugador: "Jugador",
  apoderado: "Apoderado",
  entrenador: "Entrenador",
};

export const NOMBRE_DISCIPLINA: Record<Disciplina, string> = {
  basketball: "Basketball",
  voleibol: "Voleibol",
};
