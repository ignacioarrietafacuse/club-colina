import { createFileRoute } from "@tanstack/react-router";
import { FamiliaPage } from "@/pages/public/FamiliaPage";

export const Route = createFileRoute("/familia/$token")({ component: FamiliaPage });
