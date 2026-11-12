import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { useId, useState } from "react";
import { api, mensajeDeError, type TipoPersona } from "@/lib/api";
import { comprimirFoto, ErrorFoto } from "./foto";
import { FotoPersona } from "./persona";

/**
 * Versión de la foto por persona, fuera del componente: si la ficha se vuelve a montar (al
 * guardar), la imagen sigue pidiéndose con la versión nueva y no reaparece la anterior.
 */
const versiones = new Map<string, number>();

/** Foto de la ficha y botón para cambiarla (Mony puede completarla sin esperar a la familia). */
export function SubirFoto({
  tipo,
  id,
  tieneFoto,
}: {
  tipo: TipoPersona;
  id: string;
  tieneFoto: boolean;
}) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const llave = `${tipo}:${id}`;
  const [version, setVersion] = useState(() => versiones.get(llave) ?? 0);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const subir = useMutation({
    mutationFn: async (archivo: File) =>
      api.panel.subirFoto(tipo, id, await comprimirFoto(archivo)),
    onSuccess: async () => {
      const nueva = Date.now();
      versiones.set(llave, nueva);
      setVersion(nueva);
      await queryClient.invalidateQueries({ queryKey: ["panel"] });
    },
    onError: (error) => setErrorLocal(error instanceof ErrorFoto ? error.message : null),
  });

  return (
    <div className="flex flex-col items-start gap-2">
      <FotoPersona
        tipo={tipo}
        id={id}
        tieneFoto={tieneFoto || version > 0}
        tamano={128}
        version={version}
      />
      <label
        htmlFor={inputId}
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        <Camera className="size-4" />
        {subir.isPending ? "Subiendo…" : tieneFoto ? "Cambiar foto" : "Subir foto"}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={subir.isPending}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = "";
          setErrorLocal(null);
          if (archivo) subir.mutate(archivo);
        }}
      />
      {subir.isError && (
        <p role="alert" className="text-xs text-destructive">
          {errorLocal ?? mensajeDeError(subir.error)}
        </p>
      )}
    </div>
  );
}
