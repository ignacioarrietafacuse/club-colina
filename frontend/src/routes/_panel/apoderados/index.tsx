import { createFileRoute } from "@tanstack/react-router";
import { ApoderadosPage } from "@/pages/panel/ApoderadosPage";

export const Route = createFileRoute("/_panel/apoderados/")({ component: ApoderadosPage });
