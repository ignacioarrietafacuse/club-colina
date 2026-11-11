CREATE TABLE "apoderados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text,
	"apellido" text,
	"rut" text NOT NULL,
	"telefono" text,
	"email" text,
	"metodo_pago" text,
	"foto_id" uuid,
	"credencial_token" text,
	"estado" text DEFAULT 'precargado' NOT NULL,
	"origen" text NOT NULL,
	"solicitud_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apoderados_rut_unique" UNIQUE("rut"),
	CONSTRAINT "apoderados_credencial_token_unique" UNIQUE("credencial_token"),
	CONSTRAINT "apoderados_rut_check" CHECK ("rut" ~ '^[0-9]{7,8}-[0-9K]$'),
	CONSTRAINT "apoderados_telefono_check" CHECK ("telefono" ~ '^[0-9]{9}$'),
	CONSTRAINT "apoderados_email_check" CHECK ("email" = lower("email")),
	CONSTRAINT "apoderados_metodo_pago_check" CHECK ("metodo_pago" IN ('forpay_mensual', 'transferencia_anual', 'tarjeta_credito_anual')),
	CONSTRAINT "apoderados_estado_check" CHECK ("estado" IN ('precargado', 'pendiente', 'activo', 'rechazado', 'inactivo')),
	CONSTRAINT "apoderados_origen_check" CHECK ("origen" IN ('base_2026', 'formulario')),
	CONSTRAINT "apoderados_activo_completo_check" CHECK ("estado" <> 'activo' OR ("nombre" IS NOT NULL AND "apellido" IS NOT NULL AND "telefono" IS NOT NULL AND "foto_id" IS NOT NULL AND "credencial_token" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categorias_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"disciplina" text NOT NULL,
	"anio_desde" smallint NOT NULL,
	"anio_hasta" smallint NOT NULL,
	"se_calcula" boolean DEFAULT true NOT NULL,
	CONSTRAINT "categorias_disciplina_nombre_key" UNIQUE("disciplina","nombre"),
	CONSTRAINT "categorias_disciplina_check" CHECK ("disciplina" IN ('basketball', 'voleibol')),
	CONSTRAINT "categorias_anios_check" CHECK ("anio_desde" <= "anio_hasta")
);
--> statement-breakpoint
CREATE TABLE "entrenadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"rut" text NOT NULL,
	"telefono" text NOT NULL,
	"disciplina" text NOT NULL,
	"foto_id" uuid NOT NULL,
	"credencial_token" text,
	"estado" text DEFAULT 'activo' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entrenadores_rut_unique" UNIQUE("rut"),
	CONSTRAINT "entrenadores_credencial_token_unique" UNIQUE("credencial_token"),
	CONSTRAINT "entrenadores_rut_check" CHECK ("rut" ~ '^[0-9]{7,8}-[0-9K]$'),
	CONSTRAINT "entrenadores_telefono_check" CHECK ("telefono" ~ '^[0-9]{9}$'),
	CONSTRAINT "entrenadores_disciplina_check" CHECK ("disciplina" IN ('basketball', 'voleibol')),
	CONSTRAINT "entrenadores_estado_check" CHECK ("estado" IN ('activo', 'inactivo')),
	CONSTRAINT "entrenadores_activo_token_check" CHECK ("estado" <> 'activo' OR "credencial_token" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "fotos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fotos_mime_check" CHECK ("mime" IN ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "fotos_tamano_check" CHECK (octet_length("bytes") BETWEEN 1 AND 2097152)
);
--> statement-breakpoint
CREATE TABLE "jugador_apoderado" (
	"jugador_id" uuid NOT NULL,
	"apoderado_id" uuid NOT NULL,
	"paga_mensualidad" boolean DEFAULT false NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jugador_apoderado_jugador_id_apoderado_id_pk" PRIMARY KEY("jugador_id","apoderado_id"),
	CONSTRAINT "jugador_apoderado_estado_check" CHECK ("estado" IN ('pendiente', 'activo'))
);
--> statement-breakpoint
CREATE TABLE "jugadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text,
	"apellido" text,
	"rut" text NOT NULL,
	"fecha_nacimiento" date,
	"disciplina" text NOT NULL,
	"categoria_id" smallint,
	"numero_camiseta" text,
	"postula_beca" boolean DEFAULT false NOT NULL,
	"beca_mensualidad_pct" smallint DEFAULT 0 NOT NULL,
	"beca_torneos_pct" smallint DEFAULT 0 NOT NULL,
	"beca_campus_pct" smallint DEFAULT 0 NOT NULL,
	"telefono" text,
	"email" text,
	"metodo_pago" text,
	"marcado_retiro_en" timestamp with time zone,
	"foto_id" uuid,
	"credencial_token" text,
	"estado" text DEFAULT 'precargado' NOT NULL,
	"origen" text NOT NULL,
	"solicitud_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jugadores_rut_unique" UNIQUE("rut"),
	CONSTRAINT "jugadores_credencial_token_unique" UNIQUE("credencial_token"),
	CONSTRAINT "jugadores_rut_check" CHECK ("rut" ~ '^[0-9]{7,8}-[0-9K]$'),
	CONSTRAINT "jugadores_telefono_check" CHECK ("telefono" ~ '^[0-9]{9}$'),
	CONSTRAINT "jugadores_email_check" CHECK ("email" = lower("email")),
	CONSTRAINT "jugadores_disciplina_check" CHECK ("disciplina" IN ('basketball', 'voleibol')),
	CONSTRAINT "jugadores_numero_check" CHECK ("numero_camiseta" ~ '^[0-9]{1,2}$'),
	CONSTRAINT "jugadores_becas_check" CHECK ("beca_mensualidad_pct" BETWEEN 0 AND 100 AND "beca_torneos_pct" BETWEEN 0 AND 100 AND "beca_campus_pct" BETWEEN 0 AND 100),
	CONSTRAINT "jugadores_metodo_pago_check" CHECK ("metodo_pago" IN ('forpay_mensual', 'transferencia_anual', 'tarjeta_credito_anual')),
	CONSTRAINT "jugadores_estado_check" CHECK ("estado" IN ('precargado', 'pendiente', 'activo', 'rechazado', 'inactivo')),
	CONSTRAINT "jugadores_origen_check" CHECK ("origen" IN ('base_2026', 'formulario')),
	CONSTRAINT "jugadores_activo_completo_check" CHECK ("estado" <> 'activo' OR ("nombre" IS NOT NULL AND "apellido" IS NOT NULL AND "fecha_nacimiento" IS NOT NULL AND "numero_camiseta" IS NOT NULL AND "foto_id" IS NOT NULL AND "credencial_token" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitudes_registro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"token_acceso" text NOT NULL,
	"consentimiento_en" timestamp with time zone,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"revisada_en" timestamp with time zone,
	"tipo" text DEFAULT 'formulario' NOT NULL,
	"coincide_base" boolean DEFAULT false NOT NULL,
	CONSTRAINT "solicitudes_registro_token_acceso_unique" UNIQUE("token_acceso"),
	CONSTRAINT "solicitudes_estado_check" CHECK ("estado" IN ('pendiente', 'revisada')),
	CONSTRAINT "solicitudes_tipo_check" CHECK ("tipo" IN ('formulario', 'segundo_apoderado')),
	CONSTRAINT "solicitudes_consentimiento_check" CHECK ("tipo" = 'segundo_apoderado' OR "consentimiento_en" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario" text NOT NULL,
	"nombre" text NOT NULL,
	"password_hash" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_usuario_unique" UNIQUE("usuario")
);
--> statement-breakpoint
ALTER TABLE "apoderados" ADD CONSTRAINT "apoderados_foto_id_fotos_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."fotos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apoderados" ADD CONSTRAINT "apoderados_solicitud_id_solicitudes_registro_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_registro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrenadores" ADD CONSTRAINT "entrenadores_foto_id_fotos_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."fotos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jugador_apoderado" ADD CONSTRAINT "jugador_apoderado_jugador_id_jugadores_id_fk" FOREIGN KEY ("jugador_id") REFERENCES "public"."jugadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jugador_apoderado" ADD CONSTRAINT "jugador_apoderado_apoderado_id_apoderados_id_fk" FOREIGN KEY ("apoderado_id") REFERENCES "public"."apoderados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_foto_id_fotos_id_fk" FOREIGN KEY ("foto_id") REFERENCES "public"."fotos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jugadores" ADD CONSTRAINT "jugadores_solicitud_id_solicitudes_registro_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "public"."solicitudes_registro"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apoderados_estado_idx" ON "apoderados" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "apoderados_solicitud_idx" ON "apoderados" USING btree ("solicitud_id");--> statement-breakpoint
CREATE INDEX "jugador_apoderado_apoderado_idx" ON "jugador_apoderado" USING btree ("apoderado_id");--> statement-breakpoint
CREATE INDEX "jugadores_estado_idx" ON "jugadores" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "jugadores_categoria_idx" ON "jugadores" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "jugadores_solicitud_idx" ON "jugadores" USING btree ("solicitud_id");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_idx" ON "sesiones" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sesiones_expira_idx" ON "sesiones" USING btree ("expira_en");--> statement-breakpoint
CREATE INDEX "solicitudes_estado_idx" ON "solicitudes_registro" USING btree ("estado");