import {
  DISCIPLINAS,
  METODOS_PAGO,
  type CategoriaPanel,
  type JugadorDetalle,
} from "@club-colina/shared";
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
  TEXTO_DISCIPLINA,
  TEXTO_METODO_PAGO,
  textoFaltantes,
  textoFecha,
  textoFechaHora,
} from "@/components/panel/textos";
import { Badge, Button, PageHeader } from "@/components/panel/ui";
import { api, mensajeDeError } from "@/lib/api";
import {
  cambiosJugador,
  categoriaAlCambiarDisciplina,
  formJugador,
  type FormJugadorFicha,
} from "./edicion";

export function JugadorPage() {
  const { id } = useParams({ from: "/_panel/jugadores/$id" });
  const consulta = useQuery({
    queryKey: ["panel", "jugador", id],
    queryFn: ({ signal }) => api.panel.jugador(id, signal),
  });
  const categorias = useQuery({
    queryKey: ["panel", "categorias"],
    queryFn: ({ signal }) => api.panel.categorias(signal),
    staleTime: 5 * 60_000,
  });
  // Como en las solicitudes: el formulario se rehace solo después de guardar.
  const [generacion, setGeneracion] = useState(0);

  return (
    <div>
      <Link
        to="/jugadores"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Jugadores
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
        <>
          {/* Una recarga que falla con la ficha ya cargada avisa sin borrar lo que se edita. */}
          {consulta.isError && (
            <p role="alert" className="mb-4 rounded-lg bg-warning/15 px-4 py-3 text-sm">
              No se pudo actualizar la ficha: {mensajeDeError(consulta.error)}
            </p>
          )}
          <FichaJugador
            key={`${consulta.data.id}-${generacion}`}
            j={consulta.data}
            categorias={categorias.data}
            estadoCategorias={
              categorias.isError ? "error" : categorias.isPending ? "cargando" : "ok"
            }
            alGuardar={() => setGeneracion((g) => g + 1)}
          />
        </>
      )}
    </div>
  );
}

function FichaJugador({
  j,
  categorias,
  estadoCategorias,
  alGuardar,
}: {
  j: JugadorDetalle;
  categorias: CategoriaPanel[] | undefined;
  estadoCategorias: "cargando" | "error" | "ok";
  alGuardar: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormJugadorFicha>(() => formJugador(j));
  const [errores, setErrores] = useState<string[]>([]);
  const guardar = useMutation({
    mutationFn: (datos: Parameters<typeof api.panel.editarJugador>[1]) =>
      api.panel.editarJugador(j.id, datos),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["panel"] });
      alGuardar();
    },
  });
  const cambiar = (c: Partial<FormJugadorFicha>) => setForm((f) => ({ ...f, ...c }));
  const nombre = nombreCompleto(j);
  const delaDisciplina = (categorias ?? []).filter((c) => c.disciplina === form.disciplina);

  function enviar() {
    const r = cambiosJugador(j, form);
    if (!r.ok) return setErrores(r.errores);
    setErrores([]);
    guardar.mutate(r.datos);
  }

  return (
    <div>
      <PageHeader
        title={nombre}
        subtitle={`Ficha del jugador · ${j.origen === "base_2026" ? "Base 2026" : "Formulario"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <EstadoBadge estado={j.estado} />
            {j.faltantes.length > 0 && (
              <Badge tone="danger">Falta: {textoFaltantes(j.faltantes)}</Badge>
            )}
            {j.marcado_retiro_en && (
              <Badge tone="danger">
                Marcado «ya no está» el {textoFechaHora(j.marcado_retiro_en)}
              </Badge>
            )}
          </div>
        }
      />

      {j.marcado_retiro_en && <MarcaRetiro jugadorId={j.id} />}

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
              id="fecha"
              etiqueta="Fecha de nacimiento"
              tipo="date"
              valor={form.fecha_nacimiento}
              onChange={(v) => cambiar({ fecha_nacimiento: v })}
              ayuda={j.edad !== null ? `${j.edad} años` : undefined}
            />
            <CampoSelect
              id="disciplina"
              etiqueta="Disciplina"
              valor={form.disciplina}
              onChange={(v) =>
                cambiar({
                  disciplina: v,
                  categoria_id: categoriaAlCambiarDisciplina(j, form.categoria_id, v, categorias),
                })
              }
              opciones={DISCIPLINAS.map((d) => [d, TEXTO_DISCIPLINA[d]] as const)}
            />
            <CampoSelect
              id="categoria"
              etiqueta="Categoría"
              valor={categorias ? form.categoria_id : ""}
              onChange={(v) => cambiar({ categoria_id: v })}
              opciones={delaDisciplina.map((c) => [String(c.id), c.nombre] as const)}
              vacio={
                estadoCategorias === "ok"
                  ? "Sin categoría"
                  : estadoCategorias === "cargando"
                    ? "Cargando…"
                    : "No se pudieron cargar"
              }
            />
            <Campo
              id="numero"
              etiqueta="Número de camiseta"
              inputMode="numeric"
              valor={form.numero_camiseta}
              onChange={(v) => cambiar({ numero_camiseta: v })}
              ayuda="99 = sin número asignado. «0» y «00» son distintos."
            />
            <Campo
              id="telefono"
              etiqueta="Teléfono"
              tipo="tel"
              valor={form.telefono}
              onChange={(v) => cambiar({ telefono: v })}
              ayuda={j.apoderados.length === 0 ? "Obligatorio en jugadores adultos." : undefined}
            />
            <Campo
              id="email"
              etiqueta="Correo"
              tipo="email"
              valor={form.email}
              onChange={(v) => cambiar({ email: v })}
            />
            {j.apoderados.length === 0 && (
              <CampoSelect
                id="metodo"
                etiqueta="Método de pago"
                valor={form.metodo_pago}
                onChange={(v) => cambiar({ metodo_pago: v })}
                opciones={METODOS_PAGO.map((m) => [m, TEXTO_METODO_PAGO[m]] as const)}
                vacio="Sin definir"
              />
            )}
          </div>

          <h2 className="mt-6 mb-3 text-sm font-semibold text-muted-foreground">
            Becas (solo panel)
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.postula_beca}
                onChange={(e) => cambiar({ postula_beca: e.target.checked })}
              />
              Postula a beca
            </label>
            <Campo
              id="bm"
              etiqueta="Mensualidad"
              inputMode="numeric"
              sufijo="%"
              valor={form.beca_mensualidad_pct}
              onChange={(v) => cambiar({ beca_mensualidad_pct: v })}
            />
            <Campo
              id="bt"
              etiqueta="Torneos"
              inputMode="numeric"
              sufijo="%"
              valor={form.beca_torneos_pct}
              onChange={(v) => cambiar({ beca_torneos_pct: v })}
            />
            <Campo
              id="bc"
              etiqueta="Campus y clínicas"
              inputMode="numeric"
              sufijo="%"
              valor={form.beca_campus_pct}
              onChange={(v) => cambiar({ beca_campus_pct: v })}
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
              onClick={() => setForm(formJugador(j))}
              disabled={guardar.isPending}
            >
              Deshacer
            </Button>
          </div>

          <h2 className="mt-8 mb-3 text-sm font-semibold text-muted-foreground">Apoderados</h2>
          {j.apoderados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin apoderados (jugador adulto).</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {j.apoderados.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Link
                    to="/apoderados/$id"
                    params={{ id: a.id }}
                    className="font-medium hover:underline"
                  >
                    {a.nombre_completo}
                  </Link>
                  {a.paga_mensualidad && <Badge tone="info">Paga la mensualidad</Badge>}
                  <Badge tone={a.estado_vinculo === "activo" ? "success" : "warning"}>
                    Vínculo {a.estado_vinculo === "activo" ? "activo" : "pendiente"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <Dato etiqueta="Nacimiento">{textoFecha(j.fecha_nacimiento)}</Dato>
            <Dato etiqueta="Creado">{textoFechaHora(j.creado_en)}</Dato>
            <Dato etiqueta="Actualizado">{textoFechaHora(j.actualizado_en)}</Dato>
            {j.solicitud_id && (
              <Dato etiqueta="Solicitud">
                <Link
                  to="/jugadores/solicitudes/$id"
                  params={{ id: j.solicitud_id }}
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
            <SubirFoto tipo="jugadores" id={j.id} tieneFoto={j.tiene_foto} />
          </div>
          <Credencial
            tipo="jugadores"
            id={j.id}
            nombre={nombre}
            estado={j.estado}
            credencialToken={j.credencial_token}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Un jugador marcado «ya no está en el club» por un apoderado: Mony confirma el retiro dejándolo
 * inactivo (en la credencial) o quita la marca si sigue. Quitarla no rehace la ficha: no se pierde
 * lo que esté escribiendo.
 */
function MarcaRetiro({ jugadorId }: { jugadorId: string }) {
  const queryClient = useQueryClient();
  const [confirmar, setConfirmar] = useState(false);
  const quitar = useMutation({
    mutationFn: () => api.panel.quitarMarcaRetiro(jugadorId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["panel"] }),
  });
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-warning/15 px-4 py-3 text-sm">
      <span className="flex-1">
        Un apoderado indicó que ya no está en el club. Para confirmar el retiro, desactívalo en la
        credencial. Si sigue en el club, quita la marca.
      </span>
      {quitar.error && (
        <span className="w-full text-destructive">{mensajeDeError(quitar.error)}</span>
      )}
      {confirmar ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            disabled={quitar.isPending}
            onClick={() => setConfirmar(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={quitar.isPending}
            onClick={() => quitar.mutate()}
          >
            {quitar.isPending ? "Quitando…" : "Confirmar: sigue en el club"}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirmar(true)}>
          Quitar la marca
        </Button>
      )}
    </div>
  );
}
