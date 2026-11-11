/**
 * Guarda de las rutas del panel. S4 la implementa: sin sesión (GET /api/auth/me
 * responde 401) o ante un error, redirige a /login. Denegar por defecto.
 */
export async function guardaPanel(): Promise<void> {}
