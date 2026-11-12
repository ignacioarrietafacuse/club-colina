import type { EstadoPersona } from "@club-colina/shared";
import { UserRound } from "lucide-react";
import { useState } from "react";
import { api, type TipoPersona } from "@/lib/api";
import { TEXTO_ESTADO, TONO_ESTADO } from "./textos";
import { Badge } from "./ui";

export function EstadoBadge({ estado }: { estado: EstadoPersona }) {
  return <Badge tone={TONO_ESTADO[estado]}>{TEXTO_ESTADO[estado]}</Badge>;
}

/**
 * Foto de una persona, servida por el backend con la sesión (nunca una URL pública).
 * Sin foto, o si no carga, un ícono neutro.
 */
export function FotoPersona({
  tipo,
  id,
  tieneFoto,
  tamano = 56,
  version = 0,
}: {
  tipo: TipoPersona;
  id: string;
  tieneFoto: boolean;
  tamano?: number;
  /** Cambiarlo obliga a volver a pedir la imagen después de subir una nueva. */
  version?: number;
}) {
  const [fallo, setFallo] = useState(false);
  const estilo = { width: tamano, height: tamano };
  if (!tieneFoto || fallo) {
    return (
      <div
        className="grid shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"
        style={estilo}
        aria-label="Sin foto"
      >
        <UserRound className="size-1/2" />
      </div>
    );
  }
  const src = version ? `${api.panel.urlFoto(tipo, id)}?v=${version}` : api.panel.urlFoto(tipo, id);
  return (
    <img
      src={src}
      alt="Foto"
      onError={() => setFallo(true)}
      className="shrink-0 rounded-xl object-cover bg-muted"
      style={estilo}
    />
  );
}
