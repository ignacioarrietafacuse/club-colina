CREATE TABLE "fichas_previas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitud_id" uuid NOT NULL,
	"jugador_id" uuid,
	"apoderado_id" uuid,
	"datos" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fichas_previas_jugador_key" UNIQUE("jugador_id"),
	CONSTRAINT "fichas_previas_apoderado_key" UNIQUE("apoderado_id"),
	CONSTRAINT "fichas_previas_una_persona_check" CHECK (num_nonnulls("jugador_id", "apoderado_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD COLUMN "titular_apoderado_id" uuid;--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD COLUMN "titular_jugador_id" uuid;--> statement-breakpoint
ALTER TABLE "fichas_previas" ADD CONSTRAINT "fichas_previas_solicitud_id_solicitudes_registro_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_registro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichas_previas" ADD CONSTRAINT "fichas_previas_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichas_previas" ADD CONSTRAINT "fichas_previas_apoderado_id_apoderados_id_fk" FOREIGN KEY ("apoderado_id") REFERENCES "public"."apoderados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fichas_previas_solicitud_idx" ON "fichas_previas" USING btree ("solicitud_id");--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD CONSTRAINT "solicitudes_registro_titular_apoderado_id_apoderados_id_fk" FOREIGN KEY ("titular_apoderado_id") REFERENCES "public"."apoderados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD CONSTRAINT "solicitudes_registro_titular_jugador_id_jugadores_id_fk" FOREIGN KEY ("titular_jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD CONSTRAINT "solicitudes_un_titular_check" CHECK (num_nonnulls("titular_apoderado_id", "titular_jugador_id") <= 1);--> statement-breakpoint
ALTER TABLE "solicitudes_registro" ADD CONSTRAINT "solicitudes_segundo_sin_titular_check" CHECK ("tipo" <> 'segundo_apoderado' OR num_nonnulls("titular_apoderado_id", "titular_jugador_id") = 0);