import { createFileRoute } from "@tanstack/react-router";
import { SolicitudesPage } from "@/pages/panel/SolicitudesPage";

export const Route = createFileRoute("/_panel/jugadores/solicitudes/")({
  component: SolicitudesPage,
});
