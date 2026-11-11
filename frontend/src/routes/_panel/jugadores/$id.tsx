import { createFileRoute } from "@tanstack/react-router";
import { JugadorPage } from "@/pages/panel/JugadorPage";

export const Route = createFileRoute("/_panel/jugadores/$id")({ component: JugadorPage });
