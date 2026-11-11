/**
 * Página vacía del esqueleto de la Ola 0. Cada sesión de la Ola 1 la reemplaza en sus
 * páginas. No es un dato de ejemplo: solo dice qué ruta es.
 */
export function PaginaVacia({ titulo }: { titulo: string }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">En construcción.</p>
    </div>
  );
}
