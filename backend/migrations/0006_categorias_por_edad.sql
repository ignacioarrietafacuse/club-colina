-- destructiva-aprobada: 2026-11-14
-- Aprobada por Ignacio (2026-11-14): la categoría se calcula siempre por edad de temporada
-- (temporada − año de nacimiento) y nunca se guarda. `categorias` pasa de años fijos a edades
-- (UN cubre N−1 y N) y `jugadores.categoria_id` se reemplaza por la marca U11 F de una temporada.
-- Ignacio confirmó 0 jugadores en producción antes de migrar. Por si acaso, la guarda de abajo
-- hace fallar la migración (y el arranque) si hay alguno: así no se pierde ninguna categoría real.
-- El candado evita que entre un jugador entre la revisión y el DROP (corre en la transacción del migrador).
LOCK TABLE "jugadores" IN ACCESS EXCLUSIVE MODE;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "jugadores") THEN
    RAISE EXCEPTION '0006: hay jugadores; esta migración se aprobó solo con la tabla vacía';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "jugadores" DROP CONSTRAINT "jugadores_categoria_id_categorias_id_fk";--> statement-breakpoint
DROP INDEX "jugadores_categoria_idx";--> statement-breakpoint
ALTER TABLE "jugadores" DROP COLUMN "categoria_id";--> statement-breakpoint
ALTER TABLE "jugadores" ADD COLUMN "u11f_temporada" smallint;--> statement-breakpoint
-- Ya nada apunta a `categorias`: se rehace con la tabla del club.
DELETE FROM "categorias";--> statement-breakpoint
ALTER TABLE "categorias" DROP CONSTRAINT "categorias_anios_check";--> statement-breakpoint
ALTER TABLE "categorias" DROP COLUMN "anio_desde";--> statement-breakpoint
ALTER TABLE "categorias" DROP COLUMN "anio_hasta";--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "edad_min" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "edad_max" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_edades_check" CHECK ("edad_min" <= "edad_max");--> statement-breakpoint
-- Regla del club (básquet y vóley): UN = edad de temporada N−1 o N. Básquet impares, vóley pares
-- (sin U10). U11 F no se calcula: la marca Mony en la ficha; sus edades son solo de referencia.
INSERT INTO "categorias" ("nombre", "disciplina", "edad_min", "edad_max", "se_calcula") VALUES
  ('U9', 'basketball', 8, 9, true),
  ('U11', 'basketball', 10, 11, true),
  ('U11 F', 'basketball', 10, 11, false),
  ('U13', 'basketball', 12, 13, true),
  ('U15', 'basketball', 14, 15, true),
  ('U17', 'basketball', 16, 17, true),
  ('U19', 'basketball', 18, 19, true),
  ('U21', 'basketball', 20, 21, true),
  ('U12', 'voleibol', 11, 12, true),
  ('U14', 'voleibol', 13, 14, true),
  ('U16', 'voleibol', 15, 16, true),
  ('U18', 'voleibol', 17, 18, true);
