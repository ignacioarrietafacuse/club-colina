/**
 * Candados de Postgres (`pg_advisory_xact_lock`) compartidos entre módulos.
 *
 * `CANDADO_SOLICITUDES`: una solicitud a la vez. Lo toman S2 al recibir una solicitud (que escribe
 * `fichas_previas` antes de modificar a alguien que ya existía) y el panel al aprobar o rechazar
 * (que restaura o borra esas copias). Así una solicitud en paralelo nunca copia como "original" una
 * ficha a medio restaurar. Se toma al principio de la transacción, antes de cualquier fila.
 */
export const CANDADO_SOLICITUDES = 7_402_031;
