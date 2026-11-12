import { DISCIPLINAS } from "@club-colina/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { IdCard, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { Campo, CampoSelect } from "@/components/panel/campos";
import { comprimirFoto, ErrorFoto } from "@/components/panel/foto";
import { EstadoBadge, FotoPersona } from "@/components/panel/persona";
import { TEXTO_DISCIPLINA } from "@/components/panel/textos";
import { Badge, Button, PageHeader } from "@/components/panel/ui";
import { api, mensajeDeError } from "@/lib/api";
import { datosEntrenadorNuevo, FORM_ENTRENADOR_VACIO, type FormEntrenadorFicha } from "./edicion";

export function EntrenadoresPage() {
  const [creando, setCreando] = useState(false);
  const [creado, setCreado] = useState(false);
  const consulta = useQuery({
    queryKey: ["panel", "entrenadores"],
    queryFn: ({ signal }) => api.panel.entrenadores(signal),
  });

  return (
    <div>
      <PageHeader
        icon={<IdCard className="size-5" />}
        title="Entrenadores"
        subtitle="Quedan activos al crearlos. Su QR se descarga desde la ficha."
        actions={
          !creando && (
            <Button
              size="sm"
              onClick={() => {
                setCreado(false);
                setCreando(true);
              }}
            >
              <Plus className="size-4" /> Nuevo entrenador
            </Button>
          )
        }
      />

      {creando && (
        <NuevoEntrenador
          alCerrar={() => setCreando(false)}
          alCrear={() => {
            setCreando(false);
            setCreado(true);
          }}
        />
      )}
      {creado && (
        <p role="status" className="mb-4 rounded-lg bg-success/10 px-4 py-3 text-sm">
          Entrenador creado. Abre su ficha para descargar el QR.
        </p>
      )}

      <div className="card-surface overflow-hidden">
        {consulta.isError ? (
          <p role="alert" className="p-5 text-sm text-destructive">
            {mensajeDeError(consulta.error)}
          </p>
        ) : consulta.isPending ? (
          <p className="p-5 text-sm text-muted-foreground">Cargando…</p>
        ) : consulta.data.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Todavía no hay entrenadores.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Entrenador</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Disciplina</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {consulta.data.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <FotoPersona
                          tipo="entrenadores"
                          id={e.id}
                          tieneFoto={e.tiene_foto}
                          tamano={36}
                        />
                        <div>
                          <Link
                            to="/entrenadores/$id"
                            params={{ id: e.id }}
                            className="font-medium hover:underline"
                          >
                            {e.nombre} {e.apellido}
                          </Link>
                          <div className="text-xs text-muted-foreground">{e.rut}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{e.telefono}</td>
                    <td className="px-4 py-3">{TEXTO_DISCIPLINA[e.disciplina]}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <EstadoBadge estado={e.estado} />
                        {!e.tiene_foto && <Badge tone="danger">Sin foto</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Alta de un entrenador con sus datos y foto (obligatoria). */
function NuevoEntrenador({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: () => void }) {
  const queryClient = useQueryClient();
  const idFoto = useId();
  const [form, setForm] = useState<FormEntrenadorFicha>(FORM_ENTRENADOR_VACIO);
  const [foto, setFoto] = useState<File | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const cambiar = (c: Partial<FormEntrenadorFicha>) => setForm((f) => ({ ...f, ...c }));

  const crear = useMutation({
    mutationFn: async ({
      datos,
      archivo,
    }: {
      datos: Parameters<typeof api.panel.crearEntrenador>[0];
      archivo: File;
    }) => api.panel.crearEntrenador(datos, await comprimirFoto(archivo)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["panel"] });
      alCrear();
    },
  });

  function enviar() {
    const r = datosEntrenadorNuevo(form);
    const faltaFoto = foto ? [] : ["Falta la foto."];
    if (!r.ok || !foto) return setErrores([...(r.ok ? [] : r.errores), ...faltaFoto]);
    setErrores([]);
    crear.mutate({ datos: r.datos, archivo: foto });
  }

  const errorServidor =
    crear.error instanceof ErrorFoto
      ? crear.error.message
      : crear.error && mensajeDeError(crear.error);

  return (
    <div className="card-surface mb-6 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Nuevo entrenador</h2>
        <button onClick={alCerrar} aria-label="Cerrar" className="rounded p-1 hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo
          id="ne-nombre"
          etiqueta="Nombre"
          valor={form.nombre}
          onChange={(v) => cambiar({ nombre: v })}
        />
        <Campo
          id="ne-apellido"
          etiqueta="Apellido"
          valor={form.apellido}
          onChange={(v) => cambiar({ apellido: v })}
        />
        <Campo id="ne-rut" etiqueta="RUT" valor={form.rut} onChange={(v) => cambiar({ rut: v })} />
        <Campo
          id="ne-telefono"
          etiqueta="Teléfono"
          tipo="tel"
          valor={form.telefono}
          onChange={(v) => cambiar({ telefono: v })}
        />
        <CampoSelect
          id="ne-disciplina"
          etiqueta="Disciplina"
          valor={form.disciplina}
          onChange={(v) => cambiar({ disciplina: v })}
          opciones={DISCIPLINAS.map((d) => [d, TEXTO_DISCIPLINA[d]] as const)}
          vacio="Elegir…"
        />
        <div>
          <label
            htmlFor={idFoto}
            className="text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            Foto
          </label>
          <input
            id={idFoto}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </div>
      </div>
      {(errores.length > 0 || errorServidor) && (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errores.length > 0 ? errores.map((e) => <div key={e}>{e}</div>) : errorServidor}
        </div>
      )}
      <div className="mt-5 flex gap-3">
        <Button onClick={enviar} disabled={crear.isPending}>
          {crear.isPending ? "Creando…" : "Crear entrenador"}
        </Button>
        <Button variant="ghost" onClick={alCerrar} disabled={crear.isPending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
