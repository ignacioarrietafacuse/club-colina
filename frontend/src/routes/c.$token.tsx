import { createFileRoute } from "@tanstack/react-router";
import { CredencialPage } from "@/pages/public/CredencialPage";

export const Route = createFileRoute("/c/$token")({ component: CredencialPage });
