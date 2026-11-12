import { DISCIPLINAS, type EntrenadorDetalle } from "@club-colina/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { Campo, CampoSelect, Dato } from "@/components/panel/campos";
import { Credencial } from "@/components/panel/Credencial";
import { EstadoBadge } from "@/components/panel/persona";
import { SubirFoto } from "@/components/panel/SubirFoto";
import { TEXTO_DISCIPLINA, textoFechaHora } from "@/components/panel/textos";
import { Button, PageHeader } from "@/components/panel/ui";
import { api, mensajeDeError } from "@/lib/api";
import { cambiosEntrenador, formEntrenador, type FormEntrenadorFicha } from "./edicion";

export function EntrenadorPage() {
  const { id } = useParams({ from: "/_panel/entrenadores/$id" });
  const consulta = useQuery({
    queryKey: ["panel", "entrenador", id],
    queryFn: ({ signal }) => api.panel.entrenador(id, signal),
  });
  const [generacion, setGeneracion] = useState(0);

  return (
    <div>
      <Link
        to="/entrenadores"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Entrenadores
      </Link>
      {consulta.data === undefined ? (
        consulta.isError ? (
          <p role="alert" className="card-surface p-5 text-sm text-destructive">
            {mensajeDeError(consulta.error)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        )
      ) : (
        <FichaEntrenador
          key={`${consulta.data.id}-${generacion}`}
          e={consulta.data}
          alGuardar={() => setGeneracion((g) => g + 1)}
        />
      )}
    </div>
  );
}

function FichaEntrenador({ e, alGuardar }: { e: EntrenadorDetalle; alGuardar: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormEntrenadorFicha>(() => formEntrenador(e));
  const [errores, setErrores] = useState<string[]>([]);
  const guardar = useMutation({
    mutationFn: (datos: Parameters<typeof api.panel.editarEntrenador>[1]) =>
      api.panel.editarEntrenador(e.id, datos),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["panel"] });
      alGuardar();
    },
  });
  const cambiar = (c: Partial<FormEntrenadorFicha>) => setForm((f) => ({ ...f, ...c }));
  const nombre = `${e.nombre} ${e.apellido}`;

  function enviar() {
    const r = cambiosEntrenador(e, form);
    if (!r.ok) return setErrores(r.errores);
    setErrores([]);
    guardar.mutate(r.datos);
  }

  return (
    <div>
      <PageHeader
        title={nombre}
        subtitle="Ficha del entrenador"
        actions={<EstadoBadge estado={e.estado} />}
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
            <CampoSelect
              id="disciplina"
              etiqueta="Disciplina"
              valor={form.disciplina}
              onChange={(v) => cambiar({ disciplina: v })}
              opciones={DISCIPLINAS.map((d) => [d, TEXTO_DISCIPLINA[d]] as const)}
            />
          </div>
          {(errores.length > 0 || guardar.isError) && (
            <div
              role="alert"
              className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {errores.length > 0
                ? errores.map((x) => <div key={x}>{x}</div>)
                : mensajeDeError(guardar.error)}
            </div>
          )}
          <div className="mt-5 flex items-center gap-3">
            <Button onClick={enviar} disabled={guardar.isPending}>
              <Save className="size-4" /> {guardar.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setForm(formEntrenador(e))}
              disabled={guardar.isPending}
            >
              Deshacer
            </Button>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <Dato etiqueta="Creado">{textoFechaHora(e.creado_en)}</Dato>
            <Dato etiqueta="Actualizado">{textoFechaHora(e.actualizado_en)}</Dato>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card-surface p-4">
            <SubirFoto tipo="entrenadores" id={e.id} tieneFoto={e.tiene_foto} />
          </div>
          <Credencial
            tipo="entrenadores"
            id={e.id}
            nombre={nombre}
            estado={e.estado}
            credencialToken={e.credencial_token}
          />
        </div>
      </div>
    </div>
  );
}
