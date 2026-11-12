import { METODOS_PAGO, type ApoderadoDetalle } from "@club-colina/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { Campo, CampoSelect, Dato } from "@/components/panel/campos";
import { Credencial } from "@/components/panel/Credencial";
import { EstadoBadge } from "@/components/panel/persona";
import { SubirFoto } from "@/components/panel/SubirFoto";
import {
  nombreCompleto,
  TEXTO_METODO_PAGO,
  textoFaltantes,
  textoFechaHora,
} from "@/components/panel/textos";
import { Badge, Button, PageHeader } from "@/components/panel/ui";
import { api, mensajeDeError } from "@/lib/api";
import { cambiosApoderado, formApoderado, type FormApoderadoFicha } from "./edicion";

export function ApoderadoPage() {
  const { id } = useParams({ from: "/_panel/apoderados/$id" });
  const consulta = useQuery({
    queryKey: ["panel", "apoderado", id],
    queryFn: ({ signal }) => api.panel.apoderado(id, signal),
  });
  const [generacion, setGeneracion] = useState(0);

  return (
    <div>
      <Link
        to="/apoderados"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Apoderados
      </Link>
      {consulta.isError ? (
        <p role="alert" className="card-surface p-5 text-sm text-destructive">
          {mensajeDeError(consulta.error)}
        </p>
      ) : consulta.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <FichaApoderado
          key={generacion}
          a={consulta.data}
          alGuardar={async () => {
            await consulta.refetch();
            setGeneracion((g) => g + 1);
          }}
        />
      )}
    </div>
  );
}

function FichaApoderado({ a, alGuardar }: { a: ApoderadoDetalle; alGuardar: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormApoderadoFicha>(() => formApoderado(a));
  const [errores, setErrores] = useState<string[]>([]);
  const guardar = useMutation({
    mutationFn: (datos: Parameters<typeof api.panel.editarApoderado>[1]) =>
      api.panel.editarApoderado(a.id, datos),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["panel"] });
      await alGuardar();
    },
  });
  const cambiar = (c: Partial<FormApoderadoFicha>) => setForm((f) => ({ ...f, ...c }));
  const nombre = nombreCompleto(a);

  function enviar() {
    const r = cambiosApoderado(a, form);
    if (!r.ok) return setErrores(r.errores);
    setErrores([]);
    guardar.mutate(r.datos);
  }

  return (
    <div>
      <PageHeader
        title={nombre}
        subtitle={`Ficha del apoderado · ${a.origen === "base_2026" ? "Base 2026" : "Formulario"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <EstadoBadge estado={a.estado} />
            {a.faltantes.length > 0 && (
              <Badge tone="danger">Falta: {textoFaltantes(a.faltantes)}</Badge>
            )}
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo
              id="nombre"
              etiqueta="Nombre"
              valor={form.nombre}
              onChange={(v) => cambiar({ nombre: v })}
            />
            <Campo
              id="apellido"
              etiqueta="Apellido"
              valor={form.apellido}
              onChange={(v) => cambiar({ apellido: v })}
            />
            <Campo id="rut" etiqueta="RUT" valor={form.rut} onChange={(v) => cambiar({ rut: v })} />
            <Campo
              id="telefono"
              etiqueta="Teléfono"
              tipo="tel"
              valor={form.telefono}
              onChange={(v) => cambiar({ telefono: v })}
            />
            <Campo
              id="email"
              etiqueta="Correo"
              tipo="email"
              valor={form.email}
              onChange={(v) => cambiar({ email: v })}
            />
            <CampoSelect
              id="metodo"
              etiqueta="Método de pago"
              valor={form.metodo_pago}
              onChange={(v) => cambiar({ metodo_pago: v })}
              opciones={METODOS_PAGO.map((m) => [m, TEXTO_METODO_PAGO[m]] as const)}
              vacio="Sin definir"
            />
          </div>
          {(errores.length > 0 || guardar.isError) && (
            <div
              role="alert"
              className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {errores.length > 0
                ? errores.map((e) => <div key={e}>{e}</div>)
                : mensajeDeError(guardar.error)}
            </div>
          )}
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={enviar} disabled={guardar.isPending}>
              <Save className="size-4" /> {guardar.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setForm(formApoderado(a))}
              disabled={guardar.isPending}
            >
              Deshacer
            </Button>
          </div>

          <h2 className="mt-8 mb-3 text-sm font-semibold text-muted-foreground">Jugadores</h2>
          {a.jugadores.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin jugadores vinculados.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {a.jugadores.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Link
                    to="/jugadores/$id"
                    params={{ id: j.id }}
                    className="font-medium hover:underline"
                  >
                    {j.nombre_completo}
                  </Link>
                  {j.paga_mensualidad && <Badge tone="info">Paga su mensualidad</Badge>}
                  <Badge tone={j.estado_vinculo === "activo" ? "success" : "warning"}>
                    Vínculo {j.estado_vinculo === "activo" ? "activo" : "pendiente"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <Dato etiqueta="Creado">{textoFechaHora(a.creado_en)}</Dato>
            <Dato etiqueta="Actualizado">{textoFechaHora(a.actualizado_en)}</Dato>
            {a.solicitud_id && (
              <Dato etiqueta="Solicitud">
                <Link
                  to="/jugadores/solicitudes/$id"
                  params={{ id: a.solicitud_id }}
                  className="text-secondary hover:underline"
                >
                  Ver solicitud
                </Link>
              </Dato>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card-surface p-4">
            <SubirFoto tipo="apoderados" id={a.id} tieneFoto={a.tiene_foto} />
          </div>
          <Credencial
            tipo="apoderados"
            id={a.id}
            nombre={nombre}
            estado={a.estado}
            credencialToken={a.credencial_token}
          />
        </div>
      </div>
    </div>
  );
}
