import { Marco } from "@/components/public/Marco";
import { Registro } from "@/components/public/registro/Registro";

/** `/registro`: el link que Mony comparte por los grupos del club. */
export function RegistroPage() {
  return (
    <Marco titulo="Registro">
      <Registro baseUrl={window.location.origin} />
    </Marco>
  );
}
