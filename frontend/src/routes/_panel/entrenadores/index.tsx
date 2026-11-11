import { createFileRoute } from "@tanstack/react-router";
import { EntrenadoresPage } from "@/pages/panel/EntrenadoresPage";

export const Route = createFileRoute("/_panel/entrenadores/")({ component: EntrenadoresPage });
