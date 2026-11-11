import { createFileRoute } from "@tanstack/react-router";
import { PagosPage } from "@/pages/panel/PagosPage";

export const Route = createFileRoute("/_panel/pagos")({ component: PagosPage });
