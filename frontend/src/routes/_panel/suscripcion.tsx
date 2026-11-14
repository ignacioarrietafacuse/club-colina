import { createFileRoute } from "@tanstack/react-router";
import { busquedaSuscripcion } from "@/pages/panel/suscripcion";
import { SuscripcionPage } from "@/pages/panel/SuscripcionPage";

export const Route = createFileRoute("/_panel/suscripcion")({
  validateSearch: busquedaSuscripcion,
  component: SuscripcionPage,
});
