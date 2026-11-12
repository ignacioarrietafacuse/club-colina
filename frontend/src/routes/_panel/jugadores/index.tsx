import { createFileRoute } from "@tanstack/react-router";
import { JugadoresPage } from "@/pages/panel/JugadoresPage";
import { busquedaJugadores } from "@/pages/panel/filtros";

export const Route = createFileRoute("/_panel/jugadores/")({
  validateSearch: busquedaJugadores,
  component: JugadoresPage,
});
