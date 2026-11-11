import { createFileRoute } from "@tanstack/react-router";
import { CompletarPage } from "@/pages/public/CompletarPage";

export const Route = createFileRoute("/completar/$token")({ component: CompletarPage });
