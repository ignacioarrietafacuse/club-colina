import { createFileRoute } from "@tanstack/react-router";
import { LeadsPage } from "@/pages/panel/LeadsPage";

export const Route = createFileRoute("/_panel/leads")({ component: LeadsPage });
