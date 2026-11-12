import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { mensajeError } from "./api";
import { Aviso } from "./Marco";
import { CampoFoto } from "./registro/CampoFoto";
import { Casilla } from "./registro/campos";

/** Link personal del otro apoderado: sube su foto para activar su credencial. */
export function FormularioCompletar({
  token,
  primerNombre,
  onSubida,
}: {
  token: string;
  primerNombre: string;
  onSubida: () => void;
}) {
  const [foto, setFoto] = useState<File | null>(null);
  const [consentimiento, setConsentimiento] = useState(false);
  const [errores, setErrores] = useState<{ foto?: string; consentimiento?: string }>({});
  const [falla, setFalla] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const e = {
      ...(foto ? {} : { foto: "Falta la foto." }),
      ...(consentimiento ? {} : { consentimiento: "Necesitamos tu autorización para continuar." }),
    };
    setErrores(e);
    if (!foto || !consentimiento) return;
    setFalla(null);
    setEnviando(true);
    try {
      await api.publico.enviarCompletar(token, foto);
      onSubida();
    } catch (err) {
      setFalla(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Hola, {primerNombre}. Te registraron como apoderado en el Club Colina. Sube tu foto para que
        el club pueda activar tu credencial.
      </p>
      <CampoFoto etiqueta="Tu foto" foto={foto} onCambio={setFoto} error={errores.foto} />
      <Casilla marcada={consentimiento} onCambio={setConsentimiento} error={errores.consentimiento}>
        Autorizo al Club Colina a usar estos datos y mi foto para identificarme al entrar a sus
        actividades.
      </Casilla>
      {falla && <Aviso tono="error">{falla}</Aviso>}
      <Button type="submit" size="lg" className="w-full" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar foto"}
      </Button>
    </form>
  );
}
