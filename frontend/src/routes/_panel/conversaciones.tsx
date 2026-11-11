import { createFileRoute } from "@tanstack/react-router";
import { ConversacionesPage } from "@/pages/panel/ConversacionesPage";

export const Route = createFileRoute("/_panel/conversaciones")({ component: ConversacionesPage });
