import { createFileRoute } from "@tanstack/react-router";
import { ApoderadoPage } from "@/pages/panel/ApoderadoPage";

export const Route = createFileRoute("/_panel/apoderados/$id")({ component: ApoderadoPage });
