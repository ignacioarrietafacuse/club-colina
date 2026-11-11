import { createFileRoute } from "@tanstack/react-router";
import { UserCog, Plus, Download, Mail, Phone, MessageSquare, Users as UsersIcon, Clock } from "lucide-react";
import { PageHeader, Button, Badge, StatCard, Avatar } from "@/components/app/ui";
import { apoderados } from "@/lib/mock-data";

export const Route = createFileRoute("/apoderados")({
  head: () => ({ meta: [
    { title: "Apoderados — Club Colina" },
    { name: "description", content: "Base de apoderados del club." },
    { property: "og:title", content: "Apoderados — Club Colina" },
    { property: "og:description", content: "Gestión de apoderados." },
  ]}),
  component: Apoderados,
});

function Apoderados() {
  return (
    <div>
      <PageHeader
        icon={<UserCog className="size-5" />}
        title="Apoderados"
        subtitle={`${apoderados.length} familias vinculadas al club`}
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="size-4" /> Exportar</Button>
            <Button variant="outline" size="sm"><MessageSquare className="size-4" /> Enviar circular</Button>
            <Button size="sm"><Plus className="size-4" /> Nuevo apoderado</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total apoderados" value={String(apoderados.length)} />
        <StatCard label="Con pagos al día" value={String(apoderados.filter(a => a.estadoPago === "Al día").length)} delta="82%" />
        <StatCard label="Pendientes" value={String(apoderados.filter(a => a.estadoPago === "Pendiente").length)} deltaTone="neutral" />
        <StatCard label="Atrasados" value={String(apoderados.filter(a => a.estadoPago === "Atrasado").length)} deltaTone="negative" delta="Requiere gestión" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {apoderados.slice(0, 18).map(a => (
          <div key={a.id} className="card-surface p-5 card-hover">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <Avatar name={a.nombre} size={44} />
                <div>
                  <div className="font-semibold text-sm">{a.nombre}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1"><UsersIcon className="size-3" /> {a.hijos} {a.hijos === 1 ? "hijo/a" : "hijos/as"} en el club</div>
                </div>
              </div>
              <Badge tone={a.estadoPago === "Al día" ? "success" : a.estadoPago === "Pendiente" ? "warning" : "danger"}>{a.estadoPago}</Badge>
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2"><Mail className="size-3.5" /> {a.email}</div>
              <div className="flex items-center gap-2"><Phone className="size-3.5" /> {a.telefono}</div>
              <div className="flex items-center gap-2"><Clock className="size-3.5" /> Última comunicación: <span className="text-foreground">{a.ultimaComunicacion}</span> · {a.canalComunicacion}</div>
            </div>
            <div className="mt-4 flex items-center justify-between pt-3 border-t">
              <div className="text-[11px] text-muted-foreground">Último pago: {a.ultimoPago}</div>
              <div className="flex gap-1">
                <button title="Email" className="p-1.5 rounded-md hover:bg-muted transition"><Mail className="size-3.5" /></button>
                <button title="Llamar" className="p-1.5 rounded-md hover:bg-muted transition"><Phone className="size-3.5" /></button>
                <button title="WhatsApp" className="p-1.5 rounded-md hover:bg-muted transition"><MessageSquare className="size-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
