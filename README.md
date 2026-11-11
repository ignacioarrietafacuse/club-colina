# Club Colina

Sistema a medida para Club Basketball Colina y Club Voleibol Colina: jugadores,
apoderados, entrenadores, registro por link y credenciales QR (Etapa 1).

| Carpeta | Qué es | Dónde corre |
|---|---|---|
| `frontend/` | SPA (Vite, React, TanStack Router) | Vercel |
| `backend/` | API (Node, Fastify, Drizzle) y migraciones | Railway, con Postgres |
| `shared/` | Contrato de la API en zod, usado por frontend y backend | — |
| `docs/` | PRD, diseño de credenciales, roadmap y flujo de trabajo | — |

- Cómo se trabaja: [`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md).
- Instrucciones para agentes y comandos: [`CLAUDE.md`](CLAUDE.md).
