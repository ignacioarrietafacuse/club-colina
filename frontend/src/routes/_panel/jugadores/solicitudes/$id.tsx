import { createFileRoute } from "@tanstack/react-router";
import { SolicitudPage } from "@/pages/panel/SolicitudPage";

export const Route = createFileRoute("/_panel/jugadores/solicitudes/$id")({
  component: SolicitudPage,
});
