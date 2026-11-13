import type { SuscripcionResponse } from "@club-colina/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { AlertTriangle, CreditCard, RefreshCw, Wallet } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, PageHeader } from "@/components/panel/ui";
import { api, mensajeDeError, reintentar } from "@/lib/api";
import {
  CLAVE_AVISO_SUSCRIPCION,
  CLAVE_SUSCRIPCION,
  esUrlDeFlow,
  formatoFecha,
  formatoMonto,
  mensajeResultado,
  TEXTO_ESTADO_COBRO,
} from "./suscripcion";

const CAMPO =
  "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-secondary/60";

/**
 * Suscripción mensual del club a la plataforma (DYNAMIX AI SpA), con cargo automático en Flow.
 * El estado se lee de Flow en el momento; si Flow no responde, la página lo dice y nada más se
 * bloquea. Sin "Cancelar suscripción" ni cambio de plan.
 */
export function SuscripcionPage() {
  const { resultado } = useSearch({ from: "/_panel/suscripcion" });
  const queryClient = useQueryClient();
  const consulta = useQuery({
    queryKey: CLAVE_SUSCRIPCION,
    queryFn: ({ signal }) => api.suscripcion.estado(signal),
    retry: reintentar,
  });

  function actualizar() {
    void queryClient.invalidateQueries({ queryKey: CLAVE_SUSCRIPCION });
    void queryClient.invalidateQueries({ queryKey: CLAVE_AVISO_SUSCRIPCION });
  }

  const datos = consulta.data;
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Suscripción"
        subtitle="Suscripción mensual del club a la plataforma, con cargo automático en Flow."
        icon={<Wallet className="size-5" />}
        actions={
          datos?.modo === "sandbox" ? <Badge tone="warning">Modo de prueba</Badge> : undefined
        }
      />

      {resultado && (
        <p
          role={resultado === "ok" ? "status" : "alert"}
          className={`rounded-lg px-4 py-3 text-sm ${resultado === "ok" ? "bg-success/10" : "bg-destructive/10 text-destructive"}`}
        >
          {mensajeResultado(resultado)}
        </p>
      )}

      {consulta.isPending ? (
        <Card>
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </Card>
      ) : consulta.isError ? (
        <MensajeSimple texto={mensajeDeError(consulta.error)} />
      ) : (
        <Contenido datos={consulta.data} alCambiar={actualizar} />
      )}
    </div>
  );
}

function MensajeSimple({ texto }: { texto: string }) {
  return (
    <Card>
      <p className="text-sm text-muted-foreground">{texto}</p>
    </Card>
  );
}

function Contenido({ datos, alCambiar }: { datos: SuscripcionResponse; alCambiar: () => void }) {
  switch (datos.estado) {
    case "pendiente_configuracion":
      return (
        <MensajeSimple texto="La suscripción está pendiente de configuración. El resto del panel funciona normalmente." />
      );
    case "no_disponible":
      return (
        <MensajeSimple texto="No pudimos consultar Flow en este momento. El resto del panel funciona normalmente; intenta más tarde." />
      );
    case "sin_tarjeta":
      return <SinTarjeta datos={datos} />;
    case "activa":
    case "cobro_fallido":
      return <Activa datos={datos} alCambiar={alCambiar} />;
  }
}

/** Lleva el navegador a Flow para inscribir (o cambiar) la tarjeta. */
function useInscribir() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string | undefined) => {
      const { url } = await api.suscripcion.inscribirTarjeta(email ? { email } : {});
      if (!esUrlDeFlow(url)) throw new Error("Dirección inesperada");
      return url;
    },
    onSuccess: (url) => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_AVISO_SUSCRIPCION });
      window.location.assign(url);
    },
  });
}

function SinTarjeta({ datos }: { datos: SuscripcionResponse }) {
  const [email, setEmail] = useState("");
  const inscribir = useInscribir();

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (inscribir.isPending || email.trim() === "") return;
    inscribir.mutate(email.trim());
  }

  return (
    <Card>
      {datos.plan && (
        <div className="mb-4">
          <div className="text-sm text-muted-foreground">{datos.plan.nombre}</div>
          <div className="text-2xl font-semibold">
            {formatoMonto(datos.plan)}{" "}
            <span className="text-sm font-normal text-muted-foreground">mensual, IVA incluido</span>
          </div>
        </div>
      )}
      <p className="mb-4 text-sm">
        El cargo es automático y mensual, a partir del día en que inscribas la tarjeta.
      </p>
      <form onSubmit={enviar} noValidate>
        <label className="block text-sm font-medium" htmlFor="email-suscripcion">
          Correo para los avisos de Flow
        </label>
        <input
          id="email-suscripcion"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={CAMPO}
          required
        />
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          Usa un correo del club (por ejemplo, el de tesorería), no uno personal: ahí llegan los
          comprobantes.
        </p>
        {inscribir.isError && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {mensajeDeError(inscribir.error)}
          </p>
        )}
        <Button type="submit" disabled={inscribir.isPending || email.trim() === ""}>
          <CreditCard className="size-4" />
          {inscribir.isPending ? "Abriendo Flow…" : "Inscribir tarjeta"}
        </Button>
      </form>
    </Card>
  );
}

function Activa({ datos, alCambiar }: { datos: SuscripcionResponse; alCambiar: () => void }) {
  const inscribir = useInscribir();
  const reintento = useMutation({
    mutationFn: () => api.suscripcion.reintentar(),
    onSettled: alCambiar,
  });
  const fallido = datos.estado === "cobro_fallido";
  const botonCambiar = (
    <Button
      variant="outline"
      disabled={inscribir.isPending}
      onClick={() => inscribir.mutate(undefined)}
    >
      <CreditCard className="size-4" />
      {inscribir.isPending ? "Abriendo Flow…" : "Cambiar tarjeta"}
    </Button>
  );

  return (
    <>
      {fallido && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              El último cobro de la suscripción no se pudo hacer. Cambia la tarjeta o reintenta el
              cobro. El panel sigue funcionando normalmente.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {botonCambiar}
            <Button
              variant="primary"
              disabled={reintento.isPending}
              onClick={() => reintento.mutate()}
            >
              <RefreshCw className="size-4" />
              {reintento.isPending ? "Reintentando…" : "Reintentar cobro"}
            </Button>
          </div>
          {reintento.isSuccess && (
            <p role="status" className="mt-3 text-sm">
              {reintento.data.resultado === "pagado"
                ? "Cobro realizado."
                : "Flow volvió a rechazar el cobro. Prueba cambiando la tarjeta."}
            </p>
          )}
          {reintento.isError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {mensajeDeError(reintento.error)}
            </p>
          )}
        </div>
      )}

      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Dato titulo="Estado">
            <Badge tone={fallido ? "danger" : "success"}>
              {fallido ? "Cobro fallido" : "Activa"}
            </Badge>
          </Dato>
          <Dato titulo="Monto mensual">
            {datos.plan ? `${formatoMonto(datos.plan)} (IVA incluido)` : "—"}
          </Dato>
          <Dato titulo="Próximo cobro">
            {datos.proximo_cobro ? formatoFecha(datos.proximo_cobro) : "—"}
          </Dato>
          <Dato titulo="Tarjeta">
            {datos.tarjeta ? `${datos.tarjeta.tipo} terminada en ${datos.tarjeta.ultimos4}` : "—"}
          </Dato>
        </dl>
        {!fallido && <div className="mt-4">{botonCambiar}</div>}
        {inscribir.isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {mensajeDeError(inscribir.error)}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Historial de cobros</h2>
        {datos.historial.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay cobros.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Fecha</th>
                <th className="pb-2 font-medium">Monto</th>
                <th className="pb-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.historial.map((c, i) => (
                <tr key={`${c.fecha}-${i}`} className="border-t">
                  <td className="py-2">{formatoFecha(c.fecha)}</td>
                  <td className="py-2">
                    {datos.plan ? formatoMonto({ ...datos.plan, monto: c.monto }) : c.monto}
                  </td>
                  <td className="py-2">
                    <Badge
                      tone={
                        c.estado === "pagado"
                          ? "success"
                          : c.estado === "fallido"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {TEXTO_ESTADO_COBRO[c.estado]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}
