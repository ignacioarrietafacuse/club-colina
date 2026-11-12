import type { CredencialResponse } from "@club-colina/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NOMBRE_ROL } from "./textos";

export type EstadoCredencial =
  | { tipo: "cargando" }
  | { tipo: "valida"; datos: CredencialResponse; fotoUrl: string; verificadaEn: Date }
  | { tipo: "no_valida" }
  | { tipo: "vencida" }
  | { tipo: "demasiados_intentos" }
  | { tipo: "error" };

function Reintentar({ onReintentar }: { onReintentar?: () => void }) {
  if (!onReintentar) return null;
  return (
    <Button type="button" variant="outline" className="mt-4" onClick={onReintentar}>
      Volver a verificar
    </Button>
  );
}

function SinVerificar({
  titulo,
  texto,
  onReintentar,
}: {
  titulo: string;
  texto: string;
  onReintentar?: () => void;
}) {
  return (
    <div className="rounded-2xl border p-6 text-center">
      <p className="text-lg font-semibold">{titulo}</p>
      <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
      <Reintentar onReintentar={onReintentar} />
    </div>
  );
}

/**
 * Lo que ve quien controla la entrada al escanear un QR: foto, nombre y rol, y nada más.
 * Cualquier cosa que no sea una respuesta válida y reciente, con la foto cargada, no es verde.
 */
export function VistaCredencial({
  estado,
  onReintentar,
}: {
  estado: EstadoCredencial;
  onReintentar?: () => void;
}) {
  const [fotoFallo, setFotoFallo] = useState(false);
  const [fotoCargada, setFotoCargada] = useState(false);

  switch (estado.tipo) {
    case "cargando":
      return <p className="py-16 text-center text-sm text-muted-foreground">Verificando…</p>;
    case "error":
      return (
        <SinVerificar
          titulo="No pudimos verificar"
          texto="Revisa la conexión a internet y vuelve a escanear el código."
          onReintentar={onReintentar}
        />
      );
    case "demasiados_intentos":
      return (
        <SinVerificar
          titulo="No pudimos verificar"
          texto="Se hicieron muchas verificaciones seguidas. Espera un minuto y vuelve a intentar."
          onReintentar={onReintentar}
        />
      );
    case "vencida":
      return (
        <SinVerificar
          titulo="Vuelve a escanear"
          texto="Esta verificación ya no es reciente."
          onReintentar={onReintentar}
        />
      );
    case "no_valida":
      return (
        <div className="rounded-2xl border-2 border-destructive bg-destructive/10 p-8 text-center">
          <p className="text-2xl font-bold text-destructive">Credencial no válida</p>
        </div>
      );
    case "valida":
      break;
  }

  const { datos, fotoUrl, verificadaEn } = estado;
  // Sin foto no hay con qué comparar la cara: no se muestra en verde.
  if (fotoFallo) {
    return (
      <SinVerificar
        titulo="No pudimos verificar"
        texto="No se pudo cargar la foto. Vuelve a escanear el código."
        onReintentar={onReintentar}
      />
    );
  }
  return (
    <div
      className={`overflow-hidden rounded-2xl border-2 bg-card text-center shadow-sm ${
        fotoCargada ? "border-success" : "border-border"
      }`}
    >
      <div
        className={`px-4 py-2 text-sm font-semibold ${
          fotoCargada ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {fotoCargada ? "Credencial válida" : "Cargando foto…"}
      </div>
      <div className="p-6">
        <img
          src={fotoUrl}
          alt={`Foto de ${datos.nombre_completo}`}
          onLoad={() => setFotoCargada(true)}
          onError={() => setFotoFallo(true)}
          className="mx-auto aspect-square w-56 max-w-full rounded-xl bg-muted object-cover"
        />
        <p className="mt-4 text-2xl font-semibold leading-tight">{datos.nombre_completo}</p>
        <p className="mt-2 inline-block rounded-full bg-primary px-4 py-1 text-sm font-medium text-primary-foreground">
          {NOMBRE_ROL[datos.rol]}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Verificado a las{" "}
          <time dateTime={verificadaEn.toISOString()} className="tabular-nums">
            {verificadaEn.toLocaleTimeString("es-CL")}
          </time>
        </p>
      </div>
    </div>
  );
}
