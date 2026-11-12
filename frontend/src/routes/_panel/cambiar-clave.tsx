import { createFileRoute } from "@tanstack/react-router";
import { CambiarClavePage } from "@/pages/panel/CambiarClavePage";

export const Route = createFileRoute("/_panel/cambiar-clave")({ component: CambiarClavePage });
