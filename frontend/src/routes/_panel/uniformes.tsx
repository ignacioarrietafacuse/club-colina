import { createFileRoute } from "@tanstack/react-router";
import { UniformesPage } from "@/pages/panel/UniformesPage";

export const Route = createFileRoute("/_panel/uniformes")({ component: UniformesPage });
