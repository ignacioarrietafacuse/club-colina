import { createFileRoute } from "@tanstack/react-router";
import { JugadoresPage } from "@/pages/panel/JugadoresPage";

export const Route = createFileRoute("/_panel/jugadores/")({ component: JugadoresPage });
