import { useEffect, useId, useState } from "react";
import { comprimirFoto, ErrorFoto } from "../foto";

/**
 * Elegir o sacar una foto. Se comprime en el teléfono antes de guardarla en el formulario:
 * sube rápido y sin la ubicación ni otros metadatos de la cámara.
 */
export function CampoFoto({
  etiqueta,
  foto,
  onCambio,
  error,
}: {
  etiqueta: string;
  foto: File | null;
  onCambio: (foto: File | null) => void;
  error?: string;
}) {
  const id = useId();
  const [vista, setVista] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  useEffect(() => {
    if (!foto) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(foto);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setFalla(null);
    setProcesando(true);
    try {
      onCambio(await comprimirFoto(archivo));
    } catch (e) {
      setFalla(
        e instanceof ErrorFoto ? e.message : "No pudimos procesar la foto. Prueba con otra.",
      );
    } finally {
      setProcesando(false);
    }
  }

  const mensaje = falla ?? error;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{etiqueta}</p>
      <p className="text-xs text-muted-foreground">
        De frente, con la cara descubierta y buena luz. Se usa para identificarte en la entrada.
      </p>
      <div className="flex items-center gap-4">
        {vista ? (
          <img
            src={vista}
            alt="Foto elegida"
            className="h-24 w-24 rounded-lg border object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
            Sin foto
          </div>
        )}
        <label
          htmlFor={id}
          className="inline-flex h-10 cursor-pointer items-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm"
        >
          {procesando ? "Procesando…" : vista ? "Cambiar foto" : "Elegir foto"}
        </label>
        <input
          id={id}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={procesando}
          aria-invalid={mensaje ? true : undefined}
          onChange={(e) => {
            void elegir(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {mensaje && <p className="text-sm text-destructive">{mensaje}</p>}
    </div>
  );
}
