import { createFileRoute } from "@tanstack/react-router";
import { RegistroPage } from "@/pages/public/RegistroPage";

export const Route = createFileRoute("/registro")({ component: RegistroPage });
