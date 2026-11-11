import { createFileRoute } from "@tanstack/react-router";
import { EntrenadorPage } from "@/pages/panel/EntrenadorPage";

export const Route = createFileRoute("/_panel/entrenadores/$id")({ component: EntrenadorPage });
