-- destructiva-aprobada: 2026-11-12
-- Aprobada por Ignacio porque solo amplía la lista del CHECK de `avisos` con
-- 'hijo_precargado_completado_por_rut' y 'cambios_bloqueados_por_otra_solicitud'. El DROP es del
-- CHECK, no de datos: todas las filas actuales cumplen la lista nueva (es un superconjunto de la
-- anterior) y el código en producción solo escribe avisos que ya existían.
ALTER TABLE "solicitudes_registro" DROP CONSTRAINT "solicitudes_avisos_check";--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD CONSTRAINT "solicitudes_avisos_check" CHECK ("avisos" <@ ARRAY['titular_ya_registrado', 'telefono_distinto_base', 'hijo_con_otro_apoderado', 'apoderado_nuevo_para_hijo_registrado', 'hijo_marcado_ya_no_esta', 'otro_apoderado_ya_registrado', 'sin_telefono_en_base', 'hay_solicitud_posterior', 'hijo_precargado_completado_por_rut', 'cambios_bloqueados_por_otra_solicitud']::text[]);