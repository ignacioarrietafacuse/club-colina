import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/pages/panel/LoginPage";

export const Route = createFileRoute("/login")({ component: LoginPage });
