import type { ReactNode } from "react";

/** Marco de las páginas públicas: pensado primero para el celular. */
export function Marco({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-md px-4 py-3 text-base font-semibold tracking-tight">
          Club Colina
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-6">
        {titulo && <h1 className="mb-4 text-2xl font-semibold tracking-tight">{titulo}</h1>}
        {children}
      </main>
    </div>
  );
}

export function Aviso({
  tono = "info",
  children,
}: {
  tono?: "info" | "error" | "ok" | "atencion";
  children: ReactNode;
}) {
  const clases = {
    info: "border-border bg-muted text-foreground",
    error: "border-destructive/40 bg-destructive/10 text-destructive",
    ok: "border-success/40 bg-success/10 text-foreground",
    atencion: "border-warning/60 bg-warning/20 text-warning-foreground",
  }[tono];
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      className={`rounded-lg border p-3 text-sm ${clases}`}
    >
      {children}
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground" aria-live="polite">
      {texto}
    </p>
  );
}
