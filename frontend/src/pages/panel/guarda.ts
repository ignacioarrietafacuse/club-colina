import { redirect } from "@tanstack/react-router";

/**
 * Guarda de las rutas del panel. Denegar por defecto: mientras S4 no la implemente,
 * manda todo a /login. S4 la reemplaza: con sesión (GET /api/auth/me responde 200) deja
 * pasar; sin sesión o ante cualquier error, redirige a /login.
 */
export async function guardaPanel(): Promise<void> {
  throw redirect({ to: "/login" });
}
