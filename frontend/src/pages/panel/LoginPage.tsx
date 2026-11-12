import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/panel/ui";
import { mensajeLogin } from "./login";
import { CLAVE_SESION } from "./sesion";

export function LoginPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");

  const ingresar = useMutation({
    mutationFn: () => api.auth.login({ usuario, password }),
    onSuccess: async (respuesta) => {
      setPassword("");
      queryClient.setQueryData(CLAVE_SESION, respuesta.usuario);
      await navigate({ to: "/" });
    },
    onError: () => setPassword(""),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !password || ingresar.isPending) return;
    ingresar.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={enviar} className="card-surface w-full max-w-sm p-6" noValidate>
        <div className="mb-6 text-center">
          <div className="text-xl font-bold tracking-tight">Club Colina</div>
          <p className="mt-1 text-sm text-muted-foreground">Ingresa al panel del club</p>
        </div>

        <label className="block text-sm font-medium" htmlFor="usuario">
          Usuario
        </label>
        <input
          id="usuario"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="mt-1 mb-4 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-secondary/60"
          required
        />

        <label className="block text-sm font-medium" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 mb-4 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-secondary/60"
          required
        />

        {ingresar.isError && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {mensajeLogin(ingresar.error)}
          </p>
        )}

        <Button
          type="submit"
          className="w-full justify-center"
          disabled={!usuario.trim() || !password || ingresar.isPending}
        >
          <LogIn className="size-4" />
          {ingresar.isPending ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
    </div>
  );
}
