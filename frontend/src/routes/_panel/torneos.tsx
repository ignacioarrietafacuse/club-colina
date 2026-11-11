import { createFileRoute } from "@tanstack/react-router";
import { TorneosPage } from "@/pages/panel/TorneosPage";

export const Route = createFileRoute("/_panel/torneos")({ component: TorneosPage });
