import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

// In-memory "DB" for the topic example
const incidents: Array<{ id: string; title: string }> = [];

export default async function incidentRoutes(app: FastifyInstance) {
  app.post(
    '/',
    { config: { idempotent: true } }, // <-- opts this route into the plugin
    async (req, reply) => {
      const { title } = req.body as { title: string };

      const incident = { id: randomUUID(), title };
      incidents.push(incident);

      reply.code(201);
      return incident;
    }
  );
}