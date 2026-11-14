CREATE TABLE "suscripcion_servicio" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"modo" text NOT NULL,
	"flow_customer_id" text NOT NULL,
	"flow_subscription_id" text,
	"email" text NOT NULL,
	"registro_token_hash" text,
	"registro_token_expira" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suscripcion_servicio_una_fila_check" CHECK ("id" = 1),
	CONSTRAINT "suscripcion_servicio_modo_check" CHECK ("modo" IN ('sandbox', 'produccion'))
);
