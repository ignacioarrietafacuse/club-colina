import type { CredencialResponse } from "@club-colina/shared";
import { useEffect, useState } from "react";
import { NOMBRE_ROL } from "./textos";

export type EstadoCredencial =
  | { tipo: "cargando" }
  | { tipo: "valida"; datos: CredencialResponse; fotoUrl: string }
  | { tipo: "no_valida" }
  | { tipo: "error" };

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <time dateTime={ahora.toISOString()} className="tabular-nums">
      {ahora.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "medium" })}
    </time>
  );
}

/**
 * Lo que ve quien controla la entrada al escanear un QR: foto, nombre y rol, y nada más.
 * Cualquier cosa que no sea una respuesta válida muestra "Credencial no válida".
 */
export function VistaCredencial({ estado }: { estado: EstadoCredencial }) {
  if (estado.tipo === "cargando") {
    return <p className="py-16 text-center text-sm text-muted-foreground">Verificando…</p>;
  }
  if (estado.tipo === "error") {
    return (
      <div className="rounded-2xl border p-6 text-center">
        <p className="text-lg font-semibold">No pudimos verificar</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Revisa la conexión a internet y vuelve a escanear el código.
        </p>
      </div>
    );
  }
  if (estado.tipo === "no_valida") {
    return (
      <div className="rounded-2xl border-2 border-destructive bg-destructive/10 p-8 text-center">
        <p className="text-2xl font-bold text-destructive">Credencial no válida</p>
      </div>
    );
  }
  const { datos, fotoUrl } = estado;
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-success bg-card text-center shadow-sm">
      <div className="bg-success px-4 py-2 text-sm font-semibold text-success-foreground">
        Credencial válida
      </div>
      <div className="p-6">
        <img
          src={fotoUrl}
          alt={`Foto de ${datos.nombre_completo}`}
          className="mx-auto aspect-square w-56 max-w-full rounded-xl bg-muted object-cover"
        />
        <p className="mt-4 text-2xl font-semibold leading-tight">{datos.nombre_completo}</p>
        <p className="mt-2 inline-block rounded-full bg-primary px-4 py-1 text-sm font-medium text-primary-foreground">
          {NOMBRE_ROL[datos.rol]}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          <Reloj />
        </p>
      </div>
    </div>
  );
}
