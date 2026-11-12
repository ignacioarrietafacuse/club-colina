import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Button, PageHeader } from "@/components/panel/ui";
import { mensajeCambiarClave, problemaClave } from "./clave";
import { CLAVE_SESION } from "./sesion";

const CAMPO =
  "mt-1 mb-4 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-secondary/60";

/**
 * Cambiar la clave del usuario con sesión. Es también la pantalla obligatoria del primer ingreso
 * con una clave temporal: la guarda del panel no deja ir a otra hasta cambiarla.
 */
export function CambiarClavePage() {
  const { usuario } = useRouteContext({ from: "/_panel" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [problema, setProblema] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const cambiar = useMutation({
    mutationFn: () => api.auth.cambiarClave({ clave_actual: actual, clave_nueva: nueva }),
    onSuccess: async () => {
      setActual("");
      setNueva("");
      setRepetida("");
      setListo(true);
      queryClient.setQueryData(CLAVE_SESION, { ...usuario, debe_cambiar_clave: false });
      // La guarda vuelve a leer la sesión con la marca apagada.
      if (usuario.debe_cambiar_clave) await navigate({ to: "/" });
    },
    onError: () => setActual(""),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (cambiar.isPending) return;
    setListo(false);
    const p = problemaClave(actual, nueva, repetida);
    setProblema(p);
    if (p) return;
    cambiar.mutate();
  }

  return (
    <div className="max-w-md">
      <PageHeader
        title="Cambiar clave"
        subtitle={
          usuario.debe_cambiar_clave
            ? "Entraste con una clave temporal. Elige una clave tuya para seguir."
            : "Al cambiarla se cierran tus sesiones abiertas en otros dispositivos."
        }
        icon={<KeyRound className="size-5" />}
      />
      <form onSubmit={enviar} className="card-surface p-6" noValidate>
        <label className="block text-sm font-medium" htmlFor="clave-actual">
          Clave actual
        </label>
        <input
          id="clave-actual"
          type="password"
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          className={CAMPO}
          required
        />
        <label className="block text-sm font-medium" htmlFor="clave-nueva">
          Clave nueva (mínimo 12 caracteres)
        </label>
        <input
          id="clave-nueva"
          type="password"
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          className={CAMPO}
          required
        />
        <label className="block text-sm font-medium" htmlFor="clave-repetida">
          Repite la clave nueva
        </label>
        <input
          id="clave-repetida"
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          className={CAMPO}
          required
        />

        {(problema ?? cambiar.isError) && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {problema ?? mensajeCambiarClave(cambiar.error)}
          </p>
        )}
        {listo && (
          <p role="status" className="mb-4 rounded-lg bg-success/10 px-3 py-2 text-sm">
            Clave cambiada. Tus otras sesiones se cerraron.
          </p>
        )}

        <Button type="submit" disabled={cambiar.isPending} className="w-full justify-center">
          <KeyRound className="size-4" />
          {cambiar.isPending ? "Cambiando…" : "Cambiar clave"}
        </Button>
      </form>
    </div>
  );
}
