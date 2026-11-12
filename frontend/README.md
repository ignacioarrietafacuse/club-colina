# Frontend — Club Colina

SPA con Vite, React 19, TanStack Router (rutas por archivo en `src/routes/`), TanStack
Query, Tailwind 4 y shadcn/ui. Origen del diseño: el proyecto de Lovable `cc-frontend`
(ya desconectado; sus pantallas de referencia y datos de ejemplo se borraron en la Ola 1).

- `src/routes/`: archivos de ruta delgados, fijados en la Ola 0. Solo importan páginas.
- `src/pages/panel/` y `src/components/panel/`: panel (sesión S4).
- `src/pages/public/` y `src/components/public/`: registro, link de familia, link del
  segundo apoderado y verificación `/c/:token` (sesión S5).
- `src/lib/api/`: cliente tipado contra el contrato de `shared/` (lo crea S4).

En local, `pnpm dev` levanta Vite en el puerto 5173 y reenvía `/api` al backend en el
puerto 3000. En producción, Vercel hace lo mismo con la reescritura de `vercel.json`.
