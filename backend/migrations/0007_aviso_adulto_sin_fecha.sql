-- destructiva-aprobada: 2026-11-14
-- Aprobada por Ignacio en el chat (2026-11-14). Igual que 0003: solo amplía la lista del CHECK de
-- `avisos` con 'adulto_precargado_sin_fecha_en_base' y 'nombre_distinto_base'. El DROP es del CHECK,
-- no de datos: ninguna columna ni tabla cambia, y todas las filas cumplen la lista nueva (es un
-- superconjunto de la anterior). Con respaldo manual antes de fusionar.
ALTER TABLE "solicitudes_registro" DROP CONSTRAINT "solicitudes_avisos_check";--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD CONSTRAINT "solicitudes_avisos_check" CHECK ("avisos" <@ ARRAY['titular_ya_registrado', 'telefono_distinto_base', 'hijo_con_otro_apoderado', 'apoderado_nuevo_para_hijo_registrado', 'hijo_marcado_ya_no_esta', 'otro_apoderado_ya_registrado', 'sin_telefono_en_base', 'hay_solicitud_posterior', 'hijo_precargado_completado_por_rut', 'cambios_bloqueados_por_otra_solicitud', 'adulto_precargado_sin_fecha_en_base', 'nombre_distinto_base']::text[]);