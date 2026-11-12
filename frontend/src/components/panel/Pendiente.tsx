import { Clock } from "lucide-react";
import { PageHeader } from "./ui";

/**
 * Sección de la Etapa 2 durante la Etapa 1 (PRD, sección 6): aparece en el menú y al entrar
 * dice que viene después. Sin datos de ejemplo.
 */
export function SeccionPendiente({ titulo }: { titulo: string }) {
  return (
    <div>
      <PageHeader title={titulo} />
      <div className="card-surface flex flex-col items-center px-6 py-16 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Clock className="size-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Pendiente</h2>
        <p className="mt-1 text-sm text-muted-foreground">Disponible en la próxima etapa.</p>
      </div>
    </div>
  );
}

/** Etiqueta "Pendiente" para tarjetas e ítems de la Etapa 2. */
export function EtiquetaPendiente() {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Pendiente
    </span>
  );
}
