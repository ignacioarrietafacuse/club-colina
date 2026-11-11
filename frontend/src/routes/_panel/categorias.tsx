import { createFileRoute } from "@tanstack/react-router";
import { CategoriasPage } from "@/pages/panel/CategoriasPage";

export const Route = createFileRoute("/_panel/categorias")({ component: CategoriasPage });
