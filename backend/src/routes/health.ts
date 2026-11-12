import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

export async function rutasHealth(app: FastifyInstance) {
  app.get("/api/health", async (request, reply) => {
    try {
      await app.db.execute(sql`select 1`);
      return { estado: "ok" };
    } catch (error) {
      request.log.error({ err: error }, "health: la base no responde");
      return reply.status(503).send({ estado: "error" });
    }
  });
}
