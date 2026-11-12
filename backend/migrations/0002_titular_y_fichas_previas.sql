CREATE TABLE "fichas_previas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitud_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"persona_id" uuid NOT NULL,
	"datos" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fichas_previas_solicitud_persona_key" UNIQUE("solicitud_id","tipo","persona_id"),
	CONSTRAINT "fichas_previas_tipo_check" CHECK ("tipo" IN ('jugador', 'apoderado'))
);
--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD COLUMN "titular_apoderado_id" uuid;--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD COLUMN "titular_jugador_id" uuid;--> statement-breakpoint
ALTER TABLE "fichas_previas" ADD CONSTRAINT "fichas_previas_solicitud_id_solicitudes_registro_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_registro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fichas_previas_persona_idx" ON "fichas_previas" USING btree ("persona_id");--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD CONSTRAINT "solicitudes_registro_titular_apoderado_id_apoderados_id_fk" FOREIGN KEY ("titular_apoderado_id") REFERENCES "public"."apoderados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD CONSTRAINT "solicitudes_registro_titular_jugador_id_jugadores_id_fk" FOREIGN KEY ("titular_jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD CONSTRAINT "solicitudes_un_titular_check" CHECK (num_nonnulls("titular_apoderado_id", "titular_jugador_id") <= 1);