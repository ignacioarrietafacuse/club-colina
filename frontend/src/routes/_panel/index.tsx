import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/pages/panel/DashboardPage";

export const Route = createFileRoute("/_panel/")({ component: DashboardPage });
